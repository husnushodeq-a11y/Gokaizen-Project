// utils/premiumSystem.js
// Command premium berprefiks d! yang hanya bisa dipakai member di dalam whitelist.
// Whitelist dikelola staff dengan prefiks g!, sehingga akses bisa dicabut kapan
// saja bila terjadi penyalahgunaan.
//
// Dipakai oleh events/premiumCommands.js

const fs = require('fs');
const path = require('path');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
    PermissionsBitField,
} = require('discord.js');

let botConfig = {};
try {
    botConfig = require('../config.json');
} catch {
    botConfig = {};
}

// ============================================================
//  KONFIGURASI
// ============================================================

const PREFIX = 'd!';        // command premium
const ADMIN_PREFIX = 'g!';  // pengelolaan whitelist oleh staff

// Channel log pemakaian command premium. Setiap pemakaian dicatat lengkap
// agar penyalahgunaan bisa ditelusuri.
const LOG_CHANNEL_ID = botConfig.PREMIUM_LOG_CHANNEL_ID || '1358139516006957107';

const COLOR = 0xE8B923;
const COLOR_OK = 0x57F287;
const COLOR_WARN = 0xED4245;

// Jeda antar pemakaian broadcast per member, dalam milidetik.
const BC_COOLDOWN = 10 * 60 * 1000;

// Batas voice channel yang dikirimi broadcast dalam sekali jalan.
const BC_MAX_CHANNEL = 25;

// Jumlah voice channel yang ditampilkan pada froom.
const FROOM_LIMIT = 8;

const EMOJI_ARROW = '<a:arrow:1532795180770660382>';

// Izin yang menandai seseorang sebagai staff. Member dengan izin ini tidak bisa
// menjadi sasaran command yang memindahkan atau mengeluarkan dari voice.
const STAFF_PERMS = [
    PermissionsBitField.Flags.Administrator,
    PermissionsBitField.Flags.ModerateMembers,
    PermissionsBitField.Flags.KickMembers,
    PermissionsBitField.Flags.BanMembers,
    PermissionsBitField.Flags.ManageMessages,
    PermissionsBitField.Flags.ManageChannels,
];

// ============================================================
//  PENYIMPANAN WHITELIST
// ============================================================

const DATA_FILE = path.join(__dirname, '..', 'data', 'premiumWhitelist.json');

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return {};
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        console.error('[PREMIUM] gagal baca premiumWhitelist.json:', err.message);
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
        console.error('[PREMIUM] gagal simpan premiumWhitelist.json:', err.message);
    }
}

function getEntry(guildId, userId) {
    return db[guildId]?.[userId] || null;
}

// Masa berlaku diperiksa saat command dipakai, jadi tidak perlu penjadwal khusus.
function isWhitelisted(guildId, userId) {
    const e = getEntry(guildId, userId);
    if (!e) return false;
    if (e.expiresAt && Date.now() >= e.expiresAt) return false;
    return true;
}

// durationMs null berarti akses permanen.
// extend true berarti masa berlaku ditambahkan ke sisa yang sedang berjalan.
function addWhitelist(guildId, userId, durationMs, addedBy, options = {}) {
    if (!db[guildId]) db[guildId] = {};

    const now = Date.now();
    const lama = getEntry(guildId, userId);

    let expiresAt = null;
    if (durationMs) {
        const dasar = (options.extend !== false && lama && lama.expiresAt && lama.expiresAt > now)
            ? lama.expiresAt
            : now;
        expiresAt = dasar + durationMs;
    }

    // Akses permanen tidak boleh turun menjadi sementara secara tidak sengaja.
    if (lama && lama.expiresAt === null && durationMs) expiresAt = null;

    db[guildId][userId] = {
        addedBy: addedBy || null,
        addedAt: lama ? lama.addedAt : now,
        updatedAt: now,
        expiresAt,
        note: options.note || (lama ? lama.note : null),
    };
    saveData();
    return db[guildId][userId];
}

function removeWhitelist(guildId, userId) {
    if (db[guildId] && db[guildId][userId]) {
        delete db[guildId][userId];
        if (!Object.keys(db[guildId]).length) delete db[guildId];
        saveData();
        return true;
    }
    return false;
}

