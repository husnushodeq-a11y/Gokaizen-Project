const test = require('node:test');
const assert = require('node:assert/strict');

const { sendVerificationLinkWithFallback } = require('../utils/altJoinVerification');
const { markVerified } = require('../utils/altDetectionRoles');

test('sends a generic notice to the verification channel before DM delivery', async () => {
  process.env.VERIFY_CHANNEL_ID = 'verify-1';

  const sends = [];
  const verifyChannel = {
    id: 'verify-1',
    send: async (payload) => {
      sends.push({ target: 'verify-channel', payload });
      return { ok: true };
    },
  };

  const member = {
    id: 'user-123',
    user: { username: 'alice' },
    guild: {
      id: 'guild-1',
      systemChannelId: 'system-1',
      channels: {
        cache: new Map([
          ['system-1', { id: 'system-1', send: async () => ({ ok: true }) }],
          ['verify-1', verifyChannel],
        ]),
        fetch: async (id) => {
          if (id === 'verify-1') return verifyChannel;
          return null;
        },
      },
    },
    send: async () => ({ ok: true }),
  };

  const result = await sendVerificationLinkWithFallback(member, 'https://example.com/verify?token=abc');

  assert.equal(result.sentTo, 'dm');
  assert.equal(sends.length, 1);
  assert.doesNotMatch(sends[0].payload.content, /https:\/\/example.com\/verify\?token=abc/);
  assert.match(sends[0].payload.content, /cek DM|DM/i);

  delete process.env.VERIFY_CHANNEL_ID;
});

test('falls back to verification channel when direct DM is blocked', async () => {
  process.env.VERIFY_CHANNEL_ID = 'verify-1';

  const sends = [];
  const verifyChannel = {
    id: 'verify-1',
    send: async (payload) => {
      sends.push({ target: 'verify-channel', payload });
      return { ok: true };
    },
  };

  const member = {
    id: 'user-123',
    user: { username: 'alice' },
    guild: {
      id: 'guild-1',
      systemChannelId: 'system-1',
      channels: {
        cache: new Map([
          ['system-1', { id: 'system-1', send: async () => ({ ok: true }) }],
          ['verify-1', verifyChannel],
        ]),
        fetch: async (id) => {
          if (id === 'verify-1') return verifyChannel;
          return null;
        },
      },
    },
    send: async () => {
      throw new Error('Cannot send messages to this user');
    },
  };

  const result = await sendVerificationLinkWithFallback(member, 'https://example.com/verify?token=abc');

  assert.equal(result.sentTo, 'verify-channel');
  assert.equal(sends.length, 1);
  assert.doesNotMatch(sends[0].payload.content, /https:\/\/example.com\/verify\?token=abc/);
  assert.match(sends[0].payload.content, /cek DM|DM/i);

  delete process.env.VERIFY_CHANNEL_ID;
});

test('markVerified adds the Gokaifriends role and removes the unverified role', async () => {
  const added = [];
  const removed = [];
  const guild = {
    id: 'guild-1',
    roles: {
      cache: new Map(),
      find: () => ({ id: 'verified-role', name: 'verified-akun' }),
      create: async () => ({ id: 'verified-role', name: 'verified-akun' }),
    },
    members: {
      fetch: async () => ({
        roles: {
          remove: async (role) => removed.push(role.id || role),
          add: async (role) => added.push(role.id || role),
          cache: { has: () => true },
        },
      }),
    },
  };

  const client = {
    guilds: {
      fetch: async () => guild,
    },
  };

  process.env.ROLE_GOKAIFRIENDS_ID = 'gokaifriends-role';

  const result = await markVerified(client, 'guild-1', 'user-123');

  assert.equal(result.ok, true);
  assert.ok(added.includes('gokaifriends-role'));
  assert.ok(removed.includes('verified-role'));

  delete process.env.ROLE_GOKAIFRIENDS_ID;
});
