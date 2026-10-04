// utils/warnSystem.js
// Sistem peringatan (warn) dengan hukuman bertingkat otomatis.
// Dipakai oleh events/warnCommands.js

const fs = require('fs');
const path = require('path');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

let botConfig = {};
try {
    botConfig = require('../config.json');
} catch {
    botConfig = {};
}

// ============================================================
//  KONFIGURASI
// ============================================================

const PREFIX = 'g!';

// Berapa hari sebuah peringatan masih dihitung untuk hukuman otomatis.
// 0 = tidak pernah kedaluwarsa. Warn yang lewat batas tetap tersimpan di
// riwayat, hanya tidak lagi menambah hitungan hukuman.
const WARN_EXPIRY_DAYS = 0;

// Hukuman otomatis DIMATIKAN sesuai permintaan. Semua tindakan dilakukan manual
// oleh moderator. Warn hanya mencatat dan memberi tahu, tidak menghukum sendiri.

// Jumlah peringatan yang ditampilkan per halaman pada g!warns
const LIST_PER_PAGE = 8;

const COLOR_WARN = 0xFFA500;
const COLOR_PUNISH = 0xED4245;
const COLOR_OK = 0x57F287;
const COLOR_INFO = 0x5865F2;

// ============================================================
//  PENYIMPANAN
// ============================================================

const DATA_FILE = path.join(__dirname, '..', 'data', 'warnData.json');

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return {};
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        console.error('[WARN] gagal baca warnData.json:', err.message);
        return {};
    }
}

let db = loadData();

function saveData() {
    try {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (err) {
        console.error('[WARN] gagal simpan warnData.json:', err.message);
    }
}

function getUserWarns(guildId, userId) {
    return db[guildId]?.[userId] || [];
}

function setUserWarns(guildId, userId, list) {
    if (!db[guildId]) db[guildId] = {};
    if (list.length) db[guildId][userId] = list;
    else delete db[guildId][userId];
    saveData();
}

// Peringatan yang masih dihitung untuk hukuman otomatis
function activeWarns(list) {
    if (!WARN_EXPIRY_DAYS) return list;
    const batas = Date.now() - WARN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    return list.filter(w => w.at >= batas);
}

// ID pendek yang mudah diketik ulang, dijamin unik dalam satu guild
function generateId(guildId) {
    const dipakai = new Set(Object.values(db[guildId] || {}).flat().map(w => w.id));
    let id;
    do {
        id = Math.random().toString(36).slice(2, 8).toUpperCase();
    } while (dipakai.has(id));
    return id;
}

// ============================================================
//  UTILITAS
// ============================================================

const embedOf = (color, desc, title) => {
    const e = new EmbedBuilder().setColor(color).setDescription(desc);
    if (title) e.setTitle(title);
    return e;
};

const waktuRelatif = ts => `<t:${Math.floor(ts / 1000)}:R>`;
const waktuPenuh = ts => `<t:${Math.floor(ts / 1000)}:f>`;

function resolveTargetId(message, args) {
    const mention = message.mentions.users.first();
    if (mention) return mention.id;
    const kandidat = args.find(a => /^\d{17,20}$/.test(a.replace(/[<@!>]/g, '')));
    return kandidat ? kandidat.replace(/[<@!>]/g, '') : null;
}

// ============================================================
//  COMMAND: g!warn
// ============================================================

async function cmdWarn(message, args) {
    const targetId = resolveTargetId(message, args);
    const alasan = args
        .filter(a => a !== `<@${targetId}>` && a !== `<@!${targetId}>` && a !== targetId)
        .join(' ')
        .trim();

    if (!targetId) {
        return message.reply({
            embeds: [new EmbedBuilder().setColor(COLOR_INFO)
                .setTitle('📌 Cara Penggunaan')
                .setDescription('Memberi peringatan kepada member.')
                .addFields(
                    { name: 'Contoh', value: `\`${PREFIX}warn @user spam di general\`\n\`${PREFIX}warn 123456789012345678 toxic\`` },
                )],
        });
    }

    if (!alasan) {
        return message.reply({
            embeds: [embedOf(COLOR_PUNISH, `Alasan wajib diisi.\n\nContoh: \`${PREFIX}warn @user spam di general\``, '❌ Alasan Kosong')],
        });
    }

    if (targetId === message.author.id)
        return message.reply({ embeds: [embedOf(COLOR_PUNISH, 'Tidak bisa memberi peringatan ke diri sendiri.')] });
    if (targetId === message.client.user.id)
        return message.reply({ embeds: [embedOf(COLOR_PUNISH, 'Tidak bisa memberi peringatan ke bot.')] });
    if (targetId === message.guild.ownerId)
        return message.reply({ embeds: [embedOf(COLOR_PUNISH, 'Tidak bisa memberi peringatan ke owner server.')] });

    const target = await message.guild.members.fetch(targetId).catch(() => null);
    if (!target)
        return message.reply({ embeds: [embedOf(COLOR_PUNISH, 'Member tidak ditemukan di server ini.')] });

    if (target.user.bot)
        return message.reply({ embeds: [embedOf(COLOR_PUNISH, 'Tidak bisa memberi peringatan ke bot.')] });

    // hierarki: moderator tidak boleh menindak yang setara atau lebih tinggi
    if (
        target.roles.highest.position >= message.member.roles.highest.position &&
        message.author.id !== message.guild.ownerId
    ) {
        return message.reply({
            embeds: [embedOf(COLOR_PUNISH, 'Kamu tidak bisa memberi peringatan ke member dengan role setara atau lebih tinggi.', '❌ Gagal')],
        });
    }

    const warn = {
        id: generateId(message.guild.id),
        modId: message.author.id,
        modTag: message.author.tag,
        reason: alasan,
        at: Date.now(),
    };

    const semua = getUserWarns(message.guild.id, targetId);
    semua.push(warn);
    setUserWarns(message.guild.id, targetId, semua);

    const jumlahAktif = activeWarns(semua).length;

    // beri tahu member lewat DM
    await target.send({
        embeds: [new EmbedBuilder().setColor(COLOR_WARN)
            .setTitle(`⚠️ Kamu menerima peringatan di ${message.guild.name}`)
            .addFields(
                { name: 'Alasan', value: alasan },
                { name: 'Total Peringatan', value: `${jumlahAktif}`, inline: true },
                { name: 'ID', value: `\`${warn.id}\``, inline: true },
            )
            .setTimestamp()],
    }).catch(() => null);

    const embed = new EmbedBuilder()
        .setColor(COLOR_WARN)
        .setTitle('⚠️ Peringatan Diberikan')
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
            { name: 'Member', value: `${target.user.tag} (\`${targetId}\`)`, inline: false },
            { name: 'Moderator', value: message.author.tag, inline: true },
            { name: 'Total Peringatan', value: `${jumlahAktif}`, inline: true },
            { name: 'ID Peringatan', value: `\`${warn.id}\``, inline: true },
            { name: 'Alasan', value: alasan, inline: false },
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });

    console.log(`[WARN] +1 ${target.user.tag} (total ${jumlahAktif}) oleh ${message.author.tag}`);
}

