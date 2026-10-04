const fs = require('fs');
const path = require('path');
const {
    PermissionFlagsBits,
    EmbedBuilder,
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
const PREFIX = 'c!';

// Role acuan tempat custom role ditempatkan. Isi dengan ID role di server tujuan.
const CROLE_ANCHOR_ID = '1549397550857981982';

// Konfigurasi awal per guild, isi manual sesuai server yang dipakai.
// whitelistRoles = tier 1 (nama, solid, icon), whitelist2 = tier 2 (semua akses termasuk gradient/holo).
// Mapping "roles" (siapa punya custom role apa) tidak perlu diisi manual, otomatis terisi saat member bikin role.
const CUSTOM_ROLE_CONFIG = {
    '1426083260487962819': {
        whitelistRoles: [],
        whitelist2: [],
        roles: {},
    },
};

const HOLOGRAPHIC = { primary: 11127295, secondary: 16759788, tertiary: 16761760 };

const SUPPORTS_MODAL_V2 = typeof LabelBuilder === 'function' && typeof FileUploadBuilder === 'function';
const SUPPORTS_V2_LAYOUT = typeof ContainerBuilder === 'function' && typeof TextDisplayBuilder === 'function' && MessageFlags.IsComponentsV2 !== undefined;

// State runtime (mapping user -> custom role) disimpan di sini biar tetap ada setelah bot restart.
// Kalau file ini belum ada, otomatis dibuat dari CUSTOM_ROLE_CONFIG di atas.
const CUSTOM_ROLE_STATE_PATH = path.join(__dirname, 'customrole-state.json');

function loadCustomRoleData() {
    try {
        if (fs.existsSync(CUSTOM_ROLE_STATE_PATH)) {
            return JSON.parse(fs.readFileSync(CUSTOM_ROLE_STATE_PATH, 'utf8'));
        }
    } catch (err) {}
    return JSON.parse(JSON.stringify(CUSTOM_ROLE_CONFIG));
}

function saveCustomRoleData(data) {
    try {
        const tmp = `${CUSTOM_ROLE_STATE_PATH}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, CUSTOM_ROLE_STATE_PATH);
    } catch (err) {}
}

const customRoleData = loadCustomRoleData();

function getGuildCfg(guildId) {
    if (!customRoleData[guildId]) customRoleData[guildId] = { whitelistRoles: [], whitelist2: [], roles: {} };
    if (!customRoleData[guildId].whitelistRoles) customRoleData[guildId].whitelistRoles = [];
    if (!customRoleData[guildId].whitelist2) customRoleData[guildId].whitelist2 = [];
    if (!customRoleData[guildId].roles) customRoleData[guildId].roles = {};
    return customRoleData[guildId];
}

function canUseCustomRole(member) {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    const cfg = getGuildCfg(member.guild.id);
    return cfg.whitelistRoles.some(r => member.roles.cache.has(r)) || cfg.whitelist2.some(r => member.roles.cache.has(r));
}

function canUseAdvancedColor(member) {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    const cfg = getGuildCfg(member.guild.id);
    return cfg.whitelist2.some(r => member.roles.cache.has(r));
}

// Custom role selalu ditempatkan tepat di bawah role acuan supaya posisinya
// tidak ikut naik turun mengikuti posisi role bot.
// utama true  : tepat di bawah role acuan, jadi warna nama diambil dari role ini
// utama false : paling bawah, warna nama diambil dari role lain
async function hitungPosisiCustomRole(guild, utama) {
    if (!utama) return 1;

    const acuan = guild.roles.cache.get(CROLE_ANCHOR_ID)
        || await guild.roles.fetch(CROLE_ANCHOR_ID).catch(() => null);

    const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    const batasBot = me ? me.roles.highest.position - 1 : null;

    if (!acuan) return Math.max(1, batasBot || 1);

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

function getCachedCustomRole(guild, userId) {
    const cfg = getGuildCfg(guild.id);
    const rid = cfg.roles[userId];
    if (!rid) return null;
    return guild.roles.cache.get(rid) || null;
}

async function setRoleColors(client, guildId, roleId, primary, secondary = null, tertiary = null) {
    return client.rest.patch(Routes.guildRole(guildId, roleId), {
        body: { colors: { primary_color: primary, secondary_color: secondary, tertiary_color: tertiary } },
        reason: 'Custom role color update',
    });
}

function parseHex(input) {
    if (!input) return null;
    let h = input.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return parseInt(h, 16);
}

async function setRoleIconFromAttachment(role, attachment) {
    await role.setUnicodeEmoji(null).catch(() => null);
    return role.setIcon(attachment.url);
}

function isImageAttachment(att) {
    if (!att) return false;
    return (att.contentType && att.contentType.startsWith('image/')) || /\.(png|jpe?g|gif|webp)$/i.test(att.name || '');
}

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

const PANEL_TEXT =
    '## CUSTOM ROLE BOOSTER\n' +
    '<:create_role:1526262217127886879> **Create Role** buat bikin role baru\n' +
    '<:manage_role:1526262757769347072> **Manage Role** buat ubah nama, warna, sama icon\n' +
    '<:manage_color:1526262729860579458> **Manage Color** buat ganti warna aja\n' +
    '<:manage_position:1526262744100245645> **Manage Position** buat atur tampilan role kamu\n' +
    '<:delete_role:1526262231212363938> **Delete Role** buat hapus role kamu\n\n' +
    'Satu member cuma bisa punya satu custom role ya.';

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

function buildPanelPayload() {
    const buttons = panelButtons();
    if (SUPPORTS_V2_LAYOUT) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(PANEL_TEXT));
        return { components: [container, ...buttons], flags: MessageFlags.IsComponentsV2 };
    }
    return { content: PANEL_TEXT, components: buttons };
}

const redEmbed = (description, title) => {
    const e = new EmbedBuilder().setColor(RED).setDescription(description);
    if (title) e.setTitle(title);
    return e;
};

const infoEmbed = (description, title) => {
    const e = new EmbedBuilder().setColor(0x2B2D31).setDescription(description);
    if (title) e.setTitle(title);
    return e;
};

const replyEmbed = (message, embed, extra = {}) =>
    message.reply({ embeds: [embed], allowedMentions: { repliedUser: false }, ...extra }).catch(() => null);

function memberCan(member, permFlag) {
    if (!member) return false;
    return member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(permFlag);
}

function resolveId(token) {
    if (!token) return null;
    const id = String(token).replace(/\D/g, '');
    return /^\d{17,20}$/.test(id) ? id : null;
}

function resolveRole(guild, token) {
    const id = resolveId(token);
    if (!id) return null;
    return guild.roles.cache.get(id) ?? null;
}

async function cmdRolepanel(message) {
    if (!memberCan(message.member, PermissionFlagsBits.Administrator))
        return replyEmbed(message, redEmbed('Command ini khusus **Administrator**.', 'Akses Ditolak'));
    await message.channel.send(buildPanelPayload()).catch(() => null);
    return replyEmbed(message, redEmbed('<:success:1526263116617482441> Panel Custom Role berhasil dikirim.', 'Berhasil'));
}

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

async function cmdWhitelistRole(message, args) {
    return handleWhitelist(message, args, 'whitelistRoles', 'Whitelist Tier 1 (nama, solid, icon)', 'Member dengan role ini bisa atur nama, warna **solid**, dan icon.');
}

async function cmdWhitelistFull(message, args) {
    return handleWhitelist(message, args, 'whitelist2', 'Whitelist Tier 2 (semua akses)', 'Member dengan role ini dapat **semua** akses: nama, solid, gradient, holographic, dan icon.');
}

async function handleInteraction(interaction) {
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

        const me = interaction.guild.members.me;
        if (me && !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return replyEph(infoEmbed('Bot tidak punya permission **Manage Roles**.', 'Missing Permission'));
        }

        const id = interaction.customId;
        const cfg = getGuildCfg(interaction.guild.id);

        if (interaction.isButton()) {
            if (id === 'crole_create') {
                if (cfg.roles[member.id]) {
                    return replyEph(infoEmbed(`Kamu sudah punya custom role <@&${cfg.roles[member.id]}>. Tombol **Create Role** tidak bisa dipakai lagi, gunakan **Manage Role** untuk mengubahnya.`, 'Sudah Punya Role'));
                }
                try { return await interaction.showModal(buildEditorModal('create', null, canUseAdvancedColor(member))); }
                catch (e) { return replyEph(infoEmbed('Gagal membuka form. Versi discord.js kemungkinan belum mendukung upload di modal.\nDetail: ' + e.message, 'Error')); }
            }

            if (id === 'crole_manage') {
                if (!cfg.roles[member.id]) return replyEph(infoEmbed('Kamu belum punya custom role. Klik **Create Role** dulu.', 'Belum Ada Role'));
                const cached = getCachedCustomRole(interaction.guild, member.id);
                try { return await interaction.showModal(buildEditorModal('manage', cached, canUseAdvancedColor(member))); }
                catch (e) { return replyEph(infoEmbed('Gagal membuka form.\nDetail: ' + e.message, 'Error')); }
            }

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

            if (id === 'crole_color_holo') {
                if (!canUseAdvancedColor(member)) return replyEph(infoEmbed('<:deny:1524111143394607255> Warna holographic khusus akses **tier 2**. Minta admin untuk whitelist tier 2.', 'Akses Terbatas'));
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const role = await getUserCustomRole(interaction.guild, member.id);
                if (!role) return replyEph(infoEmbed('Role tidak ditemukan. Buat ulang.', 'Error'));
                try {
                    await setRoleColors(interaction.client, interaction.guild.id, role.id, HOLOGRAPHIC.primary, HOLOGRAPHIC.secondary, HOLOGRAPHIC.tertiary);
                    return replyEph(infoEmbed(`Warna holographic berhasil diterapkan ke ${role}.`, 'Berhasil'));
                } catch (err) { return replyEph(infoEmbed(gradientErrorMsg(err), 'Gagal')); }
            }

            if (id === 'crole_position') {
                if (!cfg.roles[member.id]) return replyEph(infoEmbed('Kamu belum punya custom role. Klik **Create Role** dulu.', 'Belum Ada Role'));
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('crole_pos_display').setLabel('Jadikan Warna Nama').setStyle(ButtonStyle.Success).setEmoji({ id: '1526262245342974003', name: 'display' }),
                    new ButtonBuilder().setCustomId('crole_pos_nondisplay').setLabel('Bukan Warna Nama').setStyle(ButtonStyle.Secondary).setEmoji({ id: '1526262771669270529', name: 'non_display' }),
                );
                return replyEph(infoEmbed('Atur posisi custom role kamu:\n<:display:1526262245342974003> **Jadikan Warna Nama**, role ditaruh di atas, warnanya dipakai untuk nama kamu\n<:non_display:1526262771669270529> **Bukan Warna Nama**, role ditaruh paling bawah, warna nama diambil dari role lain', 'Atur Posisi'), { components: [row] });
            }

            if (id === 'crole_pos_display' || id === 'crole_pos_nondisplay') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const role = await getUserCustomRole(interaction.guild, member.id);
                if (!role) return replyEph(infoEmbed('Role tidak ditemukan. Buat ulang.', 'Error'));
                const utama = id === 'crole_pos_display';
                try {
                    const target = await hitungPosisiCustomRole(interaction.guild, utama);

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

        if (interaction.isModalSubmit()) {
            const getText = (cid) => { try { return interaction.fields.getTextInputValue(cid); } catch (e) { return ''; } };

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

                let note = '';
                try {
                    if (ctype === 'solid') await setRoleColors(interaction.client, interaction.guild.id, role.id, p, null, null);
                    else if (ctype === 'gradient') await setRoleColors(interaction.client, interaction.guild.id, role.id, p, s, null);
                    else if (ctype === 'holo') await setRoleColors(interaction.client, interaction.guild.id, role.id, HOLOGRAPHIC.primary, HOLOGRAPHIC.secondary, HOLOGRAPHIC.tertiary);
                } catch (err) { note += '\n<:warn:1526263159575412890> Warna gagal diterapkan: gradient/holographic butuh **Enhanced Role Colors** (Server Boost).'; }

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

            if (id === 'crole_modal_solid') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const role = await getUserCustomRole(interaction.guild, member.id);
                if (!role) return replyEph(infoEmbed('Role tidak ditemukan. Buat ulang.', 'Error'));
                const c = parseHex(getText('primary'));
                if (c === null) return replyEph(infoEmbed('Format HEX tidak valid. Contoh: `#FF00AA`.', 'HEX Salah'));
                try { await setRoleColors(interaction.client, interaction.guild.id, role.id, c, null, null); return replyEph(infoEmbed(`Warna solid berhasil diterapkan ke ${role}.`, 'Berhasil')); }
                catch (err) {
                    try { await role.setColor(c); return replyEph(infoEmbed(`Warna solid berhasil diterapkan ke ${role}.`, 'Berhasil')); }
                    catch (e2) { return replyEph(infoEmbed('Gagal set warna: ' + e2.message, 'Error')); }
                }
            }

            if (id === 'crole_modal_gradient') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                if (!canUseAdvancedColor(member)) return replyEph(infoEmbed('<:deny:1524111143394607255> Warna gradient khusus akses **tier 2**.', 'Akses Terbatas'));
                const role = await getUserCustomRole(interaction.guild, member.id);
                if (!role) return replyEph(infoEmbed('Role tidak ditemukan. Buat ulang.', 'Error'));
                const p = parseHex(getText('primary'));
                const s = parseHex(getText('secondary'));
                if (p === null || s === null) return replyEph(infoEmbed('Salah satu HEX tidak valid. Contoh: `#FF00AA`.', 'HEX Salah'));
                try { await setRoleColors(interaction.client, interaction.guild.id, role.id, p, s, null); return replyEph(infoEmbed(`Warna gradient berhasil diterapkan ke ${role}.`, 'Berhasil')); }
                catch (err) { return replyEph(infoEmbed(gradientErrorMsg(err), 'Gagal')); }
            }
            return;
        }
    } catch (err) {
        try { await replyEph(infoEmbed('Terjadi error: ' + (err && err.message), 'Error')); } catch (e) {}
    }
}

module.exports = {
    name: 'interactionCreate',
    execute: handleInteraction,
    commands: {
        rolepanel: cmdRolepanel,
        whitelistrole: cmdWhitelistRole,
        whitelistfull: cmdWhitelistFull,
    },
    canUseCustomRole,
    canUseAdvancedColor,
};
