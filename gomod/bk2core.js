const fs = require('fs');
const path = require('path');
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    PermissionFlagsBits,
    PermissionsBitField,
    ActivityType,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    LabelBuilder,
    FileUploadBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    Routes,
    MessageFlags,
} = require('discord.js');

const RED = 0xFF0000;
const MAX_SCAN = 2000;

const IMAGE_THRESHOLD = 4;
const ALERT_ROLES = ['1376416212724088932', '1488646728226967563']; 
const WHITELIST_ROLES = ['1376416212724088932', '1366107173309911182', '1460793400616812694', '1386874017105051759', '1367316783832502282', '1488646728226967563'];
const DB_PATH = path.join(__dirname, 'radar-channels.json');
const RESPONDER_DB_PATH = path.join(__dirname, 'responders.json');

// Balasan statis untuk command "gosmed" (khusus admin & role tertentu)
const GOSMED_REPLY =
    '**PUNYA GOKAIZEN**\n\n' +
    '`FOLLOW :`\n' +
    '- https://www.instagram.com/gokaizencommunity\n' +
    '- https://www.tiktok.com/@gokaizencommunity?\n\n' +
    '`SUPPORT :`\n' +
    '- https://sociabuzz.com/gkzn/tribe\n\n' +
    '`DISCORD KITA :`\n' +
    '- https://discord.gg/gokaizen';

// Command "gosmed" & "goline" hanya untuk admin + role berikut
const GOCMD_ROLES = ['1460793400616812694', '1376416212724088932', '1366107173309911182'];
const GOLINE_IMAGE = path.join(__dirname, 'goline.png');

function canUseGoCmd(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return GOCMD_ROLES.some(r => member.roles.cache.has(r));
}

// client di-set saat ready (dari loader gokaizen). Intents & login diurus index.js gokaizen.
let client = null;

const redEmbed = (description, title) => {
    const e = new EmbedBuilder().setColor(RED).setDescription(description);
    if (title) e.setTitle(title);
    return e;
};

// Embed netral tanpa warna merah — dipakai untuk respon fitur Custom Role
const infoEmbed = (description, title) => {
    const e = new EmbedBuilder().setColor(0x2B2D31).setDescription(description);
    if (title) e.setTitle(title);
    return e;
};

function loadRadarChannels() {
    try {
        if (fs.existsSync(DB_PATH)) {
            return new Map(Object.entries(JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))));
        }
    } catch (err) {}
    return new Map();
}

function saveRadarChannels(map) {
    try {
        const tmp = `${DB_PATH}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(map), null, 2));
        fs.renameSync(tmp, DB_PATH);
    } catch (err) {}
}

function loadResponders() {
    try {
        if (fs.existsSync(RESPONDER_DB_PATH)) {
            return new Map(Object.entries(JSON.parse(fs.readFileSync(RESPONDER_DB_PATH, 'utf8'))));
        }
    } catch (err) {}
    return new Map();
}

function saveResponders(map) {
    try {
        const tmp = `${RESPONDER_DB_PATH}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(map), null, 2));
        fs.renameSync(tmp, RESPONDER_DB_PATH);
    } catch (err) {}
}

const radarChannels = loadRadarChannels();
const responders = loadResponders();

/* =========================================================
 *  CUSTOM ROLE FEATURE
 * ========================================================= */

const CUSTOM_ROLE_DB_PATH = path.join(__dirname, 'customrole-config.json');

// Preset warna holographic resmi Discord (light blue -> pink -> gold shimmer)
const HOLOGRAPHIC = { primary: 11127295, secondary: 16759788, tertiary: 16761760 };

function loadCustomRoleData() {
    try {
        if (fs.existsSync(CUSTOM_ROLE_DB_PATH)) {
            return JSON.parse(fs.readFileSync(CUSTOM_ROLE_DB_PATH, 'utf8'));
        }
    } catch (err) {}
    return {};
}

