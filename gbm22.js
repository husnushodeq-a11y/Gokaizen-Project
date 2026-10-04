// ─────────────────────────────────────────────
// Imports
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Constants & Configuration
// ─────────────────────────────────────────────
const ACCENT_COLOR = 0x1abc9c;
const STATUS_KEY   = 'gbm_status';
const OWNER_KEY    = 'gbm_owners';

const TIMING = {
  FULL_FETCH_INTERVAL: 10 * 60 * 1000,
  REFRESH_INTERVAL:     2 * 60 * 1000,
  DEBOUNCE_DELAY:       5000,
  UPDATE_COOLDOWN:      3000,
  RUN_TIMEOUT:          90000,
};

const LAYOUT = {
  TOTAL_LIMIT:      3800,
  SECTION_OVERHEAD:  400,
};

const EMOJI = {
  title:     '<:title:1554171252992647188>',
  public:    '<:public:1554171303878197298>',
  premium:   '<:premium:1554171330910359653>',
  active:    '<:active:1554171487915872296>',
  available: '<:available:1554171455996960908>',
  owner:     '<:owner:1554171357988659350>',
  total:     '<:total:1554171225075355688>',
  clock:     '<:clock:1554171421767376937>',
  success:   '<:success:1554171278188089445>',
  error:     '<:error:1554171388229586974>',
};

const KNOWN_MUSIC_BOTS = [
  'chip', 'euphony', 'flavi bot', 'flavibot', 'jockie music', 'hade',
  'milky music', 'muzox', 'lara', 'lunabot', 'uzox', 'swelly', 'minerea', 'nero'
];

const PRIORITY_BOTS = [
  'jockie', 'chip', 'flavi', 'euphony', 'hade',
  'milky', 'lofi', 'muzox', 'lara', 'uzox', 'swelly', 'minerea', 'nero'
];

// ─────────────────────────────────────────────
// Runtime State
// ─────────────────────────────────────────────
const fetchState  = new Map();
let running       = false;
let queued        = false;
let attached      = false;
let debounceTimer = null;