function listWhitelist(guildId) {
    const data = db[guildId] || {};
    const now = Date.now();
    return Object.entries(data)
        .map(([userId, e]) => ({ userId, ...e, aktif: !e.expiresAt || e.expiresAt > now }))
        .sort((a, b) => {
            if (a.aktif !== b.aktif) return a.aktif ? -1 : 1;
            if (!a.expiresAt) return -1;
            if (!b.expiresAt) return 1;
            return a.expiresAt - b.expiresAt;
        });
}

// ============================================================
//  TAMPILAN
// ============================================================

const HAS_V2 =
    typeof ContainerBuilder === 'function' &&
    typeof TextDisplayBuilder === 'function' &&
    MessageFlags && MessageFlags.IsComponentsV2 !== undefined;

function textOf(content) {
    return new TextDisplayBuilder().setContent(content);
}

function newContainer(color) {
    const c = new ContainerBuilder();
    if (typeof c.setAccentColor === 'function') c.setAccentColor(color);
    return c;
}

function addDivider(container) {
    if (typeof container.addSeparatorComponents !== 'function') return;
    try {
        const s = new SeparatorBuilder();
        if (typeof s.setDivider === 'function') s.setDivider(true);
        if (typeof s.setSpacing === 'function' && SeparatorSpacingSize) s.setSpacing(SeparatorSpacingSize.Small);
        container.addSeparatorComponents(s);
    } catch { /* pemisah bersifat opsional */ }
}

function payloadOf(container, mentions) {
    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: mentions || { parse: [], repliedUser: false },
    };
}

// Menyusun tampilan dari beberapa bagian yang dipisah garis tipis
function build(color, sections, mentions) {
    if (!HAS_V2) {
        return { content: sections.join('\n\n'), allowedMentions: mentions || { parse: [], repliedUser: false } };
    }
    const c = newContainer(color);
    sections.forEach((isi, i) => {
        c.addTextDisplayComponents(textOf(isi));
        if (i < sections.length - 1) addDivider(c);
    });
    return payloadOf(c, mentions);
}

const reply = (message, color, ...sections) =>
    message.reply(build(color, sections)).catch(() => null);

async function logTo(client, teks) {
    if (!LOG_CHANNEL_ID) return;
    try {
        const ch = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (ch) await ch.send(build(COLOR, [teks])).catch(() => null);
    } catch { /* kegagalan log tidak boleh menghentikan aksi utama */ }
}

// Catatan rinci untuk setiap pemakaian command premium.
// Berisi siapa, command apa, di channel mana, kapan, dan rincian aksinya.
async function logPakai(message, command, detail, status = 'berhasil') {
    const waktu = Math.floor(Date.now() / 1000);
    const vc = message.member?.voice?.channel;

    let teks =
        `## Pemakaian Command Premium\n` +
        `${EMOJI_ARROW} Command: \`${PREFIX}${command}\`\n` +
        `${EMOJI_ARROW} Pengguna: ${message.author} (\`${message.author.id}\`)\n` +
        `${EMOJI_ARROW} Channel: ${message.channel}\n` +
        `${EMOJI_ARROW} Voice pengguna: ${vc ? vc.name : 'tidak di voice'}\n` +
        `${EMOJI_ARROW} Waktu: <t:${waktu}:f>\n` +
        `${EMOJI_ARROW} Status: ${status}`;

    if (detail) teks += `\n\n**Rincian**\n${EMOJI_ARROW} ${detail}`;

    await logTo(message.client, teks);
}

// ============================================================
//  UTILITAS
// ============================================================

const waktuPenuh = ts => `<t:${Math.floor(ts / 1000)}:D>`;
const waktuRelatif = ts => `<t:${Math.floor(ts / 1000)}:R>`;

function resolveTargetId(message, args) {
    const m = message.mentions.users.first();
    if (m) return m.id;
    const kandidat = args.find(a => /^\d{17,20}$/.test(a.replace(/[<@!>]/g, '')));
    return kandidat ? kandidat.replace(/[<@!>]/g, '') : null;
}

const isStaff = member => STAFF_PERMS.some(p => member.permissions.has(p));

// Bot maupun aplikasi tidak boleh menjadi sasaran command apa pun,
// termasuk bot musik dan bot moderasi yang sedang berada di voice.
const isBotOrApp = member =>
    Boolean(member?.user?.bot || member?.user?.system || member?.user?.application);