function saveCustomRoleData(data) {
    try {
        const tmp = `${CUSTOM_ROLE_DB_PATH}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, CUSTOM_ROLE_DB_PATH);
    } catch (err) {}
}

const customRoleData = loadCustomRoleData();

// Ambil (atau buat) config custom-role per guild
function getGuildCfg(guildId) {
    if (!customRoleData[guildId]) customRoleData[guildId] = { whitelistRoles: [], whitelist2: [], roles: {} };
    if (!customRoleData[guildId].whitelistRoles) customRoleData[guildId].whitelistRoles = [];
    if (!customRoleData[guildId].whitelist2) customRoleData[guildId].whitelist2 = [];
    if (!customRoleData[guildId].roles) customRoleData[guildId].roles = {};
    return customRoleData[guildId];
}

// Cek akses fitur custom role: admin, atau whitelist tier 1 / tier 2
function canUseCustomRole(member) {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    const cfg = getGuildCfg(member.guild.id);
    return cfg.whitelistRoles.some(r => member.roles.cache.has(r)) || cfg.whitelist2.some(r => member.roles.cache.has(r));
}

// Cek akses warna lanjutan (gradient & holographic): admin atau whitelist tier 2
function canUseAdvancedColor(member) {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    const cfg = getGuildCfg(member.guild.id);
    return cfg.whitelist2.some(r => member.roles.cache.has(r));
}

// Ambil custom role milik user (sekaligus bersihkan mapping kalau role sudah dihapus manual)
// Role acuan. Custom role selalu ditempatkan tepat di bawahnya, sehingga
// posisinya tidak berubah ubah mengikuti role bot.
const CROLE_ANCHOR_ID = '1386885804021780602';

// Menghitung posisi tujuan custom role.
//   utama true  : tepat di bawah role acuan, sehingga menjadi warna nama
//   utama false : paling bawah, sehingga warna nama diambil dari role lain
async function hitungPosisiCustomRole(guild, utama) {
    if (!utama) return 1;

    const acuan = guild.roles.cache.get(CROLE_ANCHOR_ID)
        || await guild.roles.fetch(CROLE_ANCHOR_ID).catch(() => null);

    const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    const batasBot = me ? me.roles.highest.position - 1 : null;

    // tanpa role acuan, kembali memakai patokan lama
    if (!acuan) return Math.max(1, batasBot || 1);

    // posisi tidak boleh melewati batas yang dapat diatur bot
    const tujuan = Math.max(1, acuan.position - 1);
    return batasBot === null ? tujuan : Math.max(1, Math.min(tujuan, batasBot));
}

async function getUserCustomRole(guild, userId) {
    const cfg = getGuildCfg(guild.id);
    const roleId = cfg.roles[userId];
    if (!roleId) return null;
    const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        delete cfg.roles[userId];
        saveCustomRoleData(customRoleData);
        return null;
    }
    return role;
}

// Set warna role via REST (mendukung gradient & holographic, tidak tergantung versi discord.js)
async function setRoleColors(guildId, roleId, primary, secondary = null, tertiary = null) {
    return client.rest.patch(Routes.guildRole(guildId, roleId), {
        body: { colors: { primary_color: primary, secondary_color: secondary, tertiary_color: tertiary } },
        reason: 'Custom role color update',
    });
}

// Parse input HEX -> integer (mendukung #FFF dan #FFFFFF)
function parseHex(input) {
    if (!input) return null;
    let h = input.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return parseInt(h, 16);
}

// Set icon role dari attachment gambar yang di-upload user
async function setRoleIconFromAttachment(role, attachment) {
    await role.setUnicodeEmoji(null).catch(() => null);
    return role.setIcon(attachment.url);
}

function isImageAttachment(att) {
    if (!att) return false;
    return (att.contentType && att.contentType.startsWith('image/')) || /\.(png|jpe?g|gif|webp)$/i.test(att.name || '');
}

// Ambil custom role dari CACHE saja (sinkron, tanpa fetch) — dipakai sebelum ack biar tidak kena timeout 3 detik
function getCachedCustomRole(guild, userId) {
    const cfg = getGuildCfg(guild.id);
    const rid = cfg.roles[userId];
    if (!rid) return null;
    return guild.roles.cache.get(rid) || null;
}

// Ambil attachment yang di-upload user lewat modal (coba beberapa bentuk API discord.js)
function getUploadedAttachment(interaction, customId) {
    try {
        const f = interaction.fields;
        if (f && typeof f.getUploadedAttachments === 'function') {
            const col = f.getUploadedAttachments(customId);
            const att = col && (col.first ? col.first() : Object.values(col)[0]);
            if (att) return att;
        }
        const field = f && typeof f.getField === 'function' ? f.getField(customId) : null;
        if (field) {
            if (field.attachments) {
                const att = field.attachments.first ? field.attachments.first() : Object.values(field.attachments)[0];
                if (att) return att;
            }
            const ids = field.values || field.value;
            if (Array.isArray(ids) && ids.length) {
                const resolved = (f && f.resolved && f.resolved.attachments) || interaction.attachments || (interaction.resolved && interaction.resolved.attachments);
                if (resolved) {
                    const att = resolved.get ? resolved.get(ids[0]) : resolved[ids[0]];
                    if (att) return att;
                }
            }
        }
    } catch (e) {}
    return null;
}

// Deteksi dukungan modal komponen baru (Label + File Upload) — butuh discord.js versi baru
const SUPPORTS_MODAL_V2 = typeof LabelBuilder === 'function' && typeof FileUploadBuilder === 'function';

// Modal editor gabungan (warna + icon upload) untuk Create & Manage Role — gaya "Custom Role Manager"
function buildEditorModalV2(mode, role, advanced) {
    const isManage = mode === 'manage';
    const nameInput = new TextInputBuilder().setCustomId('name').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(!isManage);
    if (isManage && role) nameInput.setValue(role.name);

    const opts = [
        { label: 'Tidak diubah / tanpa warna', value: 'none', default: true },
        { label: 'Solid (1 warna HEX)', value: 'solid' },
    ];
    if (advanced) {
        opts.push({ label: 'Gradient (2 warna HEX)', value: 'gradient' });
        opts.push({ label: 'Holographic', value: 'holo' });
    }
    const colorSelect = new StringSelectMenuBuilder().setCustomId('ctype').setMinValues(1).setMaxValues(1).addOptions(...opts);
    const hex1 = new TextInputBuilder().setCustomId('hex1').setStyle(TextInputStyle.Short).setMaxLength(7).setRequired(false).setPlaceholder('#FF00AA');
    const hex2 = new TextInputBuilder().setCustomId('hex2').setStyle(TextInputStyle.Short).setMaxLength(7).setRequired(false).setPlaceholder('#00E0FF');
    const icon = new FileUploadBuilder().setCustomId('icon').setMinValues(0).setMaxValues(1).setRequired(false);

    const labels = [
        new LabelBuilder().setLabel(isManage ? 'Role Name (opsional saat manage)' : 'Role Name').setTextInputComponent(nameInput),
        new LabelBuilder().setLabel('Tipe Warna').setStringSelectMenuComponent(colorSelect),
        new LabelBuilder().setLabel(advanced ? 'HEX Warna 1 (solid / awal gradient)' : 'HEX Warna (solid)').setTextInputComponent(hex1),
    ];
    if (advanced) labels.push(new LabelBuilder().setLabel('HEX Warna 2 (akhir gradient)').setTextInputComponent(hex2));
    labels.push(new LabelBuilder().setLabel('Role Icon (upload gambar)').setFileUploadComponent(icon));

    return new ModalBuilder().setCustomId('crole_editor:' + mode).setTitle('Custom Role Manager').addLabelComponents(...labels);
}

// Fallback modal klasik (kalau discord.js belum dukung upload/select di modal): icon lewat URL
function buildEditorModalClassic(mode, role, advanced) {
    const isManage = mode === 'manage';
    const nameInput = new TextInputBuilder().setCustomId('name').setLabel(isManage ? 'Nama Role (opsional)' : 'Nama Role').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(!isManage);
    if (isManage && role) nameInput.setValue(role.name);
    const rows = [
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hex1').setLabel(advanced ? 'HEX Warna 1 (opsional)' : 'HEX Warna solid (opsional)').setPlaceholder('#FF00AA').setStyle(TextInputStyle.Short).setMaxLength(7).setRequired(false)),
    ];
    if (advanced) {
        rows.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hex2').setLabel('HEX Warna 2 gradient (opsional)').setPlaceholder('#00E0FF').setStyle(TextInputStyle.Short).setMaxLength(7).setRequired(false)));
        rows.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('holo').setLabel('Holographic? ketik: ya (opsional)').setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(false)));
    }
    rows.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('iconurl').setLabel('URL Icon (opsional)').setPlaceholder('https://.../icon.png').setStyle(TextInputStyle.Short).setMaxLength(300).setRequired(false)));
    return new ModalBuilder().setCustomId('crole_editor:' + mode).setTitle('Custom Role Manager').addComponents(...rows);
}

function buildEditorModal(mode, role, advanced) {
    if (SUPPORTS_MODAL_V2) {
        try { return buildEditorModalV2(mode, role, advanced); } catch (e) {}
    }
    return buildEditorModalClassic(mode, role, advanced);
}

function gradientErrorMsg(err) {
    return 'Gagal menerapkan warna. Fitur **Gradient/Holographic** butuh server punya fitur **Enhanced Role Colors** (dari Server Boost). Kalau server belum punya, gunakan warna **Solid**.\n\nDetail: ' + err.message;
}

// Deteksi dukungan layout Components V2 (Container + Text Display)
const SUPPORTS_V2_LAYOUT = typeof ContainerBuilder === 'function' && typeof TextDisplayBuilder === 'function' && MessageFlags.IsComponentsV2 !== undefined;

// Teks panel Custom Role (markdown, gaya Components V2 — tanpa garis pemisah)
const PANEL_TEXT =
    '## CUSTOM ROLE DONATUR <:gokaizen:1422699866148175902>\n' +
    '<:create_role:1526262217127886879> **Create Role** buat bikin role baru\n' +
    '<:manage_role:1526262757769347072> **Manage Role** buat ubah nama, warna, sama icon\n' +
    '<:manage_color:1526262729860579458> **Manage Color** buat ganti warna aja\n' +
    '<:manage_position:1526262744100245645> **Manage Position** buat atur tampilan role kamu\n' +
    '<:delete_role:1526262231212363938> **Delete Role** buat hapus role kamu\n\n' +
    'Satu member cuma bisa punya satu custom role ya.';

// Teks help (markdown, gaya Components V2 — tanpa garis pemisah).
// Fungsi biar prefix selalu ngikutin const PREFIX.
function buildHelpText() {
    return '## GOKAIZEN Staff Commands\n' +
        `Gunakan prefix \`${PREFIX}\` sebelum setiap command. Contoh: \`${PREFIX}help\`.\n\n` +
        '**Moderation**\n' +
        `\`${PREFIX}ban <user> [days] [reason]\` ban a user by ID or mention\n` +
        `\`${PREFIX}to <user> <1m|5m|10m|1h|3d|1w> [reason]\` give a member a timeout\n` +
        `\`${PREFIX}clearmsg <user>\` delete all of a user's messages across channels\n` +
        `\`${PREFIX}deletemsg <user> <amount>\` delete a user's recent messages\n` +
        `\`${PREFIX}copyperm <source> <target>\` copy permissions between channels\n` +
        `\`${PREFIX}warp <user/random>\` move to another user's voice channel\n` +
        `\`${PREFIX}tarik <user/random>\` Pull to target user's voice channel\n\n` +
        '**Warnings**\n' +
        `\`${PREFIX}warn <user> <reason>\` issue a warning to a member\n` +
        `\`${PREFIX}warns [user] [page]\` view a member's warning history\n` +
        `\`${PREFIX}warnlist\` list all warned users, grouped by staff and members\n` +
        `\`${PREFIX}delwarn <ID>\` remove a single warning by ID (Administrator)\n` +
        `\`${PREFIX}clearwarns <user>\` clear all warnings for a member (Administrator)\n\n` +
        '**Role Management**\n' +
        `\`${PREFIX}giverole <user> <role> [duration]\` grant a role, optionally timed\n` +
        `\`${PREFIX}removerole <user> <role>\` remove a role and cancel its timer\n` +
        `\`${PREFIX}roles [user]\` view a member's active timed roles\n` +
        `\`${PREFIX}temproles\` list all active timed roles in the server\n\n` +
        '**Donation**\n' +
        `\`${PREFIX}donasi <user/name> <amount> [message]\` announce a donation and add it to the total\n` +
        `\`${PREFIX}donasitest <user/name> <amount>\` preview a donation embed without recording\n` +
        `\`${PREFIX}topdonatur\` view the top donor leaderboard\n` +
        `\`${PREFIX}topdonatur pin\` install an auto-updating leaderboard board\n` +
        `\`${PREFIX}donatur add <user/name> <amount>\` add to a total without announcing\n` +
        `\`${PREFIX}donatur set <user/name> <amount>\` set a donor total (Administrator)\n` +
        `\`${PREFIX}donatur remove <user/name>\` remove a donor from the leaderboard (Administrator)\n` +
        `\`${PREFIX}regulasi\` post the donation policy and membership tiers\n` +
        `\`${PREFIX}infodonasi [user]\` view a donor's total, history, and active role duration\n\n` +
        '**Premium Access**\n' +
        `\`${PREFIX}premiumwl add <user> [duration]\` grant access to d! premium commands\n` +
        `\`${PREFIX}premiumwl remove <user>\` revoke premium access on abuse\n` +
        `\`${PREFIX}premiumwl list\` list every member with premium access\n` +
        `\`${PREFIX}premiumwl check <user>\` check a member's premium status\n` +
        `Members with access use \`d!help\` to see their premium commands.\n\n` +
        '**Member of the Month**\n' +
        `\`${PREFIX}motm setup\` install the daily and monthly leaderboard boards\n` +
        `\`${PREFIX}motm refresh\` refresh every board right away\n` +
        `\`${PREFIX}motm test [harian|bulanan] [voice|chat]\` preview a board without saving\n` +
        `\`${PREFIX}motm info [user]\` view a member's points and rank\n` +
        `\`${PREFIX}motm winners\` list previous monthly winners\n` +
        `\`${PREFIX}motm cek\` check channels, permissions, and system readiness\n` +
        `\`${PREFIX}motm add <user> <voice|chat> <amount> [reason]\` add points (Administrator)\n` +
        `\`${PREFIX}motm remove <user> <voice|chat> <amount>\` deduct points (Administrator)\n` +
        `\`${PREFIX}motm set <user> <voice|chat> <amount>\` set the monthly total (Administrator)\n` +
        `\`${PREFIX}motm bonus <user> <voice|chat> <amount> [reason]\` grant bonus points (Administrator)\n` +
        `\`${PREFIX}motm reset <user>\` clear this month's points (Administrator)\n` +
        `\`${PREFIX}motm forcewinner\` process last month's winners manually (Administrator)\n\n` +
        '**System**\n' +
        `\`${PREFIX}setupradar\` set this channel as the Gokaizen Radar log\n` +
        `\`${PREFIX}addresponder <user> | <trigger> | <reply>\` add an auto-responder\n` +
        `\`${PREFIX}delresponder <trigger>\` remove an auto-responder\n` +
        `\`${PREFIX}listresponder\` view all auto-responders\n\n` +
        '**Other Systems & Utilities**\n' +
        `\`${PREFIX}altcheck [user/ID]\` check alt detection status\n` +
        `\`${PREFIX}verifyconfig\` configure join verification settings\n` +
        `\`${PREFIX}banip <IP>\` ban an IP address (Superadmin)\n` +
        `\`${PREFIX}unbanip <IP>\` unban an IP address (Superadmin)\n` +
        `\`${PREFIX}antrian <buka|tutup|status|hapus>\` manage waiting voice queues\n\n` +
        '**Custom Role**\n' +
        `\`${PREFIX}rolepanel\` send the Custom Role panel\n` +
        `\`${PREFIX}whitelistrole <add/remove/list> [role]\` tier 1 whitelist\n` +
        `\`${PREFIX}whitelistfull <add/remove/list> [role]\` tier 2 whitelist\n\n` +
        `\`${PREFIX}help\` show this command list`;
}

// Tombol panel Custom Role (3 + 2, mirip referensi)
function panelButtons() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('crole_create').setLabel('Create Role').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('crole_manage').setLabel('Manage Role').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('crole_color').setLabel('Manage Color').setStyle(ButtonStyle.Primary),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('crole_position').setLabel('Manage Position').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('crole_delete').setLabel('Delete Role').setStyle(ButtonStyle.Danger),
    );
    return [row1, row2];
}

