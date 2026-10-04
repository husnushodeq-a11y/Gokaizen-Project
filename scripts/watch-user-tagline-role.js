#!/usr/bin/env node

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { extractServerTag, hasGoKaizenTagline } = require('../utils/taglineRoleSync');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.replace(/^--/, '');
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    args[key] = value;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const guildId = args.guild || process.env.GUILD_ID;
const userId = args.userId || args.user || process.env.USER_ID;
const roleId = args.roleId || process.env.ROLE_ID || '1422140113667751977';
const reportChannelId = args.reportChannelId || args.channelId || args.logChannelId || process.env.TAGLINE_REPORT_CHANNEL_ID || '1478743405537267793';
const intervalMs = Number(args.intervalMs || 5000);
const timeoutMs = Number(args.timeoutMs ?? 0); // 0 = no hard stop; keep monitoring until role appears

if (!guildId || !userId) {
  console.error('Usage: node scripts/watch-user-tagline-role.js --guild <guildId> --userId <userId> [--roleId <roleId>] [--intervalMs 5000] [--timeoutMs 300000]');
  process.exit(1);
}

const start = Date.now();
let previousTag = null;
let previousRoleState = null;
let tagMatchedAt = null;
let lastLoggedAt = 0;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences],
});

async function sendChannelEmbed({ title, description, color = 0x00ae86, fields = [] }) {
  if (!reportChannelId) return;

  const channel = await client.channels.fetch(reportChannelId).catch(() => null);
  if (!channel || !channel.send) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setDescription(description)
    .setTimestamp();

  if (fields.length) embed.addFields(fields.map(field => ({ name: field.name, value: field.value, inline: !!field.inline })));

  await channel.send({ embeds: [embed] }).catch(() => null);
}

client.on('ready', async () => {
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.error('GUILD_NOT_FOUND');
    process.exit(1);
  }

  const check = async () => {
    const now = Date.now();
    if (timeoutMs > 0 && now - start > timeoutMs) {
      console.log('[WATCH_USER_TAGLINE_ROLE] hard timeout reached, continuing to watch until role appears', {
        userId,
        guildId,
        elapsedSeconds: ((now - start) / 1000).toFixed(2),
        timeoutMs,
      });
      return;
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      console.log('[WATCH_USER_TAGLINE_ROLE] member not found yet', { userId, guildId });
      return;
    }

    const tag = extractServerTag(member) ?? 'NO_TAG';
    const hasRole = member.roles.cache.has(roleId);

    if (previousTag === null) {
      previousTag = tag;
      previousRoleState = hasRole;
      console.log('[WATCH_USER_TAGLINE_ROLE] initial', {
        userId,
        tag,
        hasRole,
        timestamp: new Date().toISOString(),
      });
      await sendChannelEmbed({
        title: 'Tagline watch started',
        description: 'Monitoring user role sync latency.',
        fields: [
          { name: 'User ID', value: userId, inline: true },
          { name: 'Tag', value: tag, inline: true },
          { name: 'Role', value: hasRole ? 'present' : 'missing', inline: true },
        ],
      });
      return;
    }

    const tagChanged = previousTag !== tag;
    const roleChanged = previousRoleState !== hasRole;

    if (tagChanged || roleChanged) {
      if (tagChanged && hasGoKaizenTagline(tag)) {
        tagMatchedAt = now;
      } else if (tagChanged && !hasGoKaizenTagline(tag)) {
        tagMatchedAt = null;
      }

      const elapsed = tagMatchedAt ? ((now - tagMatchedAt) / 1000).toFixed(2) : 'n/a';
      console.log('[WATCH_USER_TAGLINE_ROLE] state changed', {
        userId,
        previousTag,
        currentTag: tag,
        previousRoleState,
        currentRoleState: hasRole,
        elapsedSeconds: elapsed,
        timestamp: new Date().toISOString(),
      });
      await sendChannelEmbed({
        title: 'Tagline state changed',
        description: 'The monitored user changed tag or role state.',
        color: 0x3498db,
        fields: [
          { name: 'User ID', value: userId, inline: true },
          { name: 'Previous tag', value: previousTag || 'none', inline: true },
          { name: 'Current tag', value: tag || 'none', inline: true },
          { name: 'Has role', value: String(hasRole), inline: true },
          { name: 'Tag-to-role elapsed', value: tagMatchedAt ? `${elapsed}s` : 'not measuring', inline: true },
        ],
      });
    }

    if (hasRole && hasGoKaizenTagline(tag)) {
      const elapsedSeconds = ((Date.now() - (tagMatchedAt || start)) / 1000).toFixed(2);
      console.log('[WATCH_USER_TAGLINE_ROLE] role detected after tag match', {
        userId,
        tag,
        hasRole,
        elapsedSeconds,
        timestamp: new Date().toISOString(),
      });
      await sendChannelEmbed({
        title: 'Tagline role detected',
        description: 'User has the expected role after the tag synced.',
        color: 0x2ecc71,
        fields: [
          { name: 'User ID', value: userId, inline: true },
          { name: 'Tag', value: tag, inline: true },
          { name: 'Elapsed', value: `${elapsedSeconds}s`, inline: true },
          { name: 'Measured from', value: tagMatchedAt ? 'tag changed to GoKaizen' : 'watcher start', inline: true },
          { name: 'Role ID', value: roleId, inline: false },
        ],
      });
      process.exit(0);
    }

    if (tagChanged && !hasRole && (previousRoleState === true || previousRoleState === null)) {
      console.log('[WATCH_USER_TAGLINE_ROLE] role removed after tag mismatch', {
        userId,
        tag,
        elapsedSeconds: ((Date.now() - start) / 1000).toFixed(2),
        timestamp: new Date().toISOString(),
      });
    }

    previousTag = tag;
    previousRoleState = hasRole;

    if (now - lastLoggedAt > 30000) {
      lastLoggedAt = now;
      const elapsedSeconds = ((now - start) / 1000).toFixed(2);
      console.log('[WATCH_USER_TAGLINE_ROLE] still watching', {
        userId,
        tag,
        hasRole,
        elapsedSeconds,
      });
      await sendChannelEmbed({
        title: 'Tagline watch still running',
        description: 'No role match yet. Monitoring continues.',
        color: 0xf1c40f,
        fields: [
          { name: 'User ID', value: userId, inline: true },
          { name: 'Tag', value: tag, inline: true },
          { name: 'Has role', value: String(hasRole), inline: true },
          { name: 'Elapsed', value: `${elapsedSeconds}s`, inline: false },
        ],
      });
    }
  };

  console.log('[WATCH_USER_TAGLINE_ROLE] monitoring started', { guildId, userId, roleId, intervalMs, timeoutMs });
  await check();
  setInterval(check, intervalMs);
});

client.login(config.token).catch(err => {
  console.error('LOGIN_FAILED:', err.message);
  process.exit(1);
});