// Pemeriksaan yang sama untuk semua command yang menyentuh voice orang lain
function cekSasaran(message, target, aksi) {
    if (!target) return 'Member tidak ditemukan di server ini.';
    if (isBotOrApp(target)) return 'Bot dan aplikasi tidak bisa dijadikan sasaran command ini.';
    if (target.id === message.author.id) return `Tidak bisa ${aksi} diri sendiri.`;
    if (isStaff(target)) return `Tidak bisa ${aksi} staff.`;
    if (!target.voice.channel) return `${target.user.username} sedang tidak berada di voice channel.`;
    return null;
}

function cekIzinPindah(guild) {
    const me = guild.members.me;
    if (!me.permissions.has(PermissionsBitField.Flags.MoveMembers)) {
        return 'Bot butuh izin **Move Members** untuk menjalankan command ini.';
    }
    return null;
}

// ============================================================
//  COMMAND: d!help
// ============================================================

async function cmdHelp(message) {
    const teksAtas =
        `## Command Premium GO KAIZEN\n` +
        `Berikut daftar command eksklusif yang bisa kamu gunakan.`;

    const voice =
        `**Voice**\n` +
        `${EMOJI_ARROW} \`${PREFIX}bc\` promosikan voice kamu ke voice channel yang sedang aktif\n` +
        `${EMOJI_ARROW} \`${PREFIX}fp <user>\` cari seseorang sedang berada di voice channel mana\n` +
        `${EMOJI_ARROW} \`${PREFIX}warp <user/random>\` pindah ke voice channel target\n` +
        `${EMOJI_ARROW} \`${PREFIX}froom\` lihat rekomendasi voice channel yang sedang ramai`;

    const kontrol =
        `**Kontrol Member**\n` +
        `${EMOJI_ARROW} \`${PREFIX}tarik <user>\` tarik member ke voice channel kamu\n` +
        `${EMOJI_ARROW} \`${PREFIX}usir <user>\` keluarkan member dari voice channel`;

    const catatan =
        `**Catatan**\n` +
        `${EMOJI_ARROW} Command ini hanya bisa dipakai member yang ada di whitelist premium\n` +
        `${EMOJI_ARROW} Staff tidak bisa dijadikan sasaran tarik maupun usir\n` +
        `${EMOJI_ARROW} Setiap pemakaian tercatat, penyalahgunaan berakibat pencabutan akses\n` +
        `${EMOJI_ARROW} Broadcast punya jeda ${Math.round(BC_COOLDOWN / 60000)} menit setiap pemakaian`;

    const entry = getEntry(message.guild.id, message.author.id);
    let status = `**Status Akses Kamu**\n`;
    if (!entry) {
        status += `${EMOJI_ARROW} Belum masuk whitelist premium`;
    } else if (entry.expiresAt && Date.now() >= entry.expiresAt) {
        status += `${EMOJI_ARROW} Akses sudah berakhir pada ${waktuPenuh(entry.expiresAt)}`;
    } else if (entry.expiresAt) {
        status += `${EMOJI_ARROW} Aktif sampai ${waktuPenuh(entry.expiresAt)} (${waktuRelatif(entry.expiresAt)})`;
    } else {
        status += `${EMOJI_ARROW} Aktif permanen`;
    }

    await message.reply(build(COLOR, [teksAtas, voice, kontrol, catatan, status])).catch(() => null);
    await logPakai(message, 'help', 'Membuka daftar command premium');
}

// ============================================================
//  COMMAND: d!bc
// ============================================================

const bcCooldown = new Map();