// Payload panel: pakai Components V2 (container + accent bar) kalau didukung, fallback ke teks biasa
function buildPanelPayload() {
    const buttons = panelButtons();
    if (SUPPORTS_V2_LAYOUT) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(PANEL_TEXT));
        return { components: [container, ...buttons], flags: MessageFlags.IsComponentsV2 };
    }
    return { content: PANEL_TEXT, components: buttons };
}

// Payload /help: sama, Components V2 tanpa embed
function buildHelpPayload() {
    const helpText = buildHelpText();
    if (SUPPORTS_V2_LAYOUT) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(helpText));
        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }
    return { content: helpText };
}

async function collectUserMessages(channel, userId, maxScan) {
    const collected = [];
    let lastId = null;
    let scanned = 0;
    while (scanned < maxScan) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        const batch = await channel.messages.fetch(options);
        if (batch.size === 0) break;
        for (const msg of batch.values()) {
            if (msg.author.id === userId) collected.push(msg);
        }
        scanned += batch.size;
        lastId = batch.last().id;
        if (batch.size < 100) break;
    }
    return collected; 
}

async function bulkDeleteMessages(channel, messages) {
    const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const deletable = messages.filter(m => (now - m.createdTimestamp) < TWO_WEEKS);
    const tooOld = messages.length - deletable.length;
    let deleted = 0;
    for (let i = 0; i < deletable.length; i += 100) {
        const chunk = deletable.slice(i, i + 100);
        if (chunk.length === 1) {
            await chunk[0].delete().catch(() => null);
            deleted += 1;
        } else if (chunk.length > 1) {
            const res = await channel.bulkDelete(chunk, true);
            deleted += res.size;
        }
    }
    return { deleted, tooOld };
}

/* =========================================================
 *  PREFIX COMMAND SYSTEM (semua fitur pakai prefix, tanpa slash)
 * ========================================================= */

const PREFIX = 'g!';

// Gate global: semua command prefix butuh role whitelist ATAU admin
function hasBotAccess(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return WHITELIST_ROLES.some(roleId => member.roles.cache.has(roleId));
}

// Cek permission spesifik (admin selalu lolos)
function memberCan(member, permFlag) {
    if (!member) return false;
    return member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(permFlag);
}

// Balas pakai embed (tanpa nge-ping pengirim)
const replyEmbed = (message, embed, extra = {}) =>
    message.reply({ embeds: [embed], allowedMentions: { repliedUser: false }, ...extra }).catch(() => null);

// ---- Resolver mention / ID ----
function resolveId(token) {
    if (!token) return null;
    const id = String(token).replace(/\D/g, '');
    return /^\d{17,20}$/.test(id) ? id : null;
}
async function resolveMember(guild, token) {
    const id = resolveId(token);
    if (!id) return null;
    return guild.members.cache.get(id) ?? await guild.members.fetch(id).catch(() => null);
}
async function resolveUser(token) {
    const id = resolveId(token);
    if (!id) return null;
    return client.users.cache.get(id) ?? await client.users.fetch(id).catch(() => null);
}
function resolveChannel(guild, token) {
    const id = resolveId(token);
    if (!id) return null;
    return guild.channels.cache.get(id) ?? null;
}
function resolveRole(guild, token) {
    const id = resolveId(token);
    if (!id) return null;
    return guild.roles.cache.get(id) ?? null;
}

/* ---------------- Command: .help ---------------- */
async function cmdHelp(message) {
    await message.channel.send(buildHelpPayload()).catch(() => null);
}

/* ---------------- Command: .setupradar (admin) ---------------- */
async function cmdSetupRadar(message) {
    if (!memberCan(message.member, PermissionFlagsBits.Administrator))
        return replyEmbed(message, redEmbed('Command ini khusus **Administrator**.', 'Akses Ditolak'));
    radarChannels.set(message.guild.id, message.channel.id);
    saveRadarChannels(radarChannels);
    return replyEmbed(message, redEmbed(`<:success:1526263116617482441> Setup berhasil. Sistem Radar Gokaizen akan mengirim log deteksi ancaman ke channel ${message.channel} ini.`, 'Radar Aktif'));
}

