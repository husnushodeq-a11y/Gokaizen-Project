const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const dbStore = require('./utils/dbStore');

const ACCENT_COLOR = 0x1abc9c;
const STATUS_KEY = 'gbm_status';
const OWNER_KEY = 'gbm_owners';
const FULL_FETCH_INTERVAL = 10 * 60 * 1000;
const REFRESH_INTERVAL = 2 * 60 * 1000;
const DEBOUNCE_DELAY = 5000;
const UPDATE_COOLDOWN = 3000;
const RUN_TIMEOUT = 90000;
const TOTAL_LIMIT = 3800;
const SECTION_OVERHEAD = 400;

const EMOJI = {
  title: '<:title:1554171252992647188>',
  public: '<:public:1554171303878197298>',
  premium: '<:premium:1554171330910359653>',
  active: '<:active:1554171487915872296>',
  available: '<:available:1554171455996960908>',
  owner: '<:owner:1554171357988659350>',
  total: '<:total:1554171225075355688>',
  clock: '<:clock:1554171421767376937>',
  success: '<:success:1554171278188089445>',
  error: '<:error:1554171388229586974>'
};

const KNOWN_MUSIC_BOTS = [
  'chip', 'euphony', 'flavi bot', 'flavibot', 'jockie music', 'hade',
  'milky music', 'muzox', 'lara', 'lunabot', 'uzox', 'swelly', 'minerea', 'nero'
];

const PRIORITY_BOTS = [
  'jockie', 'chip', 'flavi', 'euphony', 'hade',
  'milky', 'lofi', 'muzox', 'lara', 'uzox', 'swelly', 'minerea', 'nero'
];

const fetchState = new Map();
let running = false;
let queued = false;
let attached = false;
let debounceTimer = null;