async function cmdBroadcast(message, args) {
    const vc = message.member.voice.channel;
    if (!vc) {
        return reply(message, COLOR_WARN,
            `## Harus di Voice Channel`,
            `Kamu harus berada di voice channel untuk memakai \`${PREFIX}bc\`.`);
    }

    const key = `${message.guild.id}:${message.author.id}`;
    const terakhir = bcCooldown.get(key) || 0;
    const sisa = BC_COOLDOWN - (Date.now() - terakhir);
    if (sisa > 0) {
        return reply(message, COLOR_WARN,
            `## Masih Jeda`,
            `Broadcast bisa dipakai lagi ${waktuRelatif(Date.now() + sisa)}.`);
    }

    const pesan = args.join(' ').trim().slice(0, 200);

    // Hanya voice channel yang sedang ada orangnya, selain voice milik pengirim
    const tujuan = message.guild.channels.cache
        .filter(ch => ch.isVoiceBased?.() && ch.id !== vc.id && ch.members && ch.members.size > 0)
        .sort((a, b) => b.members.size - a.members.size)
        .first(BC_MAX_CHANNEL);

    if (!tujuan.length) {
        return reply(message, COLOR_WARN,
            `## Tidak Ada Voice Aktif`,
            'Belum ada voice channel lain yang sedang dipakai.');
    }

    const isi = build(COLOR, [
        `## Ajakan Gabung Voice\n${message.author} mengajak gabung ke ${vc}.`,
        `**Voice Channel**\n${EMOJI_ARROW} ${vc.name}\n${EMOJI_ARROW} ${vc.members.size} orang sedang di dalam` +
        (pesan ? `\n\n**Pesan**\n> ${pesan}` : ''),
    ], { parse: [] });

    let berhasil = 0;
    const gagal = [];
    for (const ch of tujuan) {
        try {
            await ch.send(isi);
            berhasil += 1;
        } catch (err) {
            gagal.push(ch.name);
        }
        await new Promise(r => setTimeout(r, 400));
    }

    bcCooldown.set(key, Date.now());

    let hasil =
        `## Broadcast Terkirim\n` +
        `${EMOJI_ARROW} Voice: ${vc.name}\n` +
        `${EMOJI_ARROW} Terkirim ke ${berhasil} voice channel`;
    if (gagal.length) hasil += `\n${EMOJI_ARROW} Gagal di ${gagal.length} channel karena izin atau pengaturan channel`;

    await reply(message, COLOR_OK, hasil);
    await logPakai(message, 'bc',
        `Voice dipromosikan: ${vc.name}\n${EMOJI_ARROW} Terkirim ke ${berhasil} channel` +
        (gagal.length ? `\n${EMOJI_ARROW} Gagal di ${gagal.length} channel` : '') +
        (pesan ? `\n${EMOJI_ARROW} Pesan: ${pesan}` : ''));
}

// ============================================================
//  COMMAND: d!fp
// ============================================================

async function cmdFindPlayer(message, args) {
    const targetId = resolveTargetId(message, args);
    if (!targetId) {
        return reply(message, COLOR,
            `## Cara Pakai`,
            `\`${PREFIX}fp <user>\`\n\nContoh: \`${PREFIX}fp @user\` atau \`${PREFIX}fp 123456789012345678\``);
    }

    const target = await message.guild.members.fetch(targetId).catch(() => null);
    if (!target) return reply(message, COLOR_WARN, 'Member tidak ditemukan di server ini.');

    const vc = target.voice.channel;
    if (!vc) {
        return reply(message, COLOR_WARN,
            `## Tidak di Voice`,
            `${target.user.username} sedang tidak berada di voice channel.`);
    }

    const teman = vc.members.filter(m => m.id !== target.id && !m.user.bot);

    // map pada Collection menghasilkan Array, jadi pemotongannya memakai slice
    const namaTeman = teman.map(m => `${EMOJI_ARROW} ${m.user.username}`);
    const daftar = namaTeman.length
        ? namaTeman.slice(0, 10).join('\n')
        : `${EMOJI_ARROW} Hanya sendirian di sana`;

    await message.reply(build(COLOR, [
        `## Hasil Pencarian\n${target} sedang berada di ${vc}.`,
        `**Voice Channel**\n${EMOJI_ARROW} ${vc.name}\n${EMOJI_ARROW} ${vc.members.size} orang di dalam` +
        (vc.userLimit > 0 ? ` dari batas ${vc.userLimit}` : ''),
        `**Bersama**\n${daftar}` + (namaTeman.length > 10 ? `\n${EMOJI_ARROW} dan ${namaTeman.length - 10} lainnya` : ''),
    ])).catch(() => null);

    await logPakai(message, 'fp', `Sasaran ${target}\n${EMOJI_ARROW} Ditemukan di ${vc.name}`);
}

// ============================================================
//  COMMAND: d!warp
// ============================================================