/* ---------------- Command: .ban ---------------- */
async function cmdBan(message, args) {
    if (!memberCan(message.member, PermissionFlagsBits.BanMembers))
        return replyEmbed(message, redEmbed('Kamu tidak punya permission **Ban Members**.', 'Akses Ditolak'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
        return replyEmbed(message, redEmbed('Bot tidak punya permission **Ban Members**.', 'Missing Permission'));

    if (!args[0]) return replyEmbed(message, redEmbed('Format: `.ban <user/ID> [hari 0-7] [alasan]`', 'Cara Pakai'));

    const targetId = resolveId(args[0]);
    if (!targetId) return replyEmbed(message, redEmbed('User ID atau mention tidak valid.', 'Invalid ID'));

    let deleteDays = 0;
    let reasonStart = 1;
    if (args[1] && /^\d+$/.test(args[1]) && +args[1] >= 0 && +args[1] <= 7) {
        deleteDays = +args[1];
        reasonStart = 2;
    }
    const reason = args.slice(reasonStart).join(' ') || 'No reason provided';

    if (targetId === message.author.id || targetId === message.guild.ownerId || targetId === client.user.id)
        return replyEmbed(message, redEmbed('Aksi tidak diizinkan pada user ini.', 'Action Not Allowed'));

    const targetMember = await message.guild.members.fetch(targetId).catch(() => null);
    if (targetMember) {
        const me = message.guild.members.me;
        if (me.roles.highest.position <= targetMember.roles.highest.position ||
            (targetMember.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId))
            return replyEmbed(message, redEmbed('Hierarki role mencegah aksi ini.', 'Insufficient Role'));
    }

    const existingBan = await message.guild.bans.fetch(targetId).catch(() => null);
    if (existingBan) return replyEmbed(message, redEmbed('User ini sudah dibanned.', 'Already Banned'));

    try {
        const targetUser = await client.users.fetch(targetId).catch(() => null);
        if (targetMember && targetUser) {
            await targetUser.send({ embeds: [new EmbedBuilder().setColor(RED).setTitle(`You have been banned from ${message.guild.name}`).addFields({ name: 'Reason', value: reason }).setTimestamp()] }).catch(() => null);
        }
        await message.guild.bans.create(targetId, { deleteMessageSeconds: deleteDays * 86400, reason: `${reason} — by ${message.author.tag}` });

        const embed = new EmbedBuilder().setColor(RED).setTitle('User Banned')
            .addFields(
                { name: 'User', value: targetUser ? `${targetUser.tag} (\`${targetId}\`)` : `\`${targetId}\``, inline: false },
                { name: 'Moderator', value: message.author.tag, inline: true },
                { name: 'Messages Deleted', value: deleteDays > 0 ? `Last ${deleteDays} day(s)` : 'None', inline: true },
                { name: 'Reason', value: reason, inline: false },
            ).setTimestamp();
        if (targetUser) embed.setThumbnail(targetUser.displayAvatarURL());
        return replyEmbed(message, embed);
    } catch (err) {
        return replyEmbed(message, redEmbed(`Gagal ban: ${err.message}`, 'Error'));
    }
}

/* ---------------- Command: .clearmsg ---------------- */
async function cmdClearmsg(message, args) {
    if (!memberCan(message.member, PermissionFlagsBits.ManageMessages))
        return replyEmbed(message, redEmbed('Kamu tidak punya permission **Manage Messages**.', 'Akses Ditolak'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages))
        return replyEmbed(message, redEmbed('Bot tidak punya permission **Manage Messages**.', 'Missing Permission'));

    const target = await resolveUser(args[0]);
    if (!target) return replyEmbed(message, redEmbed('Format: `.clearmsg <user/ID>`', 'Cara Pakai'));

    const textChannels = message.guild.channels.cache.filter(c => c.isTextBased());
    let totalDeleted = 0, totalTooOld = 0, channelsScanned = 0;

    const status = await message.reply({ embeds: [redEmbed(`Memulai pemindaian hingga **${MAX_SCAN}** pesan per channel dari **${target.username}** di **${textChannels.size}** channel...\n\n*Proses ini mungkin makan waktu beberapa detik hingga satu menit.*`, '🔄 Scanning Server...')], allowedMentions: { repliedUser: false } }).catch(() => null);

    for (const [_, channel] of textChannels) {
        try {
            const botPerms = channel.permissionsFor(message.guild.members.me);
            if (!botPerms || !botPerms.has(PermissionFlagsBits.ViewChannel) || !botPerms.has(PermissionFlagsBits.ManageMessages)) continue;
            const msgs = await collectUserMessages(channel, target.id, MAX_SCAN);
            if (msgs.length > 0) {
                const { deleted, tooOld } = await bulkDeleteMessages(channel, msgs);
                totalDeleted += deleted;
                totalTooOld += tooOld;
            }
            channelsScanned++;
        } catch (err) {
            console.error(`Gagal memindai channel ${channel.name}:`, err.message);
        }
    }

    let desc = `Berhasil memindai **${channelsScanned}** channel yang dapat diakses.\nMenghapus total **${totalDeleted}** pesan dari **${target.username}** di seluruh server.`;
    if (totalTooOld > 0) desc += `\n\n**${totalTooOld}** pesan dilewati karena usianya lebih dari 14 hari (Batas API Discord).`;
    if (totalDeleted === 0) desc = `Tidak ada pesan dari **${target.username}** yang ditemukan (dalam batas ${MAX_SCAN} pesan terakhir) di seluruh server.`;

    const doneEmbed = redEmbed(desc, '<:success:1526263116617482441> Messages Cleared (Server-Wide)');
    if (status) await status.edit({ embeds: [doneEmbed] }).catch(() => null);
    else await replyEmbed(message, doneEmbed);
}

/* ---------------- Command: .deletemsg ---------------- */
async function cmdDeletemsg(message, args) {
    if (!memberCan(message.member, PermissionFlagsBits.ManageMessages))
        return replyEmbed(message, redEmbed('Kamu tidak punya permission **Manage Messages**.', 'Akses Ditolak'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages))
        return replyEmbed(message, redEmbed('Bot tidak punya permission **Manage Messages**.', 'Missing Permission'));

    const target = await resolveUser(args[0]);
    const amount = parseInt(args[1], 10);
    if (!target || !amount || amount < 1 || amount > 100)
        return replyEmbed(message, redEmbed('Format: `.deletemsg <user/ID> <jumlah 1-100>`', 'Cara Pakai'));

    const all = await collectUserMessages(message.channel, target.id, MAX_SCAN);
    const toDelete = all.slice(0, amount);
    if (toDelete.length === 0) return replyEmbed(message, redEmbed(`Tidak ada pesan dari **${target.username}** yang ditemukan.`, 'Nothing to Delete'));

    const { deleted, tooOld } = await bulkDeleteMessages(message.channel, toDelete);
    let desc = `Menghapus **${deleted}** pesan dari **${target.username}**.`;
    if (tooOld > 0) desc += `\n\n**${tooOld}** pesan dilewati karena lebih dari 14 hari (Batas API Discord).`;
    return replyEmbed(message, redEmbed(desc, 'Messages Deleted'));
}

/* ---------------- Command: .copyperm ---------------- */
async function cmdCopyperm(message, args) {
    if (!memberCan(message.member, PermissionFlagsBits.ManageChannels))
        return replyEmbed(message, redEmbed('Kamu tidak punya permission **Manage Channels**.', 'Akses Ditolak'));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels))
        return replyEmbed(message, redEmbed('Bot tidak punya permission **Manage Channels**.', 'Missing Permission'));

    const source = resolveChannel(message.guild, args[0]);
    const target = resolveChannel(message.guild, args[1]);
    if (!source || !target) return replyEmbed(message, redEmbed('Format: `.copyperm <#source/ID> <#target/ID>`', 'Cara Pakai'));
    if (source.id === target.id) return replyEmbed(message, redEmbed('Channel source dan target harus berbeda.', 'Invalid Selection'));
    if (!source.permissionOverwrites || !target.permissionOverwrites) return replyEmbed(message, redEmbed('Salah satu channel tidak mendukung permission overwrite.', 'Unsupported Channel'));

    try {
        const overwrites = source.permissionOverwrites.cache.map(ow => ({ id: ow.id, type: ow.type, allow: ow.allow.bitfield, deny: ow.deny.bitfield }));
        await target.permissionOverwrites.set(overwrites);
        const embed = new EmbedBuilder().setColor(RED).setTitle('Permissions Copied')
            .setDescription(`Permission dari **${source.name}** disalin ke **${target.name}**.`)
            .addFields(
                { name: 'Source', value: `${source} (\`${source.id}\`)`, inline: false },
                { name: 'Target', value: `${target} (\`${target.id}\`)`, inline: false },
                { name: 'Overwrites Applied', value: `${overwrites.length}`, inline: true },
            ).setFooter({ text: `By ${message.author.tag}` }).setTimestamp();
        return replyEmbed(message, embed);
    } catch (err) {
        return replyEmbed(message, redEmbed(err.message, 'Copy Failed'));
    }
}