function e(key) {
  return EMOJI[key] ? `${EMOJI[key]} ` : '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Proses melebihi batas waktu')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function escapeText(text) {
  return String(text).replace(/([*_~`|>\\\[\]])/g, '\\$1');
}

function logFailure(err) {
  if (err && (err.code === 50001 || err.code === 50013)) {
    console.error('[GBM] Bot tidak memiliki izin pada channel panel. Pastikan View Channel, Read Message History, dan Send Messages aktif.');
    return;
  }
  console.error('[GBM] Gagal memperbarui panel:', err && err.message ? err.message : err);
}

function getOwners() {
  return dbStore.get(OWNER_KEY) || {};
}

function isMusicBot(member) {
  if (!member || !member.user.bot) return false;
  const username = member.user.username.toLowerCase();
  const displayName = member.displayName.toLowerCase();
  return KNOWN_MUSIC_BOTS.some(name => username.includes(name) || displayName.includes(name));
}

function priorityRank(username) {
  const name = username.toLowerCase();
  const index = PRIORITY_BOTS.findIndex(item => name.includes(item));
  return index === -1 ? Infinity : index;
}

function sortBots(list) {
  return list.sort((a, b) => {
    const rankA = priorityRank(a.user.username);
    const rankB = priorityRank(b.user.username);
    if (rankA !== rankB) return rankA - rankB;
    return a.displayName.localeCompare(b.displayName);
  });
}

async function syncMembers(guild, force = false) {
  const last = fetchState.get(guild.id) || 0;
  if (force || Date.now() - last > FULL_FETCH_INTERVAL) {
    fetchState.set(guild.id, Date.now());
    await guild.members.fetch({ time: 30000 }).catch(() => null);
  }

  const missing = Object.keys(getOwners()).filter(id => !guild.members.cache.has(id));
  if (missing.length) {
    await guild.members.fetch({ user: missing }).catch(() => null);
  }
}

function resolveVoiceId(guild, member) {
  const state = guild.voiceStates.cache.get(member.id) || member.voice;
  return state && state.channelId ? state.channelId : null;
}

function ownerSuffix(ownerInfo) {
  return ownerInfo ? `, owner ${e('owner')}<@${ownerInfo.ownerId}>` : '';
}

function freeEntry(member, index, ownerInfo) {
  return `**${index + 1}.** ${escapeText(member.displayName)}${ownerSuffix(ownerInfo)}`;
}

function busyEntry(guild, member, index, ownerInfo) {
  const channelId = resolveVoiceId(guild, member);
  return `**${index + 1}.** ${escapeText(member.displayName)} di <#${channelId}>${ownerSuffix(ownerInfo)}`;
}

function groupNeed(entries) {
  return entries.reduce((sum, entry) => sum + entry.length + 1, 0);
}

function allocate(needs, total) {
  const sum = needs.reduce((a, b) => a + b, 0);
  if (sum <= total) return needs;
  return needs.map(need => Math.floor(need * total / sum));
}

function fitEntries(entries, budget) {
  const kept = [];
  let used = 0;

  for (const entry of entries) {
    if (used + entry.length + 1 > budget) break;
    kept.push(entry);
    used += entry.length + 1;
  }

  const hidden = entries.length - kept.length;
  if (hidden > 0) {
    kept.push(`-# ${hidden} bot lainnya tidak ditampilkan`);
  }

  return kept.join('\n');
}

function buildBotSection(title, groups, emptyText) {
  const blocks = groups
    .filter(group => group.entries.length)
    .map(group => `**${group.label}**\n${fitEntries(group.entries, group.budget)}`);

  const body = blocks.length ? blocks.join('\n\n') : emptyText;
  return `## ${title}\n${body}`;
}

function textBlock(content) {
  return new TextDisplayBuilder().setContent(content);
}

function divider() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function v2Payload(container) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

function buildNotice(title, body, ephemeral = false) {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(textBlock(`### ${title}\n${body}`));

  const payload = v2Payload(container);
  if (ephemeral) {
    payload.flags = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
  }
  return payload;
}

async function buildGBMPayload(guild) {
  await syncMembers(guild);

  const owners = getOwners();
  const bots = Array.from(guild.members.cache.values())
    .filter(member => member.user.bot && (owners[member.id] || isMusicBot(member)));

  const isBusy = member => Boolean(resolveVoiceId(guild, member));
  const premiumBots = sortBots(bots.filter(member => owners[member.id]));
  const publicBots = sortBots(bots.filter(member => !owners[member.id]));

  const publicFree = publicBots.filter(member => !isBusy(member));
  const publicBusy = publicBots.filter(isBusy);
  const premiumFree = premiumBots.filter(member => !isBusy(member));
  const premiumBusy = premiumBots.filter(isBusy);
  const inUse = publicBusy.length + premiumBusy.length;

  const entries = {
    publicFree: publicFree.map((member, i) => freeEntry(member, i, null)),
    publicBusy: publicBusy.map((member, i) => busyEntry(guild, member, i, null)),
    premiumFree: premiumFree.map((member, i) => freeEntry(member, i, owners[member.id])),
    premiumBusy: premiumBusy.map((member, i) => busyEntry(guild, member, i, owners[member.id]))
  };

  const header = [
    `# ${e('title')}Get Bot Music`,
    `${e('total')}Total **${bots.length}**   ${e('available')}Siap **${bots.length - inUse}**   ${e('active')}Digunakan **${inUse}**`
  ].join('\n');

  const footer = `-# ${e('clock')}Diperbarui <t:${Math.floor(Date.now() / 1000)}:R>`;

  const remaining = TOTAL_LIMIT - header.length - footer.length - SECTION_OVERHEAD;
  const [publicFreeBudget, publicBusyBudget, premiumFreeBudget, premiumBusyBudget] = allocate([
    groupNeed(entries.publicFree),
    groupNeed(entries.publicBusy),
    groupNeed(entries.premiumFree),
    groupNeed(entries.premiumBusy)
  ], remaining);

  const publicSection = buildBotSection(
    `${e('public')}Bot Musik Publik`,
    [
      { label: `${e('available')}Siap digunakan`, entries: entries.publicFree, budget: publicFreeBudget },
      { label: `${e('active')}Sedang digunakan`, entries: entries.publicBusy, budget: publicBusyBudget }
    ],
    'Tidak ada bot musik publik yang terdeteksi.'
  );

  const premiumSection = buildBotSection(
    `${e('premium')}Bot Musik Premium`,
    [
      { label: `${e('available')}Siap digunakan`, entries: entries.premiumFree, budget: premiumFreeBudget },
      { label: `${e('active')}Sedang digunakan`, entries: entries.premiumBusy, budget: premiumBusyBudget }
    ],
    'Belum ada bot musik premium yang terdaftar.'
  );

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(textBlock(header))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(textBlock(publicSection))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(textBlock(premiumSection))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(textBlock(footer));

  return v2Payload(container);
}

async function deliver(channel, messageId, payload) {
  let existing = null;

  if (messageId) {
    try {
      existing = await channel.messages.fetch(messageId);
    } catch (err) {
      if (err.code !== 10008) throw err;
    }
  }

  if (existing && existing.flags.has(MessageFlags.IsComponentsV2)) {
    try {
      return await existing.edit(payload);
    } catch (err) {
      if (err.code !== 10008) throw err;
    }
  }

  if (existing) {
    await existing.delete().catch(() => null);
  }

  return channel.send(payload);
}

async function runUpdate(client) {
  const data = dbStore.get(STATUS_KEY);
  if (!data) return;

  const guild = await client.guilds.fetch(data.guildId);
  const channel = await guild.channels.fetch(data.channelId);
  if (!channel || !channel.isTextBased()) return;

  const payload = await buildGBMPayload(guild);
  const message = await deliver(channel, data.messageId, payload);

  if (message.id !== data.messageId) {
    dbStore.set(STATUS_KEY, {
      guildId: guild.id,
      channelId: channel.id,
      messageId: message.id
    });
    console.log(`[GBM] Panel baru dibuat dan disimpan (ID: ${message.id})`);
  }
}

function scheduleUpdate(client) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => updateGBM(client), DEBOUNCE_DELAY);
}

function attachListeners(client) {
  if (attached) return;
  attached = true;

  console.log('[GBM] Listener pembaruan panel aktif');

  client.on('voiceStateUpdate', (oldState, newState) => {
    const data = dbStore.get(STATUS_KEY);
    if (!data || newState.guild.id !== data.guildId) return;

    const involvesBot = (oldState.member && oldState.member.user.bot)
      || (newState.member && newState.member.user.bot);
    if (!involvesBot || oldState.channelId === newState.channelId) return;

    scheduleUpdate(client);
  });

  client.on('channelDelete', channel => {
    const data = dbStore.get(STATUS_KEY);
    if (!data || !channel.guild || channel.guild.id !== data.guildId) return;
    scheduleUpdate(client);
  });

  setInterval(() => updateGBM(client), REFRESH_INTERVAL);
}

async function updateGBM(client) {
  attachListeners(client);

  if (running) {
    queued = true;
    return;
  }

  running = true;
  try {
    do {
      queued = false;
      try {
        await withTimeout(runUpdate(client), RUN_TIMEOUT);
      } catch (err) {
        logFailure(err);
      }
      if (queued) await sleep(UPDATE_COOLDOWN);
    } while (queued);
  } finally {
    running = false;
  }
}

function startGBM(client) {
  attachListeners(client);
  return updateGBM(client);
}

async function setupPanel(guild, channel) {
  const validType = [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type);
  if (!validType) {
    return { ok: false, reason: 'Panel hanya dapat dipasang pada text channel atau announcement channel.' };
  }

  const permissions = channel.permissionsFor(guild.members.me);
  const required = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory
  ];
  if (!permissions || !permissions.has(required)) {
    return { ok: false, reason: `Bot membutuhkan izin View Channel, Send Messages, dan Read Message History pada ${channel}.` };
  }

  const previous = dbStore.get(STATUS_KEY);
  if (previous) {
    const oldChannel = await guild.channels.fetch(previous.channelId).catch(() => null);
    const oldMessage = oldChannel && oldChannel.isTextBased()
      ? await oldChannel.messages.fetch(previous.messageId).catch(() => null)
      : null;
    if (oldMessage) await oldMessage.delete().catch(() => null);
  }

  try {
    await syncMembers(guild, true);
    const sent = await channel.send(await buildGBMPayload(guild));
    dbStore.set(STATUS_KEY, {
      guildId: guild.id,
      channelId: channel.id,
      messageId: sent.id
    });
    attachListeners(guild.client);
    return { ok: true };
  } catch (err) {
    console.error('[GBM] Gagal setup panel:', err.message);
    return { ok: false, reason: 'Panel tidak dapat dibuat. Periksa izin bot pada channel tujuan.' };
  }
}

