// utils/honeypotSystem.js
// Honeypot System — GoKaizen Security

const fs = require('fs');
const path = require('path');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    PermissionsBitField,
} = require('discord.js');

const PREFIX = 'g!';
const IMAGE_THRESHOLD = 4;
const DM_COOLDOWN_MS = 30_000;

const EMOJI_BIG = '<:honeypot_besar:1556135785680343050>';
const EMOJI_SMALL = '<:honeypot:1556135745083670558>';
const HONEYPOT_IMAGE_URL = 'https://cdn.discordapp.com/emojis/1556135785680343050.png';

const SUPPORTS_V2 =
    typeof ContainerBuilder === 'function' &&
    typeof TextDisplayBuilder === 'function' &&
    MessageFlags && MessageFlags.IsComponentsV2 !== undefined;

const SUPPORTS_SECTION =
    typeof SectionBuilder === 'function' &&
    typeof ThumbnailBuilder === 'function';

const DATA_FILE = path.join(__dirname, '..', 'data', 'honeypotData.json');

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return { channels: {}, panels: {}, bans: {}, imageCount: {} };
        const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        if (!raw.channels) raw.channels = {};
        if (!raw.panels) raw.panels = {};
        if (!raw.bans) raw.bans = {};
        if (!raw.imageCount) raw.imageCount = {};
        return raw;
    } catch (err) {
        console.error('[HONEYPOT] gagal baca honeypotData.json:', err.message);
        return { channels: {}, panels: {}, bans: {}, imageCount: {} };
    }
}

let db = loadData();

function saveData() {
    try {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (err) {
        console.error('[HONEYPOT] gagal simpan honeypotData.json:', err.message);
    }
}

function v2(text, ephemeral = false) {
    if (SUPPORTS_V2) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
        let flags = MessageFlags.IsComponentsV2;
        if (ephemeral) flags |= MessageFlags.Ephemeral;
        return {
            components: [container],
            flags,
            allowedMentions: { parse: [], repliedUser: false },
        };
    }
    return { content: text, ephemeral, allowedMentions: { parse: [], repliedUser: false } };
}

const reply = (msg, text) => msg.reply(v2(text)).catch(() => null);

const sendDM = (user, text) => {
    if (SUPPORTS_V2) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
        return user.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }
    return user.send({ content: text }).catch(() => null);
};

const timeRelative = ts => `<t:${Math.floor(ts / 1000)}:R>`;
const timeFull = ts => `<t:${Math.floor(ts / 1000)}:f>`;

const dmCooldowns = new Map();
function canSendDM(userId) {
    const last = dmCooldowns.get(userId);
    if (!last || Date.now() - last > DM_COOLDOWN_MS) {
        dmCooldowns.set(userId, Date.now());
        return true;
    }
    return false;
}

function isHoneypotChannel(guildId, channelId) {
    return db.channels[guildId] === channelId;
}

function setHoneypotChannel(guildId, channelId) {
    db.channels[guildId] = channelId;
    saveData();
}

function removeHoneypotChannel(guildId) {
    delete db.channels[guildId];
    delete db.panels[guildId];
    saveData();
}

function getHoneypotChannel(guildId) {
    return db.channels[guildId] || null;
}

function addImageCount(guildId, userId, count) {
    const key = `${guildId}_${userId}`;
    db.imageCount[key] = (db.imageCount[key] || 0) + count;
    saveData();
    return db.imageCount[key];
}

function resetImageCount(guildId, userId) {
    delete db.imageCount[`${guildId}_${userId}`];
    saveData();
}

function recordBan(guildId, userId, userTag) {
    if (!db.bans[guildId]) db.bans[guildId] = [];
    db.bans[guildId].push({ userId, userTag, at: Date.now() });
    resetImageCount(guildId, userId);
    saveData();
}

function getBanCount(guildId) {
    return (db.bans[guildId] || []).length;
}

function getBanHistory(guildId) {
    return db.bans[guildId] || [];
}