/* ---------------- Command: .addresponder ---------------- */
async function cmdAddResponder(message, rest) {
    if (!memberCan(message.member, PermissionFlagsBits.ManageMessages))
        return replyEmbed(message, redEmbed('Kamu tidak punya permission **Manage Messages**.', 'Akses Ditolak'));

    const p1 = rest.indexOf('|');
    const p2 = rest.indexOf('|', p1 + 1);
    if (p1 === -1 || p2 === -1)
        return replyEmbed(message, redEmbed('Format: `.addresponder <user/ID> | <trigger> | <balasan>`\n\nContoh:\n`.addresponder @user | halo donatur | Selamat datang bosku!`', 'Cara Pakai'));

    const userToken = rest.slice(0, p1).trim();
    const trigger = rest.slice(p1 + 1, p2).trim().toLowerCase();
    const replyText = rest.slice(p2 + 1).trim();

    const targetUser = await resolveUser(userToken);
    if (!targetUser) return replyEmbed(message, redEmbed('User tidak valid. Pakai mention atau ID di bagian pertama.', 'User Salah'));
    if (!trigger || !replyText) return replyEmbed(message, redEmbed('Trigger dan balasan tidak boleh kosong.', 'Data Kurang'));

    responders.set(trigger, { reply: replyText, ownerId: targetUser.id });
    saveResponders(responders);
    return replyEmbed(message, redEmbed(`Kata kunci **${trigger}** berhasil ditambahkan khusus untuk ${targetUser}.\n\n**Balasan:**\n${replyText}`, 'Auto-Responder Ditambahkan'));
}

/* ---------------- Command: .delresponder ---------------- */
async function cmdDelResponder(message, rest) {
    if (!memberCan(message.member, PermissionFlagsBits.ManageMessages))
        return replyEmbed(message, redEmbed('Kamu tidak punya permission **Manage Messages**.', 'Akses Ditolak'));
    const trigger = rest.trim().toLowerCase();
    if (!trigger) return replyEmbed(message, redEmbed('Format: `.delresponder <trigger>`', 'Cara Pakai'));
    if (!responders.has(trigger)) return replyEmbed(message, redEmbed(`Kata kunci **${trigger}** tidak ditemukan di database.`, 'Tidak Ditemukan'));
    responders.delete(trigger);
    saveResponders(responders);
    return replyEmbed(message, redEmbed(`Kata kunci **${trigger}** berhasil dihapus.`, 'Auto-Responder Dihapus'));
}

/* ---------------- Command: .listresponder ---------------- */
async function cmdListResponder(message) {
    if (responders.size === 0) return replyEmbed(message, redEmbed('Belum ada auto-responder yang diatur.', 'Daftar Auto-Responder'));
    let list = '';
    for (const [trigger, data] of responders) {
        const owner = data.ownerId ? `<@${data.ownerId}>` : 'Semua User';
        const r = data.reply || data;
        list += `• **Trigger:** \`${trigger}\`\n  **User:** ${owner}\n  **Reply:** ${r}\n\n`;
    }
    return replyEmbed(message, redEmbed(list, 'Daftar Auto-Responder'));
}

/* ---------------- Command: .rolepanel (admin) ---------------- */
async function cmdRolepanel(message) {
    if (!memberCan(message.member, PermissionFlagsBits.Administrator))
        return replyEmbed(message, redEmbed('Command ini khusus **Administrator**.', 'Akses Ditolak'));
    await message.channel.send(buildPanelPayload()).catch(() => null);
    return replyEmbed(message, redEmbed('<:success:1526263116617482441> Panel Custom Role berhasil dikirim.', 'Berhasil'));
}

/* ---------------- Command: .whitelistrole / .whitelistfull (admin) ---------------- */
async function handleWhitelist(message, args, tierKey, tierLabel, addNote) {
    const cmdName = tierKey === 'whitelistRoles' ? 'whitelistrole' : 'whitelistfull';
    if (!memberCan(message.member, PermissionFlagsBits.Administrator))
        return replyEmbed(message, infoEmbed('Command ini khusus **Administrator**.', 'Akses Ditolak'));

    const sub = (args[0] || '').toLowerCase();
    const cfg = getGuildCfg(message.guild.id);

    if (sub === 'add') {
        const role = resolveRole(message.guild, args[1]);
        if (!role) return replyEmbed(message, infoEmbed(`Format: \`${PREFIX}${cmdName} add <@role/ID>\``, 'Cara Pakai'));
        if (cfg[tierKey].includes(role.id)) return replyEmbed(message, infoEmbed(`Role ${role} sudah ada di ${tierLabel}.`, 'Sudah Ada'));
        cfg[tierKey].push(role.id);
        saveCustomRoleData(customRoleData);
        return replyEmbed(message, infoEmbed(`Role ${role} ditambahkan ke **${tierLabel}**.\n${addNote}`, tierLabel));
    }

    if (sub === 'remove') {
        const role = resolveRole(message.guild, args[1]);
        if (!role) return replyEmbed(message, infoEmbed(`Format: \`${PREFIX}${cmdName} remove <@role/ID>\``, 'Cara Pakai'));
        if (!cfg[tierKey].includes(role.id)) return replyEmbed(message, infoEmbed(`Role ${role} tidak ada di ${tierLabel}.`, 'Tidak Ada'));
        cfg[tierKey] = cfg[tierKey].filter(r => r !== role.id);
        saveCustomRoleData(customRoleData);
        return replyEmbed(message, infoEmbed(`Role ${role} dihapus dari ${tierLabel}.`, tierLabel));
    }

    if (sub === 'list') {
        if (cfg[tierKey].length === 0) return replyEmbed(message, infoEmbed(`Belum ada role di ${tierLabel}. Tambahkan dengan \`${PREFIX}${cmdName} add\`.`, tierLabel));
        const list = cfg[tierKey].map(r => `• <@&${r}>`).join('\n');
        return replyEmbed(message, infoEmbed(list, tierLabel));
    }

    return replyEmbed(message, infoEmbed(`Sub-command: \`add\`, \`remove\`, atau \`list\`.\nContoh: \`${PREFIX}${cmdName} add @role\``, 'Cara Pakai'));
}

/* ---------------- Command: g!tarik (staff atau whitelist) ---------------- */
async function cmdStaffTarik(message, args) {
    const canUseTarik = memberCan(message.member, PermissionFlagsBits.ModerateMembers) || hasBotAccess(message.member);
    if (!canUseTarik) {
        return replyEmbed(message, redEmbed('Command ini khusus **staff** atau member dengan akses whitelist.', 'Akses Ditolak'));
    }

    const userVC = message.member.voice.channel;
    if (!userVC) {
        return replyEmbed(message, redEmbed('Kamu harus berada di voice channel untuk memakai `g!tarik`.', 'Harus di Voice Channel'));
    }

    if (!args[0]) {
        return replyEmbed(message, infoEmbed('Format: `g!tarik <@user/ID>`\n\nContoh:\n`g!tarik @user`\n`g!tarik 123456789012345678`', 'Cara Pakai'));
    }

    const target = message.mentions.members.first() || await resolveMember(message.guild, args[0]);
    if (!target) {
        return replyEmbed(message, redEmbed('User tidak ditemukan di server ini.', 'User Tidak Ditemukan'));
    }
    if (target.id === message.author.id) {
        return replyEmbed(message, redEmbed('Tidak bisa menarik diri sendiri.', 'Tidak Valid'));
    }
    // if (target.user.bot) {
    //     return replyEmbed(message, redEmbed('Bot tidak bisa dijadikan target tarik.', 'Target Tidak Valid'));
    // }
    if (!target.voice.channel) {
        return replyEmbed(message, redEmbed(`${target.user.tag} sedang tidak berada di voice channel.`, 'Tidak di Voice'));
    }
    if (target.voice.channel.id === userVC.id) {
        return replyEmbed(message, redEmbed(`${target.user.tag} sudah berada di voice channel yang sama.`, 'Sudah Satu VC'));
    }
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return replyEmbed(message, redEmbed('Bot membutuhkan permission **Move Members** untuk menarik member, termasuk saat voice channel sudah penuh.', 'Missing Permission'));
    }

    const asal = target.voice.channel;

    try {
        await target.voice.setChannel(userVC, `Ditarik staff oleh ${message.author.tag}`);
    } catch (err) {
        return replyEmbed(message, redEmbed(`Gagal menarik member: ${err.message}`, 'Tarik Gagal'));
    }

    return replyEmbed(message, infoEmbed(
        `**Member Ditarik**\n\n• Target: ${target}\n• Dari: ${asal.name}\n• Ke: ${userVC.name}`,
        'Berhasil'
    ));
}

