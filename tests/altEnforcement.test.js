const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionsBitField } = require('discord.js');

const dbStore = require('../utils/dbStore');
const D = require('../utils/altDetectionData');
const { handleMessage } = require('../utils/altDetectionSystem');
const { enforceBlacklistedIpJoin } = require('../utils/altEnforcement');

const GUILD_ID = 'guild-enforcement-test';
const USER_A = '123456789012345678';
const USER_B = '123456789012345679';
const USER_C = '123456789012345680';
const USER_D = '123456789012345681';

function makeMember(id, banCalls) {
  return {
    id,
    user: { bot: false },
    ban: async () => banCalls.push(id),
    roles: { highest: { position: 1 } },
    guild: { id: GUILD_ID },
  };
}

function makeMessage(target, banCalls, memberMap = new Map(), command = 'banip', unbanCalls = [], attachments = [], options = {}) {
  const targetMember = makeMember(target, banCalls);
  const fetchedChannelIds = [];
  const channelMessages = [];
  return {
    fetchedChannelIds,
    channelMessages,
    guildId: GUILD_ID,
    guild: {
      id: GUILD_ID,
      members: {
        fetch: async id => memberMap.get(id) || targetMember,
        me: {
          permissions: { has: permission => permission === PermissionsBitField.Flags.BanMembers },
          roles: { highest: { position: 10 } },
        },
      },
      bans: {
        fetch: async () => command.startsWith('unban') ? {} : null,
        remove: async id => unbanCalls.push(id),
      },
    },
    member: {
      permissions: {
        has: permission => permission === PermissionsBitField.Flags.BanMembers && options.canBan === true,
      },
      roles: {
        cache: { has: roleId => options.isSuperadmin !== false && roleId === '1386874017105051759' },
        highest: { position: 5 },
      },
    },
    author: { id: 'moderator-1', toString: () => '<@moderator-1>' },
    mentions: { users: { first: () => null } },
    attachments,
    content: `g!${command} ${target}`,
    client: {
      channels: {
        fetch: async id => {
          fetchedChannelIds.push(id);
          return { send: async payload => channelMessages.push({ id, payload }) };
        },
      },
    },
    reply: async () => null,
  };
}

async function withIsolatedDatabase(callback) {
  const original = dbStore.get('alt_detection');
  try {
    dbStore.set('alt_detection', {
      verifications: [],
      bans: [],
      flagLogs: [],
      guildConfig: { [GUILD_ID]: { superadminRoleId: '1386874017105051759' } },
      blacklistedSignals: [],
    });
    await callback();
  } finally {
    if (original === undefined) dbStore.delete('alt_detection');
    else dbStore.set('alt_detection', original);
  }
}