// ============================================================
//  COMMAND: g!warns
// ============================================================

async function cmdWarns(message, args) {
    // pisahkan argumen: target (mention/ID) dan nomor halaman
    const targetId = resolveTargetId(message, args) || message.author.id;
    const halamanArg = args.find(a => /^\d{1,3}$/.test(a) && a.replace(/[<@!>]/g, '') !== targetId);
    let halaman = Math.max(1, parseInt(halamanArg, 10) || 1);

    const user = await message.client.users.fetch(targetId).catch(() => null);
    const nama = user ? user.tag : targetId;

    const semua = getUserWarns(message.guild.id, targetId);
    if (!semua.length) {
        return message.reply({
            embeds: [new EmbedBuilder().setColor(COLOR_OK)
                .setTitle('📋 Riwayat Peringatan')
                .setDescription(`**${nama}** tidak punya riwayat peringatan.`)
                .setThumbnail(user ? user.displayAvatarURL() : null)],
        });
    }

    const aktif = activeWarns(semua);

    // urutkan dari yang terbaru
    const urut = [...semua].sort((a, b) => b.at - a.at);

    const totalHalaman = Math.max(1, Math.ceil(urut.length / LIST_PER_PAGE));
    if (halaman > totalHalaman) halaman = totalHalaman;
    const mulai = (halaman - 1) * LIST_PER_PAGE;
    const potongan = urut.slice(mulai, mulai + LIST_PER_PAGE);

    // tiap peringatan ditampilkan sebagai satu field agar reason terbaca penuh
    const fields = potongan.map((w, idx) => {
        const nomor = mulai + idx + 1;
        const kedaluwarsa = WARN_EXPIRY_DAYS && !aktif.some(a => a.id === w.id) ? ' • *kedaluwarsa*' : '';
        return {
            name: `#${nomor} • ID: ${w.id}`,
            value:
                `**Alasan:** ${w.reason}\n` +
                `**Moderator:** ${w.modTag}\n` +
                `**Waktu:** ${waktuPenuh(w.at)} (${waktuRelatif(w.at)})${kedaluwarsa}`,
        };
    });

    const embed = new EmbedBuilder()
        .setColor(COLOR_INFO)
        .setTitle(`📋 Riwayat Peringatan — ${nama}`)
        .setDescription(
            `Total peringatan: **${semua.length}**` +
            (WARN_EXPIRY_DAYS ? ` • Aktif: **${aktif.length}**` : '')
        )
        .addFields(fields)
        .setFooter({
            text: totalHalaman > 1
                ? `Halaman ${halaman}/${totalHalaman} • ketik "${PREFIX}warns ${targetId === message.author.id ? '' : '@user '}${halaman + 1 > totalHalaman ? 1 : halaman + 1}" untuk halaman lain`
                : `${semua.length} peringatan • hapus dengan ${PREFIX}delwarn <ID>`,
        });

    if (user) embed.setThumbnail(user.displayAvatarURL());

    await message.reply({ embeds: [embed] });
}