/* ---------------- Command: .warp ---------------- */
async function cmdWarp(message, args) {
    const hasPermission = WHITELIST_ROLES.some(roleId => message.member.roles.cache.has(roleId));
    if (!hasPermission) return;

    const userVC = message.member.voice.channel;
    if (!userVC) {
        return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setTitle('<:error:1524111354057981992> Harus di Voice Channel').setDescription('Kamu harus berada di voice channel untuk menggunakan `.warp`.')] });
    }
    if (!args[0]) {
        return message.reply({ embeds: [new EmbedBuilder().setColor('Yellow').setTitle('📌 Cara Penggunaan').setDescription('Gunakan mention, ID, atau `random`.').addFields({ name: 'Contoh', value: '`.warp @user`\n`.warp 123456789012345678`\n`.warp random`' })] });
    }

    let target;
    if (args[0].toLowerCase() === 'random') {
        const voiceMembers = message.guild.members.cache.filter(m => m.voice.channel && !m.user.bot && m.id !== message.member.id);
        if (!voiceMembers.size) {
            return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setTitle('<:error:1524111354057981992> Tidak Ada User').setDescription('Tidak ada member valid di voice channel.')] });
        }
        target = voiceMembers.random();
    } else {
        if (message.mentions.members.size > 0) {
            target = message.mentions.members.first();
        } else {
            const userId = args[0].replace(/\D/g, '');
            if (!userId) return;
            target = await message.guild.members.fetch(userId).catch(() => null);
        }
    }

    if (!target) return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setTitle('<:error:1524111354057981992> User Tidak Ditemukan')] });
    if (target.user.bot) return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setTitle('<:error:1524111354057981992> Tidak Bisa Warp Bot').setDescription('Bot tidak bisa dijadikan target warp.')] });
    if (!target.voice.channel) return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setTitle('<:error:1524111354057981992> Gagal Warp').setDescription(`${target.user.tag} tidak berada di voice channel.`)] });

    const targetVC = target.voice.channel;
    if (targetVC.id === userVC.id) return message.reply({ embeds: [new EmbedBuilder().setColor('Yellow').setTitle('<:warn:1526263159575412890> Sudah Satu VC').setDescription(`Kamu sudah berada di voice yang sama dengan ${target.user.tag}.`)] });

    const everyoneOverwrite = targetVC.permissionOverwrites.cache.get(message.guild.id);
    if (everyoneOverwrite && everyoneOverwrite.deny.has(PermissionsBitField.Flags.Connect)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setTitle('🔒 Voice Channel Dikunci').setDescription('Voice channel target sedang di-lock.')] });
    }

    const userLimit = targetVC.userLimit;
    if (userLimit > 0 && targetVC.members.size >= userLimit) {
        return message.reply({ embeds: [new EmbedBuilder().setColor('Red').setTitle('🚫 Voice Channel Penuh').setDescription(`Voice channel target penuh (${targetVC.members.size}/${userLimit}).`)] });
    }

    let warpSuccess = true;
    try { await message.member.voice.setChannel(targetVC); } catch (err) { warpSuccess = false; }

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(warpSuccess ? 'Green' : 'Red')
                .setTitle(warpSuccess ? '<:warp:1526263209089302568> Warp Berhasil' : '<:error:1524111354057981992> Warp Gagal')
                .setDescription(warpSuccess ? `Berhasil dipindahkan ke VC ${target}.` : `Gagal dipindahkan ke VC ${target}.`)
                .addFields(
                    { name: '<:voice:1526263145083965701> Voice Channel', value: `${targetVC.name}`, inline: true },
                    { name: '<:users:1526263130433257607> Jumlah User', value: `${targetVC.members.size} orang`, inline: true }
                )
                .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp()
        ]
    });
}

