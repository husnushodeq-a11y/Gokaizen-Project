// utils/warnSystem.js
// Sistem peringatan (warn). Tanpa hukuman otomatis, tanpa log channel.
// Semua balasan memakai Components V2 (tanpa embed berwarna, tanpa simbol).
// Dipakai oleh events/warnCommands.js

const fs = require('fs');
const path = require('path');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    PermissionsBitField,
} = require('discord.js');

// ============================================================
//  KONFIGURASI
// ============================================================

const PREFIX = 'g!';

// Berapa hari sebuah peringatan masih dihitung aktif. 0 = tidak pernah kedaluwarsa.
const WARN_EXPIRY_DAYS = 0;

// Jumlah peringatan yang ditampilkan per halaman pada g!warns
const LIST_PER_PAGE = 8;

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

function activeWarns(list) {
    if (!WARN_EXPIRY_DAYS) return list;
    const batas = Date.now() - WARN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    return list.filter(w => w.at >= batas);
}

function generateId(guildId) {
    const dipakai = new Set(Object.values(db[guildId] || {}).flat().map(w => w.id));
    let id;
    do {
        id = Math.random().toString(36).slice(2, 8).toUpperCase();
    } while (dipakai.has(id));
    return id;
}

// ============================================================
//  TAMPILAN (Components V2, tanpa warna, tanpa simbol)
// ============================================================

const SUPPORTS_V2 =
    typeof ContainerBuilder === 'function' &&
    typeof TextDisplayBuilder === 'function' &&
    MessageFlags && MessageFlags.IsComponentsV2 !== undefined;

function payload(teks) {
    if (SUPPORTS_V2) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(teks));
        return {
            components: [container],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [], repliedUser: false },
        };
    }
    // fallback kalau versi discord.js belum mendukung Components V2
    return { content: teks, allowedMentions: { parse: [], repliedUser: false } };
}

const balas = (message, teks) => message.reply(payload(teks)).catch(() => null);

const kirimDM = (user, teks) => {
    if (SUPPORTS_V2) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(teks));
        return user.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }
    return user.send({ content: teks }).catch(() => null);
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

    // alasan = semua argumen kecuali token yang merujuk ke target (mention atau ID)
    const alasan = args
        .filter(a => a.replace(/[<@!>]/g, '') !== targetId)
        .join(' ')
        .trim();

    if (!targetId) {
        return balas(message,
            `**Cara Pakai Warn**\n\n` +
            `\`${PREFIX}warn <user> <alasan>\` beri peringatan ke member\n` +
            `\`${PREFIX}warns <user>\` lihat riwayat peringatan\n` +
            `\`${PREFIX}delwarn <ID>\` hapus satu peringatan\n` +
            `\`${PREFIX}clearwarns <user>\` hapus semua peringatan`
        );
    }

    if (!alasan) {
        return balas(message, `**Alasan Kosong**\n\nAlasan wajib diisi. Contoh: \`${PREFIX}warn @user spam di general\``);
    }

    if (targetId === message.author.id)
        return balas(message, 'Tidak bisa memberi peringatan ke diri sendiri.');
    if (targetId === message.client.user.id)
        return balas(message, 'Tidak bisa memberi peringatan ke bot.');
    if (targetId === message.guild.ownerId)
        return balas(message, 'Tidak bisa memberi peringatan ke owner server.');

    const target = await message.guild.members.fetch(targetId).catch(() => null);
    if (!target)
        return balas(message, 'Member tidak ditemukan di server ini.');
    if (target.user.bot)
        return balas(message, 'Tidak bisa memberi peringatan ke bot.');

    if (
        target.roles.highest.position >= message.member.roles.highest.position &&
        message.author.id !== message.guild.ownerId
    ) {
        return balas(message, 'Tidak bisa memberi peringatan ke member dengan role setara atau lebih tinggi.');
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

    const jumlah = activeWarns(semua).length;

    await kirimDM(target.user,
        `**Peringatan**\n\n` +
        `Kamu menerima peringatan di ${message.guild.name}.\n\n` +
        `**Alasan:** ${alasan}\n` +
        `**Total Peringatan:** ${jumlah}\n` +
        `**ID:** \`${warn.id}\``
    );

    await balas(message,
        `**Peringatan Diberikan**\n\n` +
        `**Member:** <@${targetId}>\n` +
        `**Moderator:** <@${message.author.id}>\n` +
        `**Total Peringatan:** ${jumlah}\n` +
        `**ID:** \`${warn.id}\`\n` +
        `**Alasan:** ${alasan}`
    );

    console.log(`[WARN] +1 ${target.user.tag} (total ${jumlah}) oleh ${message.author.tag}`);
}

// ============================================================
//  COMMAND: g!warns
// ============================================================