function buildPanel(guildId) {
    const totalBans = getBanCount(guildId);

    const title = `## JANGAN KIRIM PESAN DI CHANNEL INI`;
    const desc =
        `Channel ini merupakan sistem proteksi otomatis GoKaizen ` +
        `untuk mendeteksi akun yang ter-compromised. Aktivitas ` +
        `mencurigakan akan ditindak secara otomatis.\n\n` +
        `Seluruh pesan yang dikirim akan berujung pada **ban permanen**.`;

    const button = new ButtonBuilder()
        .setCustomId('honeypot_stats')
        .setLabel(`Banned: ${totalBans}`)
        .setEmoji({ id: '1556135745083670558', name: 'honeypot' })
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(button);

    if (SUPPORTS_V2) {
        try {
            if (SUPPORTS_SECTION) {
                const container = new ContainerBuilder()
                    .addSectionComponents(
                        new SectionBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(`${title}\n\n${desc}`)
                            )
                            .setThumbnailAccessory(
                                new ThumbnailBuilder().setURL(HONEYPOT_IMAGE_URL)
                            )
                    )
                    .addActionRowComponents(row);

                return { components: [container], flags: MessageFlags.IsComponentsV2 };
            }
        } catch (e) {
            console.warn('[HONEYPOT] SectionBuilder fallback:', e.message);
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${EMOJI_BIG}\n\n${title}\n\n${desc}`)
            )
            .addActionRowComponents(row);

        return { components: [container], flags: MessageFlags.IsComponentsV2 };
    }

    return { content: `${title}\n\n${desc}`, components: [row] };
}

async function updatePanel(guild) {
    try {
        const guildId = guild.id;
        const channelId = getHoneypotChannel(guildId);
        const messageId = db.panels?.[guildId];
        if (!channelId || !messageId) return;

        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) return;

        const msg = await channel.messages.fetch(messageId).catch(() => null);
        if (!msg) {
            delete db.panels[guildId];
            saveData();
            return;
        }

        await msg.edit(buildPanel(guildId)).catch(() => null);
    } catch (err) {
        console.error('[HONEYPOT] gagal update panel:', err.message);
    }
}

function hasImages(message) {
    const fromAttachments = message.attachments.filter(a =>
        (a.contentType || '').startsWith('image/')
    ).size;
    const fromEmbeds = message.embeds.filter(e => e.image || e.thumbnail).length;
    return fromAttachments + fromEmbeds;
}

async function handleHoneypotMessage(message) {
    try {
        if (!message.guild || message.author.bot) return;
        if (!isHoneypotChannel(message.guild.id, message.channel.id)) return;
        if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

        const guildId = message.guild.id;
        const userId = message.author.id;
        const imageCount = hasImages(message);

        if (imageCount === 0) {
            await message.delete().catch(() => null);

            if (canSendDM(userId)) {
                await sendDM(message.author,
                    `**Peringatan**\n\n` +
                    `Kamu tidak diperkenankan mengirim pesan di channel tersebut. ` +
                    `Harap abaikan channel tersebut dan gunakan channel yang sesuai.\n\n` +
                    `-# ${message.guild.name}`
                );
            }
            console.log(`[HONEYPOT] teks dihapus: ${message.author.tag}`);
            return;
        }

        const total = addImageCount(guildId, userId, imageCount);
        console.log(`[HONEYPOT] ${message.author.tag} kirim ${imageCount} gambar (${total}/${IMAGE_THRESHOLD})`);

        if (total >= IMAGE_THRESHOLD) {
            const userTag = message.author.tag;

            await sendDM(message.author,
                `**Akun Terdeteksi Compromised**\n\n` +
                `Akunmu telah di-ban secara otomatis dari **${message.guild.name}** ` +
                `karena terdeteksi mengirimkan konten mencurigakan.\n\n` +
                `Jika kamu merasa ini adalah kesalahan, segera amankan akunmu ` +
                `dan hubungi staff server untuk banding.\n\n` +
                `-# Sistem Keamanan GoKaizen`
            );

            try {
                const fetched = await message.channel.messages.fetch({ limit: 100 });
                const userMsgs = fetched.filter(m => m.author.id === userId);
                if (userMsgs.size > 0) await message.channel.bulkDelete(userMsgs).catch(() => null);
            } catch (e) {
                console.error('[HONEYPOT] bulk delete gagal:', e.message);
            }

            try {
                await message.member.ban({
                    reason: `[Honeypot] Akun compromised: ${total} gambar di honeypot channel`,
                    deleteMessageSeconds: 86400,
                });

                recordBan(guildId, userId, userTag);
                await updatePanel(message.guild);

                console.log(`[HONEYPOT] BANNED ${userTag} (${userId}) total: ${getBanCount(guildId)}`);
            } catch (err) {
                console.error(`[HONEYPOT] gagal ban ${userTag}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[HONEYPOT] handler error:', err);
    }
}

async function handleInteraction(interaction) {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'honeypot_stats') return;

    const guildId = interaction.guildId;
    const channelId = getHoneypotChannel(guildId);
    const totalBans = getBanCount(guildId);
    const history = getBanHistory(guildId);

    const active = channelId ? '🟢 Aktif' : '🔴 Nonaktif';
    const channelText = channelId ? `<#${channelId}>` : 'Belum diatur';

    const tracked = Object.keys(db.imageCount)
        .filter(k => k.startsWith(`${guildId}_`)).length;

    let recentText = 'Belum ada data';
    if (history.length > 0) {
        recentText = history.slice(-10).reverse()
            .map((b, i) => `\`${i + 1}.\` **${b.userTag}** (\`${b.userId}\`)\n${timeFull(b.at)} ${timeRelative(b.at)}`)
            .join('\n\n');
    }

    const statsText =
        `### ${EMOJI_SMALL} Honeypot Statistik\n\n` +
        `**Status** ${active}\n` +
        `**Channel** ${channelText}\n` +
        `**Batas Gambar** ${IMAGE_THRESHOLD}\n` +
        `**User Terlacak** ${tracked}\n` +
        `**Total Banned** ${totalBans}\n\n` +
        `**Riwayat Ban Terakhir**\n${recentText}\n\n` +
        `-# Gunakan \`${PREFIX}honeypot history\` untuk riwayat lengkap`;

    await interaction.reply(v2(statsText, true)).catch(() => null);
}

async function cmdSetup(message, args) {
    const channel = message.mentions.channels.first();
    if (!channel) {
        return reply(message,
            `**Honeypot Setup**\n\n` +
            `Tentukan channel yang akan dijadikan honeypot.\n\n` +
            `\`${PREFIX}honeypot setup #channel\``
        );
    }

    const oldPanelId = db.panels?.[message.guild.id];
    const oldChannelId = getHoneypotChannel(message.guild.id);

    if (oldPanelId && oldChannelId) {
        try {
            const oldCh = await message.guild.channels.fetch(oldChannelId).catch(() => null);
            if (oldCh) {
                const oldMsg = await oldCh.messages.fetch(oldPanelId).catch(() => null);
                if (oldMsg) await oldMsg.delete().catch(() => null);
            }
        } catch (e) {}
    }

    setHoneypotChannel(message.guild.id, channel.id);

    const panel = await channel.send(buildPanel(message.guild.id)).catch(() => null);
    if (panel) {
        db.panels[message.guild.id] = panel.id;
        saveData();
    }

    await reply(message,
        `**Honeypot Aktif**\n\n` +
        `Channel <#${channel.id}> telah dikonfigurasi sebagai honeypot.\n\n` +
        `**Mekanisme aktif:**\n` +
        `${EMOJI_SMALL} Kirim **${IMAGE_THRESHOLD} gambar** = ban otomatis\n` +
        `${EMOJI_SMALL} Pesan teks dihapus + DM peringatan\n` +
        `${EMOJI_SMALL} Administrator tidak terpengaruh\n\n` +
        `-# Gunakan \`${PREFIX}honeypot status\` untuk statistik`
    );

    console.log(`[HONEYPOT] setup: ${channel.id} di guild ${message.guild.id}`);
}

async function cmdRemove(message) {
    const channelId = getHoneypotChannel(message.guild.id);
    if (!channelId) {
        return reply(message, `**Honeypot**\n\nBelum ada honeypot yang diatur.`);
    }

    const panelId = db.panels?.[message.guild.id];
    if (panelId) {
        try {
            const ch = await message.guild.channels.fetch(channelId).catch(() => null);
            if (ch) {
                const msg = await ch.messages.fetch(panelId).catch(() => null);
                if (msg) await msg.delete().catch(() => null);
            }
        } catch (e) {}
    }

    removeHoneypotChannel(message.guild.id);

    await reply(message,
        `**Honeypot Dinonaktifkan**\n\n` +
        `Channel <#${channelId}> tidak lagi menjadi honeypot.\n\n` +
        `-# Data statistik ban tetap tersimpan`
    );

    console.log(`[HONEYPOT] removed di guild ${message.guild.id}`);
}

async function cmdStatus(message) {
    const guildId = message.guild.id;
    const channelId = getHoneypotChannel(guildId);
    const totalBans = getBanCount(guildId);
    const history = getBanHistory(guildId);

    const active = channelId ? '🟢 Aktif' : '🔴 Nonaktif';
    const channelText = channelId ? `<#${channelId}>` : 'Belum diatur';

    const tracked = Object.keys(db.imageCount)
        .filter(k => k.startsWith(`${guildId}_`)).length;

    let recentText = 'Belum ada';
    if (history.length > 0) {
        recentText = history.slice(-5).reverse()
            .map((b, i) => `${i + 1}. \`${b.userTag}\` ${timeRelative(b.at)}`)
            .join('\n');
    }

    await reply(message,
        `**Honeypot Status**\n\n` +
        `**Status** ${active}\n` +
        `**Channel** ${channelText}\n` +
        `**Batas** ${IMAGE_THRESHOLD} gambar\n` +
        `**Terlacak** ${tracked} pengguna\n\n` +
        `${EMOJI_SMALL} **Banned: ${totalBans}**\n\n` +
        `**Ban Terakhir**\n${recentText}\n\n` +
        `-# \`${PREFIX}honeypot history\` untuk riwayat lengkap`
    );
}

async function cmdHistory(message, args) {
    const guildId = message.guild.id;
    const history = getBanHistory(guildId);

    if (!history.length) {
        return reply(message, `**Honeypot Riwayat**\n\nBelum ada ban.`);
    }

    const perPage = 10;
    let page = Math.max(1, parseInt(args[0], 10) || 1);
    const totalPages = Math.max(1, Math.ceil(history.length / perPage));
    if (page > totalPages) page = totalPages;

    const sorted = [...history].reverse();
    const start = (page - 1) * perPage;
    const slice = sorted.slice(start, start + perPage);

    const entries = slice.map((b, idx) => {
        const n = start + idx + 1;
        return `**${n}.** \`${b.userTag}\` (\`${b.userId}\`)\n${timeFull(b.at)} (${timeRelative(b.at)})`;
    }).join('\n\n');

    const pageText = totalPages > 1
        ? `\n\n-# Halaman ${page}/${totalPages} \`${PREFIX}honeypot history ${page < totalPages ? page + 1 : 1}\``
        : '';

    await reply(message,
        `**Honeypot Riwayat**\n\n` +
        `${EMOJI_SMALL} Total: ${history.length} banned\n\n` +
        `${entries}${pageText}`
    );
}

async function cmdReset(message) {
    const guildId = message.guild.id;
    const keys = Object.keys(db.imageCount).filter(k => k.startsWith(`${guildId}_`));
    for (const key of keys) delete db.imageCount[key];
    saveData();

    await reply(message,
        `**Honeypot Reset**\n\n` +
        `**${keys.length}** data counter dihapus.\n` +
        `Riwayat ban tidak terpengaruh.\n\n` +
        `-# Counter gambar semua pengguna telah direset`
    );

    console.log(`[HONEYPOT] reset ${keys.length} counters di guild ${guildId}`);
}

async function cmdHelp(message) {
    await reply(message,
        `**Honeypot Panduan**\n\n` +
        `\`${PREFIX}honeypot setup #channel\` Atur channel honeypot\n` +
        `\`${PREFIX}honeypot remove\` Nonaktifkan honeypot\n` +
        `\`${PREFIX}honeypot status\` Statistik & status\n` +
        `\`${PREFIX}honeypot history\` Riwayat ban\n` +
        `\`${PREFIX}honeypot reset\` Reset counter gambar\n\n` +
        `**Cara Kerja**\n` +
        `Honeypot mendeteksi akun compromised yang mengirim ` +
        `gambar spam secara massal. Pengguna yang mengirim ` +
        `**${IMAGE_THRESHOLD} gambar** di channel honeypot akan ` +
        `otomatis di-ban. Pesan teks langsung dihapus.\n\n` +
        `-# Membutuhkan permission Administrator`
    );
}

const SUBCOMMANDS = {
    setup: cmdSetup,
    remove: cmdRemove,
    status: cmdStatus,
    history: cmdHistory,
    reset: cmdReset,
    help: cmdHelp,
};

async function handleCommand(message) {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();
        if (command !== 'honeypot') return;

        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

        const sub = (args.shift() || 'help').toLowerCase();
        const handler = SUBCOMMANDS[sub];

        if (!handler) {
            return reply(message,
                `**Honeypot**\n\nPerintah \`${sub}\` tidak ditemukan.\n\`${PREFIX}honeypot help\` untuk panduan.`
            );
        }

        await handler(message, args);
    } catch (err) {
        console.error('[HONEYPOT] command error:', err);
        reply(message, `Terjadi kesalahan: ${err.message}`);
    }
}

module.exports = { handleCommand, handleHoneypotMessage, handleInteraction };