async function cmdWarp(message, args) {
    const vc = message.member.voice.channel;
    if (!vc) {
        return reply(message, COLOR_WARN,
            `## Harus di Voice Channel`,
            `Kamu harus berada di voice channel untuk memakai \`${PREFIX}warp\`.`);
    }

    const izin = cekIzinPindah(message.guild);
    if (izin) return reply(message, COLOR_WARN, izin);

    if (!args[0]) {
        return reply(message, COLOR,
            `## Cara Pakai`,
            `\`${PREFIX}warp <user/random>\`\n\nContoh:\n${EMOJI_ARROW} \`${PREFIX}warp @user\`\n${EMOJI_ARROW} \`${PREFIX}warp random\``);
    }

    let target;
    if (args[0].toLowerCase() === 'random') {
        const kandidat = message.guild.members.cache.filter(m =>
            m.voice.channel && !m.user.bot && m.id !== message.author.id && m.voice.channel.id !== vc.id);
        if (!kandidat.size) return reply(message, COLOR_WARN, 'Tidak ada member lain di voice channel saat ini.');
        target = kandidat.random();
    } else {
        const targetId = resolveTargetId(message, args);
        if (!targetId) return reply(message, COLOR_WARN, 'Gunakan mention, ID, atau kata random.');
        target = await message.guild.members.fetch(targetId).catch(() => null);
    }

    if (!target) return reply(message, COLOR_WARN, 'Member tidak ditemukan di server ini.');
    if (isBotOrApp(target)) return reply(message, COLOR_WARN, 'Bot dan aplikasi tidak bisa dijadikan tujuan warp.');
    if (!target.voice.channel) {
        return reply(message, COLOR_WARN, `${target.user.username} sedang tidak berada di voice channel.`);
    }

    const tujuan = target.voice.channel;
    if (tujuan.id === vc.id) return reply(message, COLOR_WARN, 'Kamu sudah berada di voice channel yang sama.');

    const everyone = tujuan.permissionOverwrites.cache.get(message.guild.id);
    if (everyone && everyone.deny.has(PermissionsBitField.Flags.Connect)) {
        return reply(message, COLOR_WARN, `## Voice Terkunci`, 'Voice channel tujuan sedang dikunci.');
    }
    if (tujuan.userLimit > 0 && tujuan.members.size >= tujuan.userLimit) {
        return reply(message, COLOR_WARN, `## Voice Penuh`, `Voice channel tujuan penuh (${tujuan.members.size} dari ${tujuan.userLimit}).`);
    }

    try {
        await message.member.voice.setChannel(tujuan, `Warp premium oleh ${message.author.tag}`);
    } catch (err) {
        return reply(message, COLOR_WARN, `Gagal pindah: ${err.message}`);
    }

    await reply(message, COLOR_OK, `## Berhasil Pindah`, `${EMOJI_ARROW} Sekarang kamu berada di ${tujuan}`);
    await logPakai(message, 'warp', `Menuju ${target}\n${EMOJI_ARROW} Dari ${vc.name} ke ${tujuan.name}`);
}

// ============================================================
//  COMMAND: d!froom
// ============================================================

async function cmdFroom(message) {
    const daftar = message.guild.channels.cache
        .filter(ch => ch.isVoiceBased?.() && ch.members && ch.members.size > 0)
        .sort((a, b) => b.members.size - a.members.size)
        .first(FROOM_LIMIT);

    if (!daftar.length) {
        return reply(message, COLOR_WARN,
            `## Belum Ada yang Ramai`,
            'Saat ini belum ada voice channel yang sedang dipakai.');
    }

    const baris = daftar.map((ch, i) => {
        const batas = ch.userLimit > 0 ? ` dari ${ch.userLimit}` : '';
        const penuh = ch.userLimit > 0 && ch.members.size >= ch.userLimit ? ' (penuh)' : '';
        return `**${i + 1}.** ${ch}\n${EMOJI_ARROW} ${ch.members.size} orang${batas}${penuh}`;
    }).join('\n\n');

    await message.reply(build(COLOR, [
        `## Voice Channel Teramai`,
        baris,
        `Pakai \`${PREFIX}warp <user>\` untuk langsung pindah ke salah satu member di sana.`,
    ])).catch(() => null);
    await logPakai(message, 'froom', `Menampilkan ${daftar.length} voice channel teramai`);
}