/* ---------------- Radar anti-scam (dipanggil untuk semua pesan) ---------------- */
async function runRadarCheck(message) {
    const imageAttachments = message.attachments.filter(att =>
        (att.contentType && att.contentType.startsWith('image/')) ||
        /\.(png|jpe?g|gif|webp)$/i.test(att.name ?? '')
    );
    if (imageAttachments.size < IMAGE_THRESHOLD) return;

    const radarChannelId = radarChannels.get(message.guild.id);
    if (!radarChannelId) return;
    const radarChannel = message.guild.channels.cache.get(radarChannelId)
        ?? await message.guild.channels.fetch(radarChannelId).catch(() => null);
    if (!radarChannel || !radarChannel.isTextBased()) return;

    const radarEmbed = new EmbedBuilder()
        .setTitle('RADAR GOKAIZEN: INDIKASI SCAM')
        .setColor(RED)
        .setDescription(`Terdeteksi pola serangan akun hacked (mengirim ${imageAttachments.size} gambar sekaligus). Segera lakukan pengecekan manual.`)
        .addFields(
            { name: 'User', value: `${message.author} (${message.author.id})`, inline: true },
            { name: 'Lokasi', value: `${message.channel}`, inline: true },
            { name: 'Link Pesan', value: `[Klik di sini untuk melihat pesan](${message.url})`, inline: false }
        )
        .setFooter({ text: '\u200b', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

    const mentionContent = ALERT_ROLES.map(id => `<@&${id}>`).join(' ');
    await radarChannel.send({ content: mentionContent, embeds: [radarEmbed], allowedMentions: { roles: ALERT_ROLES } }).catch(() => null);
}

async function handleReady(c) {
    client = c;
    console.log(`✅ Bot online as ${client.user.tag}`);
    client.user.setActivity(`${PREFIX}help`, { type: ActivityType.Listening });
}

// ===== Handler khusus Custom Role (tombol & modal) =====
async function handleInteraction(interaction) {
    if (!client) client = interaction.client;
    // Balas aman: kalau sudah defer -> editReply, kalau belum -> reply ephemeral
    const replyEph = async (embed, extra = {}) => {
        try {
            if (interaction.deferred || interaction.replied) return await interaction.editReply({ embeds: [embed], ...extra });
            return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, ...extra });
        } catch (e) { return null; }
    };

    try {
        const isCustomRole = (interaction.isButton() || interaction.isModalSubmit()) && interaction.customId?.startsWith('crole_');
        if (!isCustomRole || !interaction.inGuild()) return;

        const member = interaction.member;
        if (!canUseCustomRole(member)) {
            return replyEph(infoEmbed('<:deny:1524111143394607255> Kamu tidak punya akses ke fitur Custom Role. Hubungi admin untuk minta akses.', 'Akses Ditolak'));
        }

        // Cek permission bot via CACHE saja (tanpa fetch) supaya ack tombol tidak pernah lewat 3 detik
        const me = interaction.guild.members.me;
        if (me && !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return replyEph(infoEmbed('Bot tidak punya permission **Manage Roles**.', 'Missing Permission'));
        }

        const id = interaction.customId;
        const cfg = getGuildCfg(interaction.guild.id);

        // ---------- TOMBOL ----------
        if (interaction.isButton()) {
            // Create Role -> buka form editor. Kalau sudah punya role, blokir (harus pakai Manage Role)
            if (id === 'crole_create') {
                if (cfg.roles[member.id]) {
                    return replyEph(infoEmbed(`Kamu sudah punya custom role <@&${cfg.roles[member.id]}>. Tombol **Create Role** tidak bisa dipakai lagi — gunakan **Manage Role** untuk mengubahnya.`, 'Sudah Punya Role'));
                }
                try { return await interaction.showModal(buildEditorModal('create', null, canUseAdvancedColor(member))); }
                catch (e) { return replyEph(infoEmbed('Gagal membuka form. Versi discord.js kemungkinan belum mendukung upload di modal.\nDetail: ' + e.message, 'Error')); }
            }

            // Manage Role -> buka form editor (mode manage), prefill nama dari cache bila ada
            if (id === 'crole_manage') {
                if (!cfg.roles[member.id]) return replyEph(infoEmbed('Kamu belum punya custom role. Klik **Create Role** dulu.', 'Belum Ada Role'));
                const cached = getCachedCustomRole(interaction.guild, member.id);
                try { return await interaction.showModal(buildEditorModal('manage', cached, canUseAdvancedColor(member))); }
                catch (e) { return replyEph(infoEmbed('Gagal membuka form.\nDetail: ' + e.message, 'Error')); }
            }

            // Manage Color -> tampilkan pilihan tipe (Solid untuk semua, Gradient/Holo khusus tier 2)
            if (id === 'crole_color') {
                if (!cfg.roles[member.id]) return replyEph(infoEmbed('Kamu belum punya custom role. Klik **Create Role** dulu.', 'Belum Ada Role'));
                const advanced = canUseAdvancedColor(member);
                const btns = [new ButtonBuilder().setCustomId('crole_color_solid').setLabel('Solid').setStyle(ButtonStyle.Primary)];
                if (advanced) {
                    btns.push(new ButtonBuilder().setCustomId('crole_color_gradient').setLabel('Gradient').setStyle(ButtonStyle.Primary));
                    btns.push(new ButtonBuilder().setCustomId('crole_color_holo').setLabel('Holographic').setStyle(ButtonStyle.Secondary));
                }
                const row = new ActionRowBuilder().addComponents(...btns);
                const note = advanced ? '' : '\nGradient & holographic khusus akses tier 2.';
                return replyEph(infoEmbed('Pilih tipe warna untuk custom role kamu:' + note, 'Manage Color'), { components: [row] });
            }

            // Solid / Gradient -> langsung buka modal (verifikasi role dilakukan saat submit)
            if (id === 'crole_color_solid' || id === 'crole_color_gradient') {
                const gradient = id === 'crole_color_gradient';
                if (gradient && !canUseAdvancedColor(member)) return replyEph(infoEmbed('<:deny:1524111143394607255> Warna gradient khusus akses **tier 2**. Minta admin untuk whitelist tier 2.', 'Akses Terbatas'));
                const modal = new ModalBuilder().setCustomId(gradient ? 'crole_modal_gradient' : 'crole_modal_solid').setTitle(gradient ? 'Warna Gradient' : 'Warna Solid');
                const rows = [new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('primary').setLabel(gradient ? 'Warna Awal HEX' : 'Warna HEX').setPlaceholder('#FF00AA').setStyle(TextInputStyle.Short).setMaxLength(7).setRequired(true))];
                if (gradient) rows.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('secondary').setLabel('Warna Akhir HEX').setPlaceholder('#00E0FF').setStyle(TextInputStyle.Short).setMaxLength(7).setRequired(true)));
                modal.addComponents(...rows);
                try { return await interaction.showModal(modal); }
                catch (e) { return replyEph(infoEmbed('Gagal membuka form. ' + e.message, 'Error')); }
            }

            // Holographic -> defer dulu baru apply (khusus tier 2)
            if (id === 'crole_color_holo') {
                if (!canUseAdvancedColor(member)) return replyEph(infoEmbed('<:deny:1524111143394607255> Warna holographic khusus akses **tier 2**. Minta admin untuk whitelist tier 2.', 'Akses Terbatas'));
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const role = await getUserCustomRole(interaction.guild, member.id);
                if (!role) return replyEph(infoEmbed('Role tidak ditemukan. Buat ulang.', 'Error'));
                try {
                    await setRoleColors(interaction.guild.id, role.id, HOLOGRAPHIC.primary, HOLOGRAPHIC.secondary, HOLOGRAPHIC.tertiary);
                    return replyEph(infoEmbed(`Warna holographic berhasil diterapkan ke ${role}.`, 'Berhasil'));
                } catch (err) { return replyEph(infoEmbed(gradientErrorMsg(err), 'Gagal')); }
            }

            // Manage Position -> pilihan Display / Non-Display
            if (id === 'crole_position') {
                if (!cfg.roles[member.id]) return replyEph(infoEmbed('Kamu belum punya custom role. Klik **Create Role** dulu.', 'Belum Ada Role'));
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('crole_pos_display').setLabel('Jadikan Warna Nama').setStyle(ButtonStyle.Success).setEmoji({ id: '1526262245342974003', name: 'display' }),
                    new ButtonBuilder().setCustomId('crole_pos_nondisplay').setLabel('Bukan Warna Nama').setStyle(ButtonStyle.Secondary).setEmoji({ id: '1526262771669270529', name: 'non_display' }),
                );
                return replyEph(infoEmbed('Atur posisi custom role kamu:\n<:display:1526262245342974003> **Jadikan Warna Nama** — role ditaruh di atas, warnanya dipakai untuk nama kamu\n<:non_display:1526262771669270529> **Bukan Warna Nama** — role ditaruh paling bawah, warna nama diambil dari role lain', 'Atur Posisi'), { components: [row] });
            }

            if (id === 'crole_pos_display' || id === 'crole_pos_nondisplay') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const role = await getUserCustomRole(interaction.guild, member.id);
                if (!role) return replyEph(infoEmbed('Role tidak ditemukan. Buat ulang.', 'Error'));
                const utama = id === 'crole_pos_display';
                try {
                    const target = await hitungPosisiCustomRole(interaction.guild, utama);

                    // tampil terpisah dan penyebutan sengaja dibiarkan mati
                    await role.setHoist(false).catch(() => null);
                    await role.setMentionable(false).catch(() => null);
                    await role.setPosition(target);

                    const fresh = await interaction.guild.roles.fetch(role.id).catch(() => role);
                    const label = utama
                        ? 'dipakai sebagai warna nama kamu'
                        : 'berada di urutan paling bawah, sehingga warna nama diambil dari role lain';
                    return replyEph(infoEmbed(`Role ${role} sekarang **${label}**. Posisi: **${fresh.position}**.`, 'Posisi Diubah'));
                } catch (err) { return replyEph(infoEmbed('Gagal atur posisi. Role custom tidak bisa berada di atas role bot.\nDetail: ' + err.message, 'Gagal')); }
            }

            // Delete
            if (id === 'crole_delete') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const role = await getUserCustomRole(interaction.guild, member.id);
                if (!role) return replyEph(infoEmbed('Kamu belum punya custom role untuk dihapus.', 'Belum Ada Role'));
                await role.delete('Custom role dihapus oleh pemilik').catch(() => null);
                delete cfg.roles[member.id];
                saveCustomRoleData(customRoleData);
                return replyEph(infoEmbed('Custom role kamu berhasil dihapus.', 'Role Dihapus'));
            }
            return;
        }

        // ---------- MODAL ----------
        if (interaction.isModalSubmit()) {
            const getText = (cid) => { try { return interaction.fields.getTextInputValue(cid); } catch (e) { return ''; } };

            // Editor gabungan (Create / Manage) -> nama + warna + icon upload
            if (id.startsWith('crole_editor:')) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const mode = id.slice('crole_editor:'.length) === 'manage' ? 'manage' : 'create';

                let role = null;
                if (mode === 'manage') {
                    role = await getUserCustomRole(interaction.guild, member.id);
                    if (!role) return replyEph(infoEmbed('Role tidak ditemukan. Buat dulu lewat Create Role.', 'Error'));
                } else {
                    const existing = await getUserCustomRole(interaction.guild, member.id);
                    if (existing) return replyEph(infoEmbed(`Kamu sudah punya custom role ${existing}. Gunakan Manage Role.`, 'Sudah Punya Role'));
                }

                const name = (getText('name') || '').trim().slice(0, 100);
                if (mode === 'create' && !name) return replyEph(infoEmbed('Nama role wajib diisi saat membuat role.', 'Nama Kosong'));

                // Tentukan tipe warna (dari select v2, atau infer dari field klasik)
                let ctype = 'none';
                try {
                    let sv = null;
                    if (typeof interaction.fields.getStringSelectValues === 'function') sv = interaction.fields.getStringSelectValues('ctype');
                    else if (typeof interaction.fields.getField === 'function') sv = interaction.fields.getField('ctype')?.values;
                    if (sv && sv[0]) ctype = sv[0];
                } catch (e) {}
                const hex1raw = getText('hex1');
                const hex2raw = getText('hex2');
                const holoRaw = (getText('holo') || '').trim().toLowerCase();
                if (ctype === 'none') {
                    if (['ya', 'yes', 'y', 'holo'].includes(holoRaw)) ctype = 'holo';
                    else if (hex1raw && hex2raw) ctype = 'gradient';
                    else if (hex1raw) ctype = 'solid';
                }

                if ((ctype === 'gradient' || ctype === 'holo') && !canUseAdvancedColor(member)) {
                    return replyEph(infoEmbed('<:deny:1524111143394607255> Kamu tidak punya akses ke warna gradient/holographic. Minta admin untuk whitelist tier 2.', 'Akses Terbatas'));
                }

                let p = null, s = null;
                if (ctype === 'solid') { p = parseHex(hex1raw); if (p === null) return replyEph(infoEmbed('HEX Warna 1 tidak valid. Contoh: `#FF00AA`.', 'HEX Salah')); }
                if (ctype === 'gradient') { p = parseHex(hex1raw); s = parseHex(hex2raw); if (p === null || s === null) return replyEph(infoEmbed('HEX gradient tidak valid. Isi kedua warna, contoh `#FF00AA` & `#00E0FF`.', 'HEX Salah')); }

                // Buat role tanpa param color (hindari deprecation) — warna diset via setRoleColors
                if (mode === 'create') {
                    try {
                        role = await interaction.guild.roles.create({
                            name: name || 'Custom Role',
                            permissions: [],
                            hoist: false,
                            mentionable: false,
                            reason: `Custom role untuk ${member.user.tag}`,
                        });
                    }
                    catch (err) { return replyEph(infoEmbed('Gagal membuat role: ' + err.message, 'Error')); }
                    try {
                        await role.setPosition(await hitungPosisiCustomRole(interaction.guild, true));
                    } catch (e) {}
                    await member.roles.add(role).catch(() => null);
                    cfg.roles[member.id] = role.id;
                    saveCustomRoleData(customRoleData);
                } else if (name) {
                    await role.setName(name).catch(() => null);
                }

                // Terapkan warna
                let note = '';
                try {
                    if (ctype === 'solid') await setRoleColors(interaction.guild.id, role.id, p, null, null);
                    else if (ctype === 'gradient') await setRoleColors(interaction.guild.id, role.id, p, s, null);
                    else if (ctype === 'holo') await setRoleColors(interaction.guild.id, role.id, HOLOGRAPHIC.primary, HOLOGRAPHIC.secondary, HOLOGRAPHIC.tertiary);
                } catch (err) { note += '\n<:warn:1526263159575412890> Warna gagal diterapkan: gradient/holographic butuh **Enhanced Role Colors** (Server Boost).'; }

                // Terapkan icon dari upload (atau URL fallback pada modal klasik)
                const att = getUploadedAttachment(interaction, 'icon');
                const iconUrlFallback = (getText('iconurl') || '').trim();
                if (att && isImageAttachment(att)) {
                    try { await setRoleIconFromAttachment(role, att); }
                    catch (err) { note += '\n<:warn:1526263159575412890> Icon gagal: butuh fitur **Role Icons** (Boost Level 2).'; }
                } else if (att) {
                    note += '\n<:warn:1526263159575412890> File yang diupload bukan gambar, icon dilewati.';
                } else if (iconUrlFallback) {
                    try { await role.setUnicodeEmoji(null).catch(() => null); await role.setIcon(iconUrlFallback); }
                    catch (err) { note += '\n<:warn:1526263159575412890> Icon (URL) gagal: butuh **Role Icons** (Boost Level 2) & URL valid.'; }
                }

                const title = mode === 'create' ? 'Role Dibuat' : 'Role Diperbarui';
                const base = mode === 'create'
                    ? `Custom role ${role} berhasil dibuat & diberikan ke kamu.`
                    : `Custom role ${role} berhasil diperbarui.`;
                return replyEph(infoEmbed(base + note, title));
            }

            // Manage Color - solid
            if (id === 'crole_modal_solid') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const role = await getUserCustomRole(interaction.guild, member.id);
                if (!role) return replyEph(infoEmbed('Role tidak ditemukan. Buat ulang.', 'Error'));
                const c = parseHex(getText('primary'));
                if (c === null) return replyEph(infoEmbed('Format HEX tidak valid. Contoh: `#FF00AA`.', 'HEX Salah'));
                try { await setRoleColors(interaction.guild.id, role.id, c, null, null); return replyEph(infoEmbed(`Warna solid berhasil diterapkan ke ${role}.`, 'Berhasil')); }
                catch (err) {
                    try { await role.setColor(c); return replyEph(infoEmbed(`Warna solid berhasil diterapkan ke ${role}.`, 'Berhasil')); }
                    catch (e2) { return replyEph(infoEmbed('Gagal set warna: ' + e2.message, 'Error')); }
                }
            }

            // Manage Color - gradient
            if (id === 'crole_modal_gradient') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                if (!canUseAdvancedColor(member)) return replyEph(infoEmbed('<:deny:1524111143394607255> Warna gradient khusus akses **tier 2**.', 'Akses Terbatas'));
                const role = await getUserCustomRole(interaction.guild, member.id);
                if (!role) return replyEph(infoEmbed('Role tidak ditemukan. Buat ulang.', 'Error'));
                const p = parseHex(getText('primary'));
                const s = parseHex(getText('secondary'));
                if (p === null || s === null) return replyEph(infoEmbed('Salah satu HEX tidak valid. Contoh: `#FF00AA`.', 'HEX Salah'));
                try { await setRoleColors(interaction.guild.id, role.id, p, s, null); return replyEph(infoEmbed(`Warna gradient berhasil diterapkan ke ${role}.`, 'Berhasil')); }
                catch (err) { return replyEph(infoEmbed(gradientErrorMsg(err), 'Gagal')); }
            }
            return;
        }
    } catch (err) {
        try { await replyEph(infoEmbed('Terjadi error: ' + (err && err.message), 'Error')); } catch (e) {}
    }
}

