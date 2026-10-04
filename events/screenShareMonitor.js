const { ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('../config.json');

const suspiciousStreamCache = new Map();
const ALERT_COOLDOWN_MS = 60_000;
const DEFAULT_RESTRICTED_KEYWORDS = [
  'yalla shoot',
  'score808',
  'vidio',
  'bein',
  'beIN',
  'f1 tv',
  'premier league',
  'liga champions',
  'uefa champions',
  'world cup',
  'piala dunia',
  'nba',
  'nfl',
  'mlb',
  'ufc',
  'boxing'
];

function getRestrictedKeywords() {
  const envKeywords = process.env.SCREENSHARE_RESTRICTED_KEYWORDS || '';
  const fromConfig = Array.isArray(config.SCREENSHARE_RESTRICTED_KEYWORDS)
    ? config.SCREENSHARE_RESTRICTED_KEYWORDS
    : [];

  const merged = [...DEFAULT_RESTRICTED_KEYWORDS, ...fromConfig, ...envKeywords.split(',')]
    .map((keyword) => String(keyword).trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(merged)];
}

function getModLogChannelId(guild) {
  if (!guild) return null;

  const fromGuildConfig = guild.client?.guilds?.cache?.get?.(guild.id)?.data;
  const channelId =
    config.MOD_LOG_CHANNEL_ID ||
    process.env.MOD_LOG_CHANNEL_ID ||
    config.LOG_CHANNEL_ID ||
    process.env.LOG_CHANNEL_ID ||
    config.statusChannelId ||
    config.STAFF_LOG_CHANNEL_ID ||
    null;

  if (!channelId) return null;

  return String(channelId).trim();
}

function hasModeratorAccess(member) {
  if (!member || !member.roles) return false;

  const allowedRoleIds = [
    '1376416212724088932',
    '1367316783832502282',
    '1386874017105051759',
    '1488646728226967563'
  ];

  return allowedRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

function containsRestrictedKeyword(text) {
  const keywords = getRestrictedKeywords();
  if (!text || !keywords.length) return false;

  const normalized = String(text).toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function hasRestrictedLiveKeyword(member) {
  if (!member?.presence?.activities?.length) return false;

  return member.presence.activities.some((activity) => {
    const textToCheck = [activity?.name, activity?.details, activity?.state].filter(Boolean).join(' ');
    return containsRestrictedKeyword(textToCheck);
  });
}

function isAllowedGameplayActivity(member) {
  if (!member?.presence?.activities?.length) return false;

  return member.presence.activities.some((activity) => {
    const name = String(activity?.name || '').trim();

    // Game aktif = aman. Ini mencakup gameplay seperti MPL, Free Fire, PUBG, Valorant, dll.
    if (activity.type === ActivityType.Playing) return true;
    if (typeof activity.type === 'number' && activity.type === 0) return true;
    if (typeof activity.type === 'string' && activity.type.toUpperCase() === 'PLAYING') return true;

    // Fallback yang aman: bila Discord mengirim aktivitas game tanpa type yang eksplisit.
    if (name && !/^(spotify|youtube|twitch|discord|browser|chrome|firefox|netflix|stream|media player)$/i.test(name)) {
      return true;
    }

    return false;
  });
}

module.exports = {
  name: 'voiceStateUpdate',
  once: false,
  async execute(oldState, newState) {
    try {
      const member = newState.member || oldState.member;
      if (!member || member.user.bot) return;
      if (oldState.streaming || !newState.streaming) return;

      const guild = newState.guild || oldState.guild;
      const channel = newState.channel || oldState.channel;
      if (!guild || !channel) return;

      const hasRestrictedKeyword = hasRestrictedLiveKeyword(member);
      const isGameAllowed = isAllowedGameplayActivity(member);

      // Fokus alert hanya untuk live stream pertandingan/siaran ilegal yang jelas.
      // Screen share umum seperti membuka IG/browser/media player tidak akan trigger.
      if (!hasRestrictedKeyword) {
        return;
      }

      if (isGameAllowed && !hasRestrictedKeyword) {
        return;
      }

      const key = `${guild.id}:${member.id}`;
      const now = Date.now();
      const cooldownUntil = suspiciousStreamCache.get(key) || 0;
      if (now - cooldownUntil < ALERT_COOLDOWN_MS) return;
      suspiciousStreamCache.set(key, now);

      const modChannelId = getModLogChannelId(guild);
      if (!modChannelId) {
        console.warn('[SCREENSHARE] channel log moderator belum dikonfigurasi, alert dilewati.');
        return;
      }

      const modChannel = guild.channels.cache.get(modChannelId) || await guild.channels.fetch(modChannelId).catch(() => null);
      if (!modChannel || !modChannel.isTextBased()) {
        console.warn(`[SCREENSHARE] channel log moderator tidak dapat diakses: ${modChannelId}`);
        return;
      }

      const memberMention = `<@${member.id}>`;
      const voiceChannelText = `(${channel.toString()})`;
      const detectedIssue = hasRestrictedKeyword
        ? 'Nama aktivitas / status mengandung keyword terlarang (contoh: Yalla Shoot, Score808, Vidio, beIN, F1 TV, Premier League)'
        : 'Tidak ada game aktif terdeteksi (misal: Entire Screen / browser / media player / layar non-game)';

      const embed = new EmbedBuilder()
        .setTitle('⚠️ Screen Share Mencurigakan')
        .setDescription('Member mulai Go Live / screen share dan aktivitasnya terindikasi mencurigakan. Game legit seperti MPL / FF / PUBG / gameplay normal tetap dibolehkan, tapi stream dengan keyword terlarang atau layar non-game akan di-alert.')
        .setColor(0xff9900)
        .addFields(
          { name: 'Member', value: `${memberMention} • (${member.id})`, inline: false },
          { name: 'Voice Channel', value: `${voiceChannelText} • ID: ${channel.id}`, inline: false },
          { name: 'Status', value: detectedIssue, inline: false },
          { name: 'Waktu', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`screenshare_warn:${member.id}:${guild.id}`)
          .setLabel('Kirim Peringatan')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`screenshare_disconnect:${member.id}:${guild.id}`)
          .setLabel('Disconnect dari VC')
          .setStyle(ButtonStyle.Danger)
      );

      const rolePing = '<@&1376416212724088932> <@&1488646728226967563>';
      await modChannel.send({
        content: `${rolePing} Monitor screen share mencurigakan terdeteksi.`,
        embeds: [embed],
        components: [row]
      });
    } catch (error) {
      console.error('[SCREENSHARE] gagal memantau screen share:', error.message);
    }
  },
  hasModeratorAccess,
};