// ============================================================
//  COMMAND: d!tarik
// ============================================================

async function cmdTarik(message, args) {
    const vc = message.member.voice.channel;
    if (!vc) {
        return reply(message, COLOR_WARN,
            `## Harus di Voice Channel`,
            `Kamu harus berada di voice channel untuk menarik member.`);
    }

    const izin = cekIzinPindah(message.guild);
    if (izin) return reply(message, COLOR_WARN, izin);

    const targetId = resolveTargetId(message, args);
    if (!targetId) {
        return reply(message, COLOR,
            `## Cara Pakai`,
            `\`${PREFIX}tarik <user>\`\n\nMenarik member ke voice channel tempat kamu berada.`);
    }

    const target = await message.guild.members.fetch(targetId).catch(() => null);
    const masalah = cekSasaran(message, target, 'menarik');
    if (masalah) return reply(message, COLOR_WARN, masalah);

    if (target.voice.channel.id === vc.id) {
        return reply(message, COLOR_WARN, `${target.user.username} sudah berada di voice channel kamu.`);
    }
    if (vc.userLimit > 0 && vc.members.size >= vc.userLimit) {
        return reply(message, COLOR_WARN, `## Voice Penuh`, `Voice channel kamu penuh (${vc.members.size} dari ${vc.userLimit}).`);
    }

    const asal = target.voice.channel;
    try {
        await target.voice.setChannel(vc, `Ditarik oleh ${message.author.tag}`);
    } catch (err) {
        return reply(message, COLOR_WARN, `Gagal menarik member: ${err.message}`);
    }

    await message.reply(build(COLOR_OK, [
        `## Member Ditarik`,
        `${EMOJI_ARROW} Member: ${target}\n${EMOJI_ARROW} Dari: ${asal.name}\n${EMOJI_ARROW} Ke: ${vc.name}`,
    ], { users: [target.id] })).catch(() => null);

    await logPakai(message, 'tarik',
        `Sasaran: ${target} (\`${target.id}\`)\n${EMOJI_ARROW} Dari ${asal.name} ke ${vc.name}`);
}

// ============================================================
//  COMMAND: d!usir
// ============================================================

async function cmdUsir(message, args) {
    const izin = cekIzinPindah(message.guild);
    if (izin) return reply(message, COLOR_WARN, izin);

    const targetId = resolveTargetId(message, args);
    if (!targetId) {
        return reply(message, COLOR,
            `## Cara Pakai`,
            `\`${PREFIX}usir <user>\`\n\nMengeluarkan member dari voice channel yang sedang dia tempati.`);
    }

    const target = await message.guild.members.fetch(targetId).catch(() => null);
    const masalah = cekSasaran(message, target, 'mengusir');
    if (masalah) return reply(message, COLOR_WARN, masalah);

    // Hanya boleh mengusir dari voice channel yang sama, supaya tidak dipakai
    // mengganggu member di ruangan lain.
    const vc = message.member.voice.channel;
    if (!vc || target.voice.channel.id !== vc.id) {
        return reply(message, COLOR_WARN,
            `## Harus Satu Voice`,
            'Kamu hanya bisa mengusir member yang berada di voice channel yang sama denganmu.');
    }

    const asal = target.voice.channel;
    try {
        await target.voice.disconnect(`Diusir oleh ${message.author.tag}`);
    } catch (err) {
        return reply(message, COLOR_WARN, `Gagal mengeluarkan member: ${err.message}`);
    }

    await message.reply(build(COLOR_OK, [
        `## Member Dikeluarkan`,
        `${EMOJI_ARROW} Member: ${target}\n${EMOJI_ARROW} Dari: ${asal.name}`,
    ], { users: [target.id] })).catch(() => null);

    await logPakai(message, 'usir',
        `Sasaran: ${target} (\`${target.id}\`)\n${EMOJI_ARROW} Dikeluarkan dari ${asal.name}`);
}

// ============================================================
//  PENGELOLAAN WHITELIST (prefiks g!)
// ============================================================

const UNIT_MS = { d: 86400000, h: 3600000, m: 60000, w: 604800000 };