test('banip blacklists IP, real-bans target, and join enforcement respects removal', async () => {
  await withIsolatedDatabase(async () => {
    const banCalls = [];
    D.addVerification({ guildId: GUILD_ID, discordId: USER_A, ipHash: 'ip-shared', fingerprintHash: 'fp-shared' });

    await handleMessage(makeMessage(USER_A, banCalls));

    assert.deepEqual(banCalls, [USER_A]);
    assert.equal(D.matches(GUILD_ID, { ipHash: 'ip-shared' }).ip.length, 1);
    assert.equal(D.latestBan(GUILD_ID, USER_A).status, 'banned');
    const banAudit = (dbStore.get('alt_detection').flagLogs || []).find(item => item.action === 'BAN_IP' && item.status === 'SUCCESS');
    assert.ok(banAudit);

    D.addVerification({ guildId: GUILD_ID, discordId: USER_B, ipHash: 'ip-shared', fingerprintHash: 'fp-shared' });
    const memberB = makeMember(USER_B, banCalls);
    memberB.guild = { id: GUILD_ID };
    const firstJoin = await enforceBlacklistedIpJoin(memberB);
    const duplicateJoin = await enforceBlacklistedIpJoin(memberB);
    assert.equal(firstJoin.banned, true);
    assert.equal(duplicateJoin.duplicate, true);
    assert.equal(banCalls.filter(id => id === USER_B).length, 1);
    assert.ok((dbStore.get('alt_detection').flagLogs || []).some(item => item.action === 'JOIN_BLACKLISTED_IP' && item.status === 'SUCCESS'));

    D.addVerification({ guildId: GUILD_ID, discordId: USER_D, ipHash: 'ip-shared', fingerprintHash: 'fp-different' });
    const memberD = makeMember(USER_D, banCalls);
    memberD.guild = { id: GUILD_ID };
    const ipOnlyMatch = await enforceBlacklistedIpJoin(memberD);
    assert.equal(ipOnlyMatch.banned, true);
    assert.equal(banCalls.filter(id => id === USER_D).length, 1);

    const ban = D.latestBan(GUILD_ID, USER_A);
    D.unban(USER_A, GUILD_ID, 'moderator-1', 'review selesai');
    assert.equal(D.matches(GUILD_ID, { ipHash: ban.ipHash }).ip.length, 0);
    assert.ok((dbStore.get('alt_detection').flagLogs || []).some(item => item.action === 'UNBLACKLIST_IP'));

    D.addVerification({ guildId: GUILD_ID, discordId: USER_C, ipHash: 'ip-shared', fingerprintHash: 'fp-shared' });
    const memberC = makeMember(USER_C, banCalls);
    memberC.guild = { id: GUILD_ID };
    const allowedJoin = await enforceBlacklistedIpJoin(memberC);
    assert.equal(allowedJoin.banned, false);
    assert.equal(banCalls.filter(id => id === USER_C).length, 0);
  });
});

test('banip and unbanip process related accounts only when both hashes match', async () => {
  await withIsolatedDatabase(async () => {
    const banCalls = [];
    const memberMap = new Map([
      [USER_B, makeMember(USER_B, banCalls)],
      [USER_C, makeMember(USER_C, banCalls)],
      [USER_D, makeMember(USER_D, banCalls)],
    ]);
    D.addVerification({ guildId: GUILD_ID, discordId: USER_A, ipHash: 'ip-same', fingerprintHash: 'fp-same' });
    D.addVerification({ guildId: GUILD_ID, discordId: USER_B, ipHash: 'ip-same', fingerprintHash: 'fp-same' });
    D.addVerification({ guildId: GUILD_ID, discordId: USER_C, ipHash: 'ip-same', fingerprintHash: 'fp-different' });
    D.addVerification({ guildId: GUILD_ID, discordId: USER_D, ipHash: 'ip-different', fingerprintHash: 'fp-same' });
    assert.deepEqual(
      D.linkedRecords(GUILD_ID, D.latestVerification(GUILD_ID, USER_A)).map(record => record.discordId),
      [USER_B],
    );

    const banMessage = makeMessage(USER_A, banCalls, memberMap);
    const replies = [];
    banMessage.reply = async payload => replies.push(payload);
    await handleMessage(banMessage);

    assert.ok(banMessage.fetchedChannelIds.includes('1425864807739035698'));
    assert.ok(banMessage.channelMessages.some(item => item.id === '1425864807739035698' && item.payload.embeds));
    assert.deepEqual(banCalls, [USER_A, USER_B]);
    assert.equal(D.latestBan(GUILD_ID, USER_A).status, 'banned');
    assert.equal(D.latestBan(GUILD_ID, USER_B).status, 'banned');
    assert.equal(D.latestBan(GUILD_ID, USER_C), null);
    assert.equal(D.latestBan(GUILD_ID, USER_D), null);
    const banEmbed = replies[0].embeds[0];
    const relatedBanField = banEmbed.data.fields.find(field => field.name === 'Akun terkait (IP + fingerprint cocok)');
    assert.equal(relatedBanField.value, USER_B);

    const data = dbStore.get('alt_detection');
    data.blacklistedSignals = [
      { guildId: GUILD_ID, sourceDiscordId: USER_A, ipHash: 'ip-same', fingerprintHash: 'fp-same', active: true },
      { guildId: GUILD_ID, sourceDiscordId: USER_B, ipHash: 'ip-same', fingerprintHash: 'fp-same', active: true },
      { guildId: GUILD_ID, sourceDiscordId: USER_C, ipHash: 'ip-same', active: true },
      { guildId: GUILD_ID, sourceDiscordId: USER_D, fingerprintHash: 'fp-same', active: true },
    ];
    dbStore.set('alt_detection', data);
    D.addBan({ guildId: GUILD_ID, discordId: USER_C, ipHash: 'ip-same', fingerprintHash: 'fp-different' });
    D.addBan({ guildId: GUILD_ID, discordId: USER_D, ipHash: 'ip-different', fingerprintHash: 'fp-same' });

    const unbanCalls = [];
    const unbanMessage = makeMessage(USER_A, [], memberMap, 'unbanip', unbanCalls);
    const unbanReplies = [];
    unbanMessage.reply = async payload => unbanReplies.push(payload);
    await handleMessage(unbanMessage);

    assert.ok(unbanMessage.fetchedChannelIds.includes('1425864807739035698'));
    assert.ok(unbanMessage.channelMessages.some(item => item.id === '1425864807739035698' && item.payload.embeds));
    assert.deepEqual(unbanCalls, [USER_A, USER_B]);
    assert.equal(D.latestBanHistory(GUILD_ID, USER_A).status, 'unbanned');
    assert.equal(D.latestBanHistory(GUILD_ID, USER_B).status, 'unbanned');
    assert.equal(D.latestBan(GUILD_ID, USER_C).status, 'banned');
    assert.equal(D.latestBan(GUILD_ID, USER_D).status, 'banned');
    const unbanEmbed = unbanReplies[0].embeds[0];
    const relatedUnbanField = unbanEmbed.data.fields.find(field => field.name === 'Akun terkait (IP + fingerprint cocok)');
    assert.equal(relatedUnbanField.value, USER_B);
    assert.ok(dbStore.get('alt_detection').blacklistedSignals.some(signal => signal.sourceDiscordId === USER_A && !signal.active));
    assert.ok(dbStore.get('alt_detection').blacklistedSignals.some(signal => signal.sourceDiscordId === USER_B && !signal.active));
    assert.ok(dbStore.get('alt_detection').blacklistedSignals.some(signal => signal.sourceDiscordId === USER_C && !signal.active));
    assert.ok(dbStore.get('alt_detection').blacklistedSignals.some(signal => signal.sourceDiscordId === USER_D && signal.active));
  });
});