// ============================================================
//  COMMAND: g!delwarn
// ============================================================

async function cmdDelWarn(message, args) {
    const id = (args[0] || '').toUpperCase();
    if (!id) {
        return message.reply({
            embeds: [embedOf(COLOR_INFO, `Hapus satu peringatan berdasarkan ID.\n\nContoh: \`${PREFIX}delwarn A1B2C3\`\n\nLihat ID lewat \`${PREFIX}warns @user\`.`, '📌 Cara Penggunaan')],
        });
    }

    const guildData = db[message.guild.id] || {};
    let pemilikId = null;
    let target = null;

    for (const [userId, list] of Object.entries(guildData)) {
        const found = list.find(w => w.id === id);
        if (found) { pemilikId = userId; target = found; break; }
    }

    if (!target) {
        return message.reply({ embeds: [embedOf(COLOR_PUNISH, `Peringatan dengan ID \`${id}\` tidak ditemukan.`, '❌ Tidak Ditemukan')] });
    }

    const sisa = guildData[pemilikId].filter(w => w.id !== id);
    setUserWarns(message.guild.id, pemilikId, sisa);

    const user = await message.client.users.fetch(pemilikId).catch(() => null);

    const embed = new EmbedBuilder()
        .setColor(COLOR_OK)
        .setTitle('🗑️ Peringatan Dihapus')
        .addFields(
            { name: 'Member', value: user ? `${user.tag} (\`${pemilikId}\`)` : `\`${pemilikId}\``, inline: false },
            { name: 'Moderator', value: message.author.tag, inline: true },
            { name: 'Sisa Peringatan', value: `${sisa.length}`, inline: true },
            { name: 'Alasan Asli', value: target.reason, inline: false },
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// ============================================================
//  COMMAND: g!clearwarns
// ============================================================

async function cmdClearWarns(message, args) {
    const targetId = resolveTargetId(message, args);
    if (!targetId) {
        return message.reply({
            embeds: [embedOf(COLOR_INFO, `Hapus SEMUA peringatan seorang member.\n\nContoh: \`${PREFIX}clearwarns @user\``, '📌 Cara Penggunaan')],
        });
    }

    const semua = getUserWarns(message.guild.id, targetId);
    if (!semua.length) {
        return message.reply({ embeds: [embedOf(COLOR_INFO, 'Member ini tidak punya peringatan.')] });
    }

    setUserWarns(message.guild.id, targetId, []);

    const user = await message.client.users.fetch(targetId).catch(() => null);

    const embed = new EmbedBuilder()
        .setColor(COLOR_OK)
        .setTitle('🧹 Semua Peringatan Dihapus')
        .addFields(
            { name: 'Member', value: user ? `${user.tag} (\`${targetId}\`)` : `\`${targetId}\``, inline: false },
            { name: 'Moderator', value: message.author.tag, inline: true },
            { name: 'Jumlah Dihapus', value: `${semua.length}`, inline: true },
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

// ============================================================
//  DISPATCHER
// ============================================================

const COMMANDS = {
    warn: cmdWarn,
    warns: cmdWarns,
    warnlist: cmdWarns,
    delwarn: cmdDelWarn,
    unwarn: cmdDelWarn,
    clearwarns: cmdClearWarns,
};

async function handleMessage(message) {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();

        const handler = COMMANDS[command];
        if (!handler) return;

        // semua command warn butuh izin Moderate Members. Tidak punya = diam.
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

        await handler(message, args);
    } catch (err) {
        console.error('[WARN] error:', err);
        message.reply({ embeds: [embedOf(COLOR_PUNISH, `Terjadi kesalahan: ${err.message}`, '❌ Error')] }).catch(() => null);
    }
}

module.exports = { handleMessage };