function parseDurasi(input) {
    if (!input) return null;
    const s = String(input).toLowerCase();
    if (s === 'permanen' || s === 'permanent' || s === 'selamanya') return null;
    const m = s.match(/^(\d+)([wdhm])$/);
    if (!m) return undefined; // tidak dikenali
    return parseInt(m[1], 10) * UNIT_MS[m[2]];
}

function usageWhitelist() {
    return [
        `## Whitelist Premium`,
        `${EMOJI_ARROW} \`${ADMIN_PREFIX}premiumwl add <user> [durasi]\` beri akses command premium\n` +
        `${EMOJI_ARROW} \`${ADMIN_PREFIX}premiumwl remove <user>\` cabut akses\n` +
        `${EMOJI_ARROW} \`${ADMIN_PREFIX}premiumwl list\` lihat semua yang punya akses\n` +
        `${EMOJI_ARROW} \`${ADMIN_PREFIX}premiumwl check <user>\` periksa status akses seseorang`,
        `**Durasi**\n` +
        `${EMOJI_ARROW} Kosongkan untuk akses permanen\n` +
        `${EMOJI_ARROW} Format: \`30d\`, \`12h\`, \`1w\`, atau tulis \`permanen\`\n\n` +
        `Contoh: \`${ADMIN_PREFIX}premiumwl add @user 30d\``,
    ];
}

async function cmdWhitelist(message, args) {
    const sub = args.shift()?.toLowerCase();

    if (!sub || sub === 'help') {
        return message.reply(build(COLOR, usageWhitelist())).catch(() => null);
    }

    if (sub === 'list') {
        const daftar = listWhitelist(message.guild.id);
        if (!daftar.length) {
            return reply(message, COLOR, `## Whitelist Premium`, 'Belum ada member yang punya akses command premium.');
        }
        const aktif = daftar.filter(d => d.aktif);
        const habis = daftar.filter(d => !d.aktif);

        const baris = aktif.map((d, i) =>
            `**${i + 1}.** <@${d.userId}>\n${EMOJI_ARROW} ` +
            (d.expiresAt ? `sampai ${waktuPenuh(d.expiresAt)} (${waktuRelatif(d.expiresAt)})` : 'permanen')
        ).join('\n\n');

        const bagian = [`## Whitelist Premium`, `**Aktif (${aktif.length})**\n${baris || 'Tidak ada'}`];
        if (habis.length) {
            bagian.push(`**Sudah Berakhir (${habis.length})**\n` +
                habis.slice(0, 10).map(d => `${EMOJI_ARROW} <@${d.userId}> berakhir ${waktuRelatif(d.expiresAt)}`).join('\n'));
        }
        return message.reply(build(COLOR, bagian)).catch(() => null);
    }

    const targetId = resolveTargetId(message, args);
    if (!targetId) return message.reply(build(COLOR, usageWhitelist())).catch(() => null);

    if (sub === 'check') {
        const e = getEntry(message.guild.id, targetId);
        if (!e) return reply(message, COLOR, `<@${targetId}> tidak ada di whitelist premium.`);
        const aktif = !e.expiresAt || e.expiresAt > Date.now();
        return message.reply(build(aktif ? COLOR_OK : COLOR_WARN, [
            `## Status Akses Premium`,
            `${EMOJI_ARROW} Member: <@${targetId}>\n` +
            `${EMOJI_ARROW} Status: ${aktif ? 'aktif' : 'sudah berakhir'}\n` +
            `${EMOJI_ARROW} Masa berlaku: ${e.expiresAt ? `${waktuPenuh(e.expiresAt)} (${waktuRelatif(e.expiresAt)})` : 'permanen'}\n` +
            `${EMOJI_ARROW} Ditambahkan: ${waktuPenuh(e.addedAt)}` +
            (e.addedBy ? `\n${EMOJI_ARROW} Oleh: <@${e.addedBy}>` : ''),
        ])).catch(() => null);
    }

    if (sub === 'add') {
        const durasiArg = args.find(a => a.replace(/[<@!>]/g, '') !== targetId);
        const durasi = parseDurasi(durasiArg);
        if (durasi === undefined) {
            return reply(message, COLOR_WARN, 'Format durasi tidak dikenali. Gunakan 30d, 12h, 1w, atau permanen.');
        }

        const target = await message.guild.members.fetch(targetId).catch(() => null);
        if (!target) return reply(message, COLOR_WARN, 'Member tidak ditemukan di server ini.');
        if (target.user.bot) return reply(message, COLOR_WARN, 'Bot tidak bisa dimasukkan ke whitelist.');

        const entry = addWhitelist(message.guild.id, targetId, durasi, message.author.id);

        await message.reply(build(COLOR_OK, [
            `## Akses Premium Diberikan`,
            `${EMOJI_ARROW} Member: <@${targetId}>\n` +
            `${EMOJI_ARROW} Masa berlaku: ${entry.expiresAt ? `${waktuPenuh(entry.expiresAt)} (${waktuRelatif(entry.expiresAt)})` : 'permanen'}\n` +
            `${EMOJI_ARROW} Diberikan oleh: <@${message.author.id}>`,
            `Member bisa melihat daftar commandnya dengan \`${PREFIX}help\`.`,
        ], { users: [targetId] })).catch(() => null);

        await logTo(message.client,
            `**Whitelist Ditambah**\n${EMOJI_ARROW} Member <@${targetId}>\n${EMOJI_ARROW} Oleh <@${message.author.id}>\n` +
            `${EMOJI_ARROW} ${entry.expiresAt ? waktuPenuh(entry.expiresAt) : 'permanen'}`);
        return;
    }

    if (sub === 'remove' || sub === 'del' || sub === 'delete') {
        const ok = removeWhitelist(message.guild.id, targetId);
        if (!ok) return reply(message, COLOR_WARN, `<@${targetId}> tidak ada di whitelist premium.`);

        await message.reply(build(COLOR_OK, [
            `## Akses Premium Dicabut`,
            `${EMOJI_ARROW} Member: <@${targetId}>\n${EMOJI_ARROW} Dicabut oleh: <@${message.author.id}>\n\n` +
            `Seluruh command premium tidak lagi bisa dipakai oleh member ini.`,
        ], { users: [targetId] })).catch(() => null);

        await logTo(message.client,
            `**Whitelist Dicabut**\n${EMOJI_ARROW} Member <@${targetId}>\n${EMOJI_ARROW} Oleh <@${message.author.id}>`);
        return;
    }

    return message.reply(build(COLOR, usageWhitelist())).catch(() => null);
}