// ─────────────────────────────────────────────
// General Utilities
// ─────────────────────────────────────────────
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
  return String(text).replace(/([*_~`|>\\[\]])/g, '\\$1');
}

function logFailure(err) {
  if (err && (err.code === 50001 || err.code === 50013)) {
    console.error('[GBM] Bot tidak memiliki izin pada channel panel. Pastikan View Channel, Read Message History, dan Send Messages aktif.');
    return;
  }
  console.error('[GBM] Gagal memperbarui panel:', err && err.message ? err.message : err);
}

// ─────────────────────────────────────────────
// Data Helpers (Owner & Member)
// ─────────────────────────────────────────────
function getOwners() {
  return dbStore.get(OWNER_KEY) || {};
}

function isMusicBot(member) {
  if (!member || !member.user.bot) return false;
  const username    = member.user.username.toLowerCase();
  const displayName = member.displayName.toLowerCase();
  return KNOWN_MUSIC_BOTS.some(name => username.includes(name) || displayName.includes(name));
}

function priorityRank(username) {
  const name  = username.toLowerCase();
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

function resolveVoiceId(guild, member) {
  const state = guild.voiceStates.cache.get(member.id) || member.voice;
  return state && state.channelId ? state.channelId : null;
}

async function syncMembers(guild, force = false) {
  const last = fetchState.get(guild.id) || 0;
  if (force || Date.now() - last > TIMING.FULL_FETCH_INTERVAL) {
    fetchState.set(guild.id, Date.now());
    await guild.members.fetch({ time: 30000 }).catch(() => null);
  }

  const missing = Object.keys(getOwners()).filter(id => !guild.members.cache.has(id));
  if (missing.length) {
    await guild.members.fetch({ user: missing }).catch(() => null);
  }
}

// ─────────────────────────────────────────────
// Discord Component Builders
// ─────────────────────────────────────────────
function textBlock(content) {
  return new TextDisplayBuilder().setContent(content);
}

function divider() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function v2Payload(container) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false },
  };
}

// ─────────────────────────────────────────────
// Bot Entry Formatters
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Layout & Budget Allocation
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Panel Payload Builders
// ─────────────────────────────────────────────

/**
 * Collect and categorize all music bots into
 * public/premium × free/busy groups.
 */
function categorizeBots(guild) {
  const owners = getOwners();

  const allBots = Array.from(guild.members.cache.values())
    .filter(member => member.user.bot && (owners[member.id] || isMusicBot(member)));

  const isBusy = member => Boolean(resolveVoiceId(guild, member));

  const premiumBots = sortBots(allBots.filter(member =>  owners[member.id]));
  const publicBots  = sortBots(allBots.filter(member => !owners[member.id]));

  return {
    owners,
    totalCount: allBots.length,
    public:  { free: publicBots.filter(m => !isBusy(m)),  busy: publicBots.filter(isBusy) },
    premium: { free: premiumBots.filter(m => !isBusy(m)), busy: premiumBots.filter(isBusy) },
  };
}

/**
 * Format categorized bots into display-ready text entries.
 */
function formatEntries(guild, categories) {
  const { owners } = categories;

  return {
    publicFree:  categories.public.free.map((m, i)  => freeEntry(m, i, null)),
    publicBusy:  categories.public.busy.map((m, i)  => busyEntry(guild, m, i, null)),
    premiumFree: categories.premium.free.map((m, i) => freeEntry(m, i, owners[m.id])),
    premiumBusy: categories.premium.busy.map((m, i) => busyEntry(guild, m, i, owners[m.id])),
  };
}

/** Build the header text block showing title and summary stats. */
function buildHeader(totalCount, inUseCount) {
  const available = totalCount - inUseCount;
  return [
    `# ${e('title')}Get Bot Music`,
    `${e('total')}Total **${totalCount}**   ${e('available')}Siap **${available}**   ${e('active')}Digunakan **${inUseCount}**`,
  ].join('\n');
}

/** Build the footer text with last-updated timestamp. */
function buildFooter() {
  return `-# ${e('clock')}Diperbarui <t:${Math.floor(Date.now() / 1000)}:R>`;
}

/**
 * Assemble the full GBM panel payload.
 *
 * Steps:
 *  1. Categorize bots (public/premium × free/busy)
 *  2. Format text entries for each category
 *  3. Build header & footer
 *  4. Calculate character budgets per section
 *  5. Build public & premium sections
 *  6. Assemble the Components V2 container
 */
async function buildGBMPayload(guild) {
  await syncMembers(guild);

  // 1. Categorize bots
  const categories = categorizeBots(guild);
  const inUseCount = categories.public.busy.length + categories.premium.busy.length;

  // 2. Format entries
  const entries = formatEntries(guild, categories);

  // 3. Build header & footer
  const header = buildHeader(categories.totalCount, inUseCount);
  const footer = buildFooter();

  // 4. Calculate character budgets
  const remaining = LAYOUT.TOTAL_LIMIT - header.length - footer.length - LAYOUT.SECTION_OVERHEAD;
  const [pubFreeBudget, pubBusyBudget, premFreeBudget, premBusyBudget] = allocate(
    [
      groupNeed(entries.publicFree),
      groupNeed(entries.publicBusy),
      groupNeed(entries.premiumFree),
      groupNeed(entries.premiumBusy),
    ],
    remaining
  );

  // 5. Build sections
  const publicSection = buildBotSection(
    `${e('public')}Bot Musik Publik`,
    [
      { label: `${e('available')}Siap digunakan`, entries: entries.publicFree,  budget: pubFreeBudget },
      { label: `${e('active')}Sedang digunakan`,  entries: entries.publicBusy,  budget: pubBusyBudget },
    ],
    'Tidak ada bot musik publik yang terdeteksi.'
  );

  const premiumSection = buildBotSection(
    `${e('premium')}Bot Musik Premium`,
    [
      { label: `${e('available')}Siap digunakan`, entries: entries.premiumFree, budget: premFreeBudget },
      { label: `${e('active')}Sedang digunakan`,  entries: entries.premiumBusy, budget: premBusyBudget },
    ],
    'Belum ada bot musik premium yang terdaftar.'
  );

  // 6. Assemble container
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

/**
 * Build a simple notice panel (success/error feedback).
 */
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

// ─────────────────────────────────────────────
// Panel Delivery & Update Lifecycle
// ─────────────────────────────────────────────
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

  const guild   = await client.guilds.fetch(data.guildId);
  const channel = await guild.channels.fetch(data.channelId);
  if (!channel || !channel.isTextBased()) return;

  const payload = await buildGBMPayload(guild);
  const message = await deliver(channel, data.messageId, payload);

  if (message.id !== data.messageId) {
    dbStore.set(STATUS_KEY, {
      guildId:   guild.id,
      channelId: channel.id,
      messageId: message.id,
    });
    console.log(`[GBM] Panel baru dibuat dan disimpan (ID: ${message.id})`);
  }
}

function scheduleUpdate(client) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => updateGBM(client), TIMING.DEBOUNCE_DELAY);
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
        await withTimeout(runUpdate(client), TIMING.RUN_TIMEOUT);
      } catch (err) {
        logFailure(err);
      }
      if (queued) await sleep(TIMING.UPDATE_COOLDOWN);
    } while (queued);
  } finally {
    running = false;
  }
}

// ─────────────────────────────────────────────
// Event Listeners
// ─────────────────────────────────────────────
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

  setInterval(() => updateGBM(client), TIMING.REFRESH_INTERVAL);
}

function startGBM(client) {
  attachListeners(client);
  return updateGBM(client);
}

// ─────────────────────────────────────────────
// Panel Setup & Management
// ─────────────────────────────────────────────
async function setupPanel(guild, channel) {
  const validType = [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type);
  if (!validType) {
    return { ok: false, reason: 'Panel hanya dapat dipasang pada text channel atau announcement channel.' };
  }

  const permissions = channel.permissionsFor(guild.members.me);
  const required = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ];
  if (!permissions || !permissions.has(required)) {
    return { ok: false, reason: `Bot membutuhkan izin View Channel, Send Messages, dan Read Message History pada ${channel}.` };
  }

  // Delete previous panel if exists
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
      guildId:   guild.id,
      channelId: channel.id,
      messageId: sent.id,
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

// ─────────────────────────────────────────────
// Owner Management (Premium Bots)
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────
module.exports = {
  // Panel builders
  buildGBMEmbed: buildGBMPayload,
  buildGBMPayload,
  buildNotice,

  // Lifecycle
  updateGBM,
  startGBM,

  // Panel management
  setupPanel,
  refreshPanel,

  // Bot detection
  isMusicBot,

  // Owner management
  setOwner,
  removeOwner,
  ownerListText,

  // Utilities
  getEmoji: e,
  EMOJI,
};