async function handleMessage(message) {
    if (!client) client = message.client;
    try {
        if (message.author.bot || !message.inGuild()) return;

        // 1) Radar Anti-Scam — dicek paling awal supaya tidak bisa di-bypass command apa pun
        await runRadarCheck(message);

        const lower = message.content.trim().toLowerCase();

        // 2) Command "gosmed" / "goline" khusus admin & role tertentu (tanpa prefix, exact word)
        if (lower === 'gosmed' || lower === 'goline') {
            if (!canUseGoCmd(message.member)) return;
            const channel = message.channel;
            if (message.deletable) await message.delete().catch(() => null);
            if (lower === 'gosmed') {
                await channel.send({ content: GOSMED_REPLY }).catch(() => null);
            } else {
                if (fs.existsSync(GOLINE_IMAGE)) {
                    await channel.send({ files: [GOLINE_IMAGE] }).catch(() => null);
                } else {
                    await channel.send({ content: '<:warn:1526263159575412890> File `goline.png` belum ada di folder bot.' }).catch(() => null);
                }
            }
            return;
        }

        // 3) Auto-Responder (pesan biasa tanpa prefix)
        if (!message.content.startsWith(PREFIX)) {
            if (responders.has(lower)) {
                const data = responders.get(lower);
                const isOwner = data.ownerId ? (message.author.id === data.ownerId) : true;
                const replyContent = data.reply || data;
                if (isOwner) {
                    await message.reply({ content: replyContent, allowedMentions: { repliedUser: false } }).catch(() => null);
                }
            }
            return;
        }

        // 4) Prefix Commands
        const body = message.content.slice(PREFIX.length);
        const firstSpace = body.search(/\s/);
        const command = (firstSpace === -1 ? body : body.slice(0, firstSpace)).toLowerCase();
        const rest = firstSpace === -1 ? '' : body.slice(firstSpace + 1).trim();
        const args = rest.length ? rest.split(/\s+/) : [];

        if (!command) return;

        // Gate: semua command prefix butuh role whitelist ATAU admin. Kalau tidak punya akses, diam saja.
        if (!hasBotAccess(message.member)) return;

        switch (command) {
            case 'help':          await cmdHelp(message); break;
            case 'ban':           await cmdBan(message, args); break;
            case 'clearmsg':      await cmdClearmsg(message, args); break;
            case 'deletemsg':     await cmdDeletemsg(message, args); break;
            case 'copyperm':      await cmdCopyperm(message, args); break;
            case 'setupradar':    await cmdSetupRadar(message); break;
            case 'addresponder':  await cmdAddResponder(message, rest); break;
            case 'delresponder':  await cmdDelResponder(message, rest); break;
            case 'listresponder': await cmdListResponder(message); break;
            case 'rolepanel':     await cmdRolepanel(message); break;
            case 'whitelistrole': await handleWhitelist(message, args, 'whitelistRoles', 'Whitelist Tier 1 (nama, solid, icon)', 'Member dengan role ini bisa atur nama, warna **solid**, dan icon.'); break;
            case 'whitelistfull': await handleWhitelist(message, args, 'whitelist2', 'Whitelist Tier 2 (semua akses)', 'Member dengan role ini dapat **semua** akses: nama, solid, gradient, holographic, dan icon.'); break;
            case 'warp':          await cmdWarp(message, args); break;
            case 'tarik':         await cmdStaffTarik(message, args); break;
            default:              break;
        }
    } catch (err) {}
}

module.exports = { handleReady, handleInteraction, handleMessage };