// ============================================================
//  DISPATCHER
// ============================================================

const PREMIUM_COMMANDS = {
    help: cmdHelp,
    bc: cmdBroadcast,
    broadcast: cmdBroadcast,
    fp: cmdFindPlayer,
    findplayer: cmdFindPlayer,
    warp: cmdWarp,
    froom: cmdFroom,
    tarik: cmdTarik,
    pull: cmdTarik,
    usir: cmdUsir,
    kick: cmdUsir,
};

async function handleMessage(message) {
    try {
        if (!message.guild || message.author.bot) return;

        // Pengelolaan whitelist oleh staff
        if (message.content.startsWith(ADMIN_PREFIX)) {
            const args = message.content.slice(ADMIN_PREFIX.length).trim().split(/ +/);
            const command = args.shift()?.toLowerCase();
            if (!['premiumwl', 'premiumwhitelist', 'wlpremium'].includes(command)) return;

            // hanya moderator dan admin
            if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

            return cmdWhitelist(message, args);
        }

        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();

        const handler = PREMIUM_COMMANDS[command];
        if (!handler) return;

        if (!isWhitelisted(message.guild.id, message.author.id)) {
            const entry = getEntry(message.guild.id, message.author.id);
            return reply(message, COLOR_WARN,
                `## Akses Premium Diperlukan`,
                entry
                    ? `Akses premium kamu sudah berakhir pada ${waktuPenuh(entry.expiresAt)}.\nHubungi staff untuk memperpanjang.`
                    : 'Command ini khusus member dengan akses premium.\nLihat paket dan benefitnya di channel informasi donasi.');
        }

        await handler(message, args);
    } catch (err) {
        console.error('[PREMIUM] error:', err);
        reply(message, COLOR_WARN, `Terjadi kesalahan: ${err.message}`);
    }
}

module.exports = { handleMessage, addWhitelist, removeWhitelist, isWhitelisted, getEntry };