async function refreshPanel(guild) {
  const data = dbStore.get(STATUS_KEY);
  if (!data) {
    return { ok: false, reason: 'Panel belum dipasang. Jalankan setup terlebih dahulu.' };
  }

  await syncMembers(guild, true);
  await updateGBM(guild.client);
  return { ok: true };
}

async function setOwner(guild, botId, ownerId, addedBy) {
  const botMember = await guild.members.fetch(botId).catch(() => null);
  if (!botMember || !botMember.user.bot) {
    return { ok: false, reason: 'Akun yang dipilih bukan bot atau tidak berada di server ini.' };
  }

  const ownerMember = await guild.members.fetch(ownerId).catch(() => null);
  if (!ownerMember || ownerMember.user.bot) {
    return { ok: false, reason: 'Owner harus berupa member server dan bukan akun bot.' };
  }

  const owners = getOwners();
  owners[botId] = { ownerId, addedBy, addedAt: Date.now() };
  dbStore.set(OWNER_KEY, owners);

  await updateGBM(guild.client);
  return { ok: true, botName: botMember.displayName };
}

async function removeOwner(guild, botId) {
  const owners = getOwners();
  if (!owners[botId]) {
    return { ok: false, reason: 'Bot tersebut belum terdaftar sebagai bot premium.' };
  }

  delete owners[botId];
  dbStore.set(OWNER_KEY, owners);

  await updateGBM(guild.client);
  return { ok: true };
}

function ownerListText() {
  const owners = getOwners();
  const ids = Object.keys(owners);
  if (!ids.length) return null;

  return ids
    .map((id, i) => `**${i + 1}.** <@${id}>\n${e('owner')}Owner: <@${owners[id].ownerId}>`)
    .join('\n\n');
}

module.exports = {
  buildGBMEmbed: buildGBMPayload,
  buildGBMPayload,
  buildNotice,
  updateGBM,
  startGBM,
  isMusicBot,
  setupPanel,
  refreshPanel,
  setOwner,
  removeOwner,
  ownerListText,
  getEmoji: e,
  EMOJI
};