test('g!ban sends photo output only to the photo channel and embeds the image', async () => {
  await withIsolatedDatabase(async () => {
    const banCalls = [];
    const photoUrl = 'https://cdn.discordapp.com/attachments/test/evidence.png';
    const message = makeMessage(USER_A, banCalls, new Map(), 'ban', [], [
      { name: 'evidence.png', contentType: 'image/png', url: photoUrl },
    ], { canBan: true, isSuperadmin: false });
    await handleMessage(message);

    assert.deepEqual(banCalls, [USER_A]);
    assert.equal(dbStore.get('alt_detection').blacklistedSignals.length, 0);
    assert.equal(D.latestBan(GUILD_ID, USER_A), null);
    assert.ok(dbStore.get('alt_detection').flagLogs.some(item => item.action === 'BAN_ACCOUNT' && item.status === 'SUCCESS'));
    assert.ok(message.channelMessages.some(item =>
      item.id === '1552271167006441533' && item.payload.embeds?.[0]?.data?.image?.url === photoUrl
    ));
    assert.equal(message.channelMessages.some(item => item.id === '1425864807739035698'), false);
  });
});

test('g!ban without a photo sends account-only output to the regular ban channel', async () => {
  await withIsolatedDatabase(async () => {
    const banCalls = [];
    const message = makeMessage(USER_A, banCalls, new Map(), 'ban', [], [], { canBan: true, isSuperadmin: false });
    await handleMessage(message);

    assert.deepEqual(banCalls, [USER_A]);
    assert.equal(dbStore.get('alt_detection').blacklistedSignals.length, 0);
    assert.ok(message.channelMessages.some(item => item.id === '1425864807739035698' && item.payload.embeds));
    assert.equal(message.channelMessages.some(item => item.id === '1552271167006441533'), false);
  });
});