async function cmdWarns(message, args) {
    const targetId = resolveTargetId(message, args) || message.author.id;
    const halamanArg = args.find(a => /^\d{1,3}$/.test(a) && a.replace(/[<@!>]/g, '') !== targetId);
    let halaman = Math.max(1, parseInt(halamanArg, 10) || 1);

    const semua = getUserWarns(message.guild.id, targetId);
    if (!semua.length) {
        return balas(message, `**Riwayat Peringatan**\n<@${targetId}>\n\nTidak punya riwayat peringatan.`);
    }

    const aktif = activeWarns(semua);
    const urut = [...semua].sort((a, b) => b.at - a.at);

    const totalHalaman = Math.max(1, Math.ceil(urut.length / LIST_PER_PAGE));
    if (halaman > totalHalaman) halaman = totalHalaman;
    const mulai = (halaman - 1) * LIST_PER_PAGE;
    const potongan = urut.slice(mulai, mulai + LIST_PER_PAGE);

    const daftar = potongan.map((w, idx) => {
        const nomor = mulai + idx + 1;
        const tanda = WARN_EXPIRY_DAYS && !aktif.some(a => a.id === w.id) ? ' (kedaluwarsa)' : '';
        return `**${nomor}.** ID \`${w.id}\`${tanda}\n` +
            `Alasan: ${w.reason}\n` +
            `Moderator: ${w.modId ? `<@${w.modId}>` : w.modTag}\n` +
            `Waktu: ${waktuPenuh(w.at)} (${waktuRelatif(w.at)})`;
    }).join('\n\n');

    let teks =
        `**Riwayat Peringatan**\n<@${targetId}>\n\n` +
        `**Total:** ${semua.length}` +
        (WARN_EXPIRY_DAYS ? ` (aktif ${aktif.length})` : '') +
        `\n\n${daftar}`;

    if (totalHalaman > 1) {
        const berikut = halaman + 1 > totalHalaman ? 1 : halaman + 1;
        const acuan = targetId === message.author.id ? '' : '@user ';
        teks += `\n\nHalaman ${halaman} dari ${totalHalaman}. Ketik \`${PREFIX}warns ${acuan}${berikut}\` untuk halaman lain.`;
    } else {
        teks += `\n\nHapus dengan \`${PREFIX}delwarn <ID>\``;
    }

    await balas(message, teks);
}

// ============================================================
//  COMMAND: g!delwarn
// ============================================================

async function cmdDelWarn(message, args) {
    const id = (args[0] || '').toUpperCase();
    if (!id) {
        return balas(message,
            `**Cara Pakai**\n\nHapus satu peringatan berdasarkan ID.\n` +
            `Contoh: \`${PREFIX}delwarn A1B2C3\`\n` +
            `Lihat ID lewat \`${PREFIX}warns @user\`.`
        );
    }

    const guildData = db[message.guild.id] || {};
    let pemilikId = null;
    let target = null;

    for (const [userId, list] of Object.entries(guildData)) {
        const found = list.find(w => w.id === id);
        if (found) { pemilikId = userId; target = found; break; }
    }

    if (!target) {
        return balas(message, `Peringatan dengan ID \`${id}\` tidak ditemukan.`);
    }

    const sisa = guildData[pemilikId].filter(w => w.id !== id);
    setUserWarns(message.guild.id, pemilikId, sisa);

    await balas(message,
        `**Peringatan Dihapus**\n\n` +
        `**Member:** <@${pemilikId}>\n` +
        `**Moderator:** <@${message.author.id}>\n` +
        `**Sisa Peringatan:** ${sisa.length}\n` +
        `**Alasan Asli:** ${target.reason}`
    );
}

// ============================================================
//  COMMAND: g!clearwarns
// ============================================================

async function cmdClearWarns(message, args) {
    const targetId = resolveTargetId(message, args);
    if (!targetId) {
        return balas(message,
            `**Cara Pakai**\n\nHapus semua peringatan seorang member.\n` +
            `Contoh: \`${PREFIX}clearwarns @user\``
        );
    }

    const semua = getUserWarns(message.guild.id, targetId);
    if (!semua.length) {
        return balas(message, 'Member ini tidak punya peringatan.');
    }

    setUserWarns(message.guild.id, targetId, []);

    await balas(message,
        `**Semua Peringatan Dihapus**\n\n` +
        `**Member:** <@${targetId}>\n` +
        `**Moderator:** <@${message.author.id}>\n` +
        `**Jumlah Dihapus:** ${semua.length}`
    );
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

        // butuh izin Moderate Members. Tidak punya = diam.
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

        await handler(message, args);
    } catch (err) {
        console.error('[WARN] error:', err);
        balas(message, `Terjadi kesalahan: ${err.message}`);
    }
}

module.exports = { handleMessage };
