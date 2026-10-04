// utils/donasiSystem.js
// Sistem donasi manual dengan tampilan Components V2.
// Staff mengumumkan donasi lewat command, bot memformat menjadi tampilan rapi,
// menentukan tier berdasarkan nominal, dan memperbarui papan leaderboard otomatis.
// Dipakai oleh events/donasiCommands.js

const fs = require('fs');
const path = require('path');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
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

const PREFIX = 'g!';

// Channel tempat pengumuman donasi dan papan leaderboard ditampilkan.
const DONATION_CHANNEL_ID = botConfig.DONATION_CHANNEL_ID || '1510476578138619945';

// Channel berisi regulasi, paket, dan daftar benefit lengkap.
const INFO_CHANNEL_ID = botConfig.DONATION_INFO_CHANNEL_ID || '1510533314895675415';

// Halaman donasi yang dipasang pada tombol.
const DONATION_URL = 'https://sociabuzz.com/gkzn/tribe';

// Warna aksen
const COLOR_DEFAULT = 0xF1C40F;
const COLOR_OK = 0x57F287;
const COLOR_WARN = 0xED4245;
const COLOR_INFO = 0x5865F2;

// Jumlah donatur yang ditampilkan di leaderboard.
const TOP_LIMIT = 10;

// Berapa peringkat teratas yang ditampilkan lengkap dengan bar proporsi.
const PODIUM_SIZE = 3;

// ============================================================
//  TIER
// ============================================================

const ROLE_SOCIALITE = '1420986794253746186';
const ROLE_CRAZYRICH = '1362504922033295500';
const ROLE_SULTAN = '1510540521896939621';

// Satuan masa berlaku role
const HARI = 24 * 60 * 60 * 1000;
const BULAN = 30 * HARI;
const TAHUN = 365 * HARI;

// Channel tempat member membuat custom role miliknya sendiri.
const CUSTOM_ROLE_CHANNEL_ID = botConfig.CUSTOM_ROLE_CHANNEL_ID || '1532085449999253504';

// Sistem role bermasa berlaku dipakai ulang dari modul giveRole, supaya jadwal
// kedaluwarsa hanya ditulis dari satu tempat. Menulis file jadwal dari dua modul
// berbeda akan saling menimpa.
let roleSystem = null;
try {
    roleSystem = require('./giveRoleSystem');
} catch {
    console.warn('[DONASI] utils/giveRoleSystem.js tidak ditemukan, pemberian role otomatis dinonaktifkan.');
}

// Sistem command premium, dipakai untuk memberi akses d! secara otomatis.
let premiumSystem = null;
try {
    premiumSystem = require('./premiumSystem');
} catch {
    console.warn('[DONASI] utils/premiumSystem.js tidak ditemukan, akses command premium tidak diberikan otomatis.');
}

// Diurutkan dari nominal tertinggi. Tier pertama yang terpenuhi yang dipakai.
//   roles       : role yang diberikan bot beserta masa berlakunya
//   premium     : akses command premium d!, durasi null berarti permanen
//   otomatis    : benefit yang langsung menyala begitu role diterima
//   mandiri     : benefit yang diatur sendiri oleh member
const TIERS = [
    {
        name: 'SULTAN',
        min: 750000,
        color: 0xE8B923,
        roles: [
            { id: ROLE_SOCIALITE, durasi: TAHUN, label: '1 tahun' },
            { id: ROLE_CRAZYRICH, durasi: TAHUN, label: '1 tahun' },
            { id: ROLE_SULTAN, durasi: TAHUN, label: '1 tahun' },
        ],
        premium: { durasi: null, label: 'permanen' },
        otomatis: [
            'Seluruh benefit tier sebelumnya',
            'Kontrol voice penuh lewat command premium',
            'Private voice lounge permanen',
            'Pengumuman resmi di announcement channel',
            'Giveaway khusus sebagai sambutan',
            'Early access untuk fitur baru GO KAIZEN',
        ],
        mandiri: [
            'Custom role selama 1 tahun, dibuat sendiri di <#CUSTOM_ROLE_CHANNEL>',
        ],
        benefits:
            `\u2022 Role <@&${ROLE_SOCIALITE}>, <@&${ROLE_CRAZYRICH}>, dan <@&${ROLE_SULTAN}> selama 1 tahun\n` +
            '\u2022 Custom role: nama, warna solid, gradient, atau hologram, dan icon selama 1 tahun\n' +
            '\u2022 Seluruh benefit tier sebelumnya\n' +
            '\u2022 Akses command bot premium secara permanen (syarat dan ketentuan berlaku)\n' +
            '\u2022 Kontrol voice penuh: menarik, memindahkan, disconnect, server mute, dan deafen\n' +
            '\u2022 Private voice lounge permanen\n' +
            '\u2022 Pengumuman resmi di announcement channel\n' +
            '\u2022 Giveaway khusus sebagai sambutan\n' +
            '\u2022 Early access untuk fitur baru GO KAIZEN',
    },
    {
        name: 'CRAZY RICH',
        min: 100000,
        color: 0x2EA0F0,
        roles: [
            { id: ROLE_SOCIALITE, durasi: 3 * BULAN, label: '3 bulan' },
            { id: ROLE_CRAZYRICH, durasi: BULAN, label: '1 bulan' },
        ],
        premium: { durasi: BULAN, label: '1 bulan' },
        otomatis: [
            'Seluruh benefit tier Socialite',
            'Menarik, memindahkan, dan mengeluarkan member dari voice lewat command premium',
        ],
        mandiri: [
            'Custom role selama 1 bulan, dibuat sendiri di <#CUSTOM_ROLE_CHANNEL>',
            'Hak mengatur 1 custom auto-responder, ajukan ke staff',
        ],
        benefits:
            `\u2022 Role <@&${ROLE_SOCIALITE}> selama 3 bulan\n` +
            `\u2022 Role <@&${ROLE_CRAZYRICH}> selama 1 bulan\n` +
            '\u2022 Custom role: nama, warna solid, gradient, atau hologram, dan icon selama 1 bulan\n' +
            '\u2022 Seluruh benefit tier Socialite\n' +
            '\u2022 Akses command bot premium selama 1 bulan (syarat dan ketentuan berlaku)\n' +
            '\u2022 Dapat menarik, memindahkan, dan disconnect member dari voice\n' +
            '\u2022 Hak mengatur 1 custom auto-responder (syarat dan ketentuan berlaku)',
    },
    {
        name: 'SOCIALITE',
        min: 35000,
        color: 0x57606A,
        roles: [
            { id: ROLE_SOCIALITE, durasi: BULAN, label: '1 bulan' },
        ],
        premium: null,
        otomatis: [
            'Bypass slowmode di General Chat',
            'Akses embed link dan attach file',
            'Akses external sticker dan emoji',
            'Akses soundboard',
            'Akses ganti nickname',
            'Akses VIP Lounge (text dan voice)',
        ],
        mandiri: [
            'Custom role selama 1 bulan, dibuat sendiri di <#CUSTOM_ROLE_CHANNEL>',
        ],
        benefits:
            `\u2022 Role <@&${ROLE_SOCIALITE}> selama 1 bulan\n` +
            '\u2022 Custom role: nama, warna solid, dan icon selama 1 bulan\n' +
            '\u2022 Bypass slowmode di General Chat\n' +
            '\u2022 Akses embed link dan attach file\n' +
            '\u2022 Akses external sticker dan emoji\n' +
            '\u2022 Akses soundboard\n' +
            '\u2022 Akses ganti nickname\n' +
            '\u2022 Akses VIP Lounge (text dan voice)',
    },
];

// Menyisipkan id channel custom role ke dalam teks benefit mandiri
function isiChannel(teks) {
    return teks.replace('<#CUSTOM_ROLE_CHANNEL>', `<#${CUSTOM_ROLE_CHANNEL_ID}>`);
}

// ============================================================
//  AKUMULASI DAN TONGGAK BENEFIT
// ============================================================
//
// Benefit dihitung dari total donasi yang terkumpul, bukan dari besarnya satu
// kali kirim. Donasi kecil yang berulang akan menumpuk sampai menyentuh nilai
// paket, lalu benefitnya diberikan.
//
// Setiap kelipatan nilai paket dihitung sebagai satu unit. Unit yang sudah
// pernah diberikan dicatat, sehingga penambahan berikutnya hanya memberi
// selisihnya saja dan tidak pernah dobel.
//
// Contoh dengan paket Socialite 35.000:
//   total  35.000 -> 1 unit  -> role 30 hari
//   total  70.000 -> 2 unit  -> tambah 30 hari lagi
//   total 100.000 -> naik ke paket Crazy Rich, 1 unit paket tersebut

function unitFor(total, tier) {
    return tier ? Math.floor(total / tier.min) : 0;
}

// Unit yang belum diberikan pada paket yang sedang berlaku
function unitTertunda(record, total) {
    const tier = tierFor(total);
    if (!tier) return { tier: null, tertunda: 0, target: 0 };
    const target = unitFor(total, tier);
    const sudah = (record.granted && record.granted[tier.name]) || 0;
    return { tier, tertunda: Math.max(0, target - sudah), target };
}

function tandaiDiberikan(guildId, donor, tierName, jumlahUnit) {
    const rec = getDonorRecord(guildId, donor);
    if (!rec) return;
    if (!rec.granted) rec.granted = {};
    rec.granted[tierName] = jumlahUnit;
    saveData();
}

// Menyamakan catatan unit dengan total tanpa memberi benefit apa pun.
// Dipakai saat staff memasukkan donasi lama agar tidak memicu pemberian ulang.
function samakanUnit(guildId, donor) {
    const rec = getDonorRecord(guildId, donor);
    if (!rec) return;
    if (!rec.granted) rec.granted = {};
    const tier = tierFor(rec.total);
    if (tier) rec.granted[tier.name] = unitFor(rec.total, tier);
    saveData();
}

// Nilai berikutnya yang akan memicu benefit, baik perpanjangan maupun kenaikan paket
function tonggakBerikut(total) {
    const kandidat = [];

    const tier = tierFor(total);
    if (tier) {
        kandidat.push({
            nilai: (unitFor(total, tier) + 1) * tier.min,
            tier,
            tipe: 'perpanjangan',
        });
    }

    const naik = TIERS.filter(t => t.min > total).sort((a, b) => a.min - b.min)[0];
    if (naik) kandidat.push({ nilai: naik.min, tier: naik, tipe: 'upgrade' });

    if (!kandidat.length) return null;
    return kandidat.sort((a, b) => a.nilai - b.nilai)[0];
}

const TIER_TERENDAH = TIERS[TIERS.length - 1];

function tierFor(amount) {
    return TIERS.find(t => amount >= t.min) || null;
}

// ============================================================
//  EMOJI
// ============================================================

const RANK_EMOJI = {
    1: '<:1_:1532794870195032124>',
    2: '<:2_:1532794901207453698>',
    3: '<:3_:1532794930525896725>',
    4: '<:4_:1532794964034064404>',
    5: '<:5_:1532794994019012892>',
    6: '<:6_:1532795020678271106>',
    7: '<:7_:1532795047500582943>',
    8: '<:8_:1532795072482119771>',
    9: '<:9_:1532795101024092413>',
    10: '<:10:1532795127305601105>',
};

const EMOJI_TROPHY = '<:piala:1532795152572092456>';
const EMOJI_ARROW = '<a:arrow:1532795180770660382>';

function rankLabel(pos) {
    return RANK_EMOJI[pos] || `**${pos}.**`;
}

// ============================================================
//  PENYIMPANAN
// ============================================================

const DATA_FILE = path.join(__dirname, '..', 'data', 'donasiData.json');

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return {};
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        console.error('[DONASI] gagal baca donasiData.json:', err.message);
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
        console.error('[DONASI] gagal simpan donasiData.json:', err.message);
    }
}

function donorKey(donor) {
    return donor.userId ? `u:${donor.userId}` : `n:${donor.name.toLowerCase()}`;
}

function getGuildDonors(guildId) {
    return (db[guildId] && db[guildId].donors) || {};
}

// Riwayat donasi yang disimpan per donatur. Dibatasi agar file tidak membengkak.
const HISTORY_MAX = 50;

function addDonation(guildId, donor, amount, meta = {}) {
    if (!db[guildId]) db[guildId] = { donors: {} };
    if (!db[guildId].donors) db[guildId].donors = {};

    const key = donorKey(donor);
    const existing = db[guildId].donors[key];
    const now = Date.now();

    const entri = {
        amount,
        at: now,
        tier: meta.tier || null,
        by: meta.by || null,
        text: meta.text || null,
    };

    if (existing) {
        existing.total += amount;
        existing.count += 1;
        existing.lastAt = now;
        if (donor.userId) existing.userId = donor.userId;
        else existing.name = donor.name;

        if (!Array.isArray(existing.history)) existing.history = [];
        existing.history.push(entri);
        if (existing.history.length > HISTORY_MAX) {
            existing.history = existing.history.slice(-HISTORY_MAX);
        }
    } else {
        db[guildId].donors[key] = {
            ...(donor.userId ? { userId: donor.userId } : { name: donor.name }),
            total: amount,
            count: 1,
            firstAt: now,
            lastAt: now,
            history: [entri],
        };
    }
    saveData();
    return db[guildId].donors[key];
}

function getDonorRecord(guildId, donor) {
    return getGuildDonors(guildId)[donorKey(donor)] || null;
}

function setTotal(guildId, donor, amount) {
    if (!db[guildId]) db[guildId] = { donors: {} };
    if (!db[guildId].donors) db[guildId].donors = {};

    const key = donorKey(donor);
    const existing = db[guildId].donors[key];
    if (existing) {
        existing.total = amount;
        if (donor.userId) existing.userId = donor.userId;
        else existing.name = donor.name;
    } else {
        db[guildId].donors[key] = {
            ...(donor.userId ? { userId: donor.userId } : { name: donor.name }),
            total: amount,
            count: 1,
            lastAt: Date.now(),
        };
    }
    saveData();
    return db[guildId].donors[key];
}

function removeDonor(guildId, donor) {
    const key = donorKey(donor);
    if (db[guildId] && db[guildId].donors && db[guildId].donors[key]) {
        delete db[guildId].donors[key];
        saveData();
        return true;
    }
    return false;
}

function getDonorsSorted(guildId) {
    return Object.values(getGuildDonors(guildId)).sort((a, b) => b.total - a.total);
}

function getBoard(guildId) {
    return db[guildId] && db[guildId].board ? db[guildId].board : null;
}

function setBoard(guildId, channelId, messageId) {
    if (!db[guildId]) db[guildId] = { donors: {} };
    db[guildId].board = { channelId, messageId };
    saveData();
}

function clearBoard(guildId) {
    if (db[guildId] && db[guildId].board) {
        delete db[guildId].board;
        saveData();
    }
}

// ============================================================
//  KOMPONEN V2
// ============================================================

const HAS_V2 =
    typeof ContainerBuilder === 'function' &&
    typeof TextDisplayBuilder === 'function' &&
    MessageFlags && MessageFlags.IsComponentsV2 !== undefined;

const HAS_SECTION =
    typeof SectionBuilder === 'function' && typeof ThumbnailBuilder === 'function';

const HAS_BUTTON =
    typeof ActionRowBuilder === 'function' && typeof ButtonBuilder === 'function' && ButtonStyle;

function textOf(content) {
    return new TextDisplayBuilder().setContent(content);
}

function divider() {
    const s = new SeparatorBuilder();
    if (typeof s.setDivider === 'function') s.setDivider(true);
    if (typeof s.setSpacing === 'function' && SeparatorSpacingSize) s.setSpacing(SeparatorSpacingSize.Small);
    return s;
}

function newContainer(color) {
    const c = new ContainerBuilder();
    if (typeof c.setAccentColor === 'function') c.setAccentColor(color);
    return c;
}

// Menambahkan teks. Kalau avatar tersedia dan Section didukung, teks ditempel
// berdampingan dengan gambar donatur.
function addHeader(container, content, avatar) {
    if (avatar && HAS_SECTION && typeof container.addSectionComponents === 'function') {
        try {
            const section = new SectionBuilder().addTextDisplayComponents(textOf(content));
            const thumb = new ThumbnailBuilder().setURL(avatar);
            if (typeof section.setThumbnailAccessory === 'function') {
                section.setThumbnailAccessory(thumb);
                container.addSectionComponents(section);
                return;
            }
        } catch { /* lanjut ke teks biasa */ }
    }
    container.addTextDisplayComponents(textOf(content));
}

function addDivider(container) {
    if (typeof container.addSeparatorComponents === 'function') {
        try { container.addSeparatorComponents(divider()); return; } catch { /* abaikan */ }
    }
}

// Tombol tautan menuju halaman donasi. Tidak butuh handler interaksi.
function addDonateButton(container) {
    if (!HAS_BUTTON || typeof container.addActionRowComponents !== 'function') return;
    try {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('Donasi Sekarang')
                .setURL(DONATION_URL)
        );
        container.addActionRowComponents(row);
    } catch { /* tombol opsional */ }
}

function payloadOf(container, mentions) {
    return {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: mentions || { parse: [], repliedUser: false },
    };
}

// Tampilan sederhana untuk balasan konfirmasi ke staff
function simple(color, content) {
    if (!HAS_V2) return { content, allowedMentions: { parse: [], repliedUser: false } };
    const c = newContainer(color);
    c.addTextDisplayComponents(textOf(content));
    return payloadOf(c);
}

const reply = (message, color, content) =>
    message.reply(simple(color, content)).catch(() => null);

// ============================================================
//  UTILITAS
// ============================================================

function formatRupiah(n) {
    const s = Math.round(n).toString();
    return 'Rp ' + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const waktuPenuh = ts => `<t:${Math.floor(ts / 1000)}:D>`;
const waktuRelatif = ts => `<t:${Math.floor(ts / 1000)}:R>`;

function sisaWaktu(ms) {
    if (ms <= 0) return 'habis';
    const hari = Math.floor(ms / HARI);
    if (hari >= 1) return `${hari} hari lagi`;
    const jam = Math.floor(ms / (60 * 60 * 1000));
    if (jam >= 1) return `${jam} jam lagi`;
    return 'kurang dari 1 jam';
}

// Batang proporsi sederhana untuk menggambarkan besaran relatif
function bar(value, max, len = 12) {
    if (!max || max <= 0) return '';
    const ratio = Math.max(0, Math.min(1, value / max));
    const filled = Math.max(1, Math.round(ratio * len));
    return '`' + '\u2588'.repeat(filled) + '\u2591'.repeat(Math.max(0, len - filled)) + '`';
}

function parseAmount(raw) {
    if (!raw) return null;
    let s = String(raw).toLowerCase().replace(/rp/g, '').replace(/\s/g, '').trim();

    let mult = 1;
    if (/(?:jt|juta)$/.test(s)) { mult = 1000000; s = s.replace(/(?:jt|juta)$/, ''); }
    else if (/(?:rb|ribu|k)$/.test(s)) { mult = 1000; s = s.replace(/(?:rb|ribu|k)$/, ''); }

    if (mult > 1) {
        s = s.replace(/,/g, '.');
        const n = parseFloat(s);
        if (!isFinite(n) || n <= 0) return null;
        return Math.round(n * mult);
    }

    s = s.replace(/[.,]/g, '');
    if (!/^\d+$/.test(s)) return null;
    const n = parseInt(s, 10);
    return n > 0 ? n : null;
}

function parseDonorAmount(message, rawArgs) {
    const tokens = [...rawArgs];

    let amountIdx = -1;
    let amount = null;
    for (let i = 0; i < tokens.length; i++) {
        const a = parseAmount(tokens[i]);
        if (a) { amountIdx = i; amount = a; break; }
    }

    if (amount === null || amountIdx < 1) return { ok: false };

    const donorTokens = tokens.slice(0, amountIdx);
    const text = tokens.slice(amountIdx + 1).join(' ').trim();

    const mentionUser = message.mentions.users.first();
    let donor;
    if (mentionUser && donorTokens.some(t => t.replace(/[<@!>]/g, '') === mentionUser.id)) {
        donor = { userId: mentionUser.id };
    } else {
        const name = donorTokens.join(' ').trim();
        if (!name) return { ok: false };
        donor = { name };
    }

    return { ok: true, donor, amount, text };
}

function resolveDonorOnly(message, rawArgs) {
    const mentionUser = message.mentions.users.first();
    if (mentionUser) return { userId: mentionUser.id };
    const name = rawArgs.join(' ').trim();
    return name ? { name } : null;
}

async function donorDisplay(client, donor) {
    if (donor.userId) {
        const u = await client.users.fetch(donor.userId).catch(() => null);
        return { text: `<@${donor.userId}>`, avatar: u ? u.displayAvatarURL({ size: 256 }) : null };
    }
    return { text: donor.name, avatar: null };
}

// ============================================================
//  TAMPILAN DONASI
// ============================================================

function buildDonasiPayload(data, mentions) {
    const { display, avatar, amount, total, pesan, tier, unitBaru, naikPaket, roleDiberikan, tonggak } = data;
    const dapatBenefit = Boolean(tier && unitBaru > 0);
    const c = newContainer(tier ? tier.color : COLOR_DEFAULT);

    const judul =
        `## ${EMOJI_TROPHY} Donasi Baru\n` +
        `Terima kasih ${display} atas dukungannya untuk GO KAIZEN.`;
    addHeader(c, judul, avatar);

    addDivider(c);
    c.addTextDisplayComponents(textOf(
        `**Nominal Donasi**\n${EMOJI_ARROW} ${formatRupiah(amount)}\n\n` +
        `**Total Terkumpul**\n${EMOJI_ARROW} ${formatRupiah(total)}`
    ));

    if (dapatBenefit) {
        addDivider(c);
        c.addTextDisplayComponents(textOf(
            `**${naikPaket ? 'Naik Paket' : 'Benefit Diperpanjang'}**\n` +
            `${EMOJI_ARROW} Paket ${tier.name}` +
            (unitBaru > 1 ? `\n${EMOJI_ARROW} ${unitBaru} kelipatan sekaligus` : '')
        ));

        addDivider(c);
        c.addTextDisplayComponents(textOf(
            `**Benefit ${tier.name}**\n` + tier.benefits.replace(/\u2022/g, EMOJI_ARROW)
        ));

        if (tier.premium) {
            addDivider(c);
            c.addTextDisplayComponents(textOf(
                `**Command Premium**\n` +
                `${EMOJI_ARROW} Akses command premium aktif ${tier.premium.label}\n` +
                `${EMOJI_ARROW} Ketik \`d!help\` untuk melihat seluruh command yang bisa dipakai\n` +
                `${EMOJI_ARROW} Tersedia broadcast voice, cari member, warp, tarik, dan usir member`
            ));
        }

        if (Array.isArray(roleDiberikan) && roleDiberikan.length) {
            addDivider(c);
            c.addTextDisplayComponents(textOf(
                `**Masa Berlaku Role**\n` +
                roleDiberikan.map(r =>
                    `${EMOJI_ARROW} <@&${r.roleId}> sampai ${waktuPenuh(r.expiresAt)} (${waktuRelatif(r.expiresAt)})`
                ).join('\n')
            ));
        }

        addDivider(c);
        let lanjutan = `**Langkah Selanjutnya**\n` +
            `${EMOJI_ARROW} Seluruh benefit menyala otomatis begitu role diterima\n` +
            `${EMOJI_ARROW} Buat custom role sendiri di <#${CUSTOM_ROLE_CHANNEL_ID}>\n`;
        if (tier.premium) lanjutan += `${EMOJI_ARROW} Lihat command premium dengan \`d!help\`\n`;
        lanjutan += `${EMOJI_ARROW} Cek rincian donasi dan masa berlaku dengan \`${PREFIX}infodonasi\``;
        c.addTextDisplayComponents(textOf(lanjutan));
    }

    // Progres menuju benefit berikutnya, selalu ditampilkan selama masih ada tonggak
    if (tonggak) {
        const dasar = tier ? unitFor(total, tier) * tier.min : 0;
        const rentang = tonggak.nilai - dasar;
        const maju = total - dasar;
        const persen = Math.max(0, Math.min(100, Math.floor((maju / rentang) * 100)));

        addDivider(c);
        c.addTextDisplayComponents(textOf(
            `**Menuju ${tonggak.tipe === 'upgrade' ? `Paket ${tonggak.tier.name}` : `Perpanjangan ${tonggak.tier.name}`}**\n` +
            `${bar(maju, rentang)} ${persen}%\n` +
            `Kurang ${formatRupiah(tonggak.nilai - total)} lagi dari total ${formatRupiah(tonggak.nilai)}.`
        ));
    }

    if (pesan) {
        addDivider(c);
        c.addTextDisplayComponents(textOf(`**Pesan**\n> ${pesan}`));
    }

    addDonateButton(c);

    return payloadOf(c, mentions);
}

// ============================================================
//  TAMPILAN LEADERBOARD
// ============================================================

function buildLeaderboardPayload(guildId, limit) {
    const donors = getDonorsSorted(guildId);
    const c = newContainer(COLOR_DEFAULT);

    c.addTextDisplayComponents(textOf(`## ${EMOJI_TROPHY} Top Donatur GO KAIZEN`));
    addDivider(c);

    if (!donors.length) {
        c.addTextDisplayComponents(textOf('Belum ada donasi yang tercatat.'));
        addDonateButton(c);
        return payloadOf(c);
    }

    const top = donors.slice(0, limit);
    const max = top[0].total;

    // Peringkat teratas ditampilkan lengkap dengan bar proporsi
    const podium = top.slice(0, PODIUM_SIZE).map((d, i) => {
        const nama = d.userId ? `<@${d.userId}>` : d.name;
        const t = tierFor(d.total);
        const label = t ? ` \u00b7 ${t.name}` : '';
        return `${rankLabel(i + 1)} ${nama}${label}\n` +
            `${EMOJI_ARROW} ${formatRupiah(d.total)} dari ${d.count} donasi\n` +
            `${bar(d.total, max)}`;
    }).join('\n\n');

    c.addTextDisplayComponents(textOf(podium));

    // Sisanya ditampilkan ringkas
    const sisa = top.slice(PODIUM_SIZE);
    if (sisa.length) {
        addDivider(c);
        const ringkas = sisa.map((d, i) => {
            const nama = d.userId ? `<@${d.userId}>` : d.name;
            return `${rankLabel(PODIUM_SIZE + i + 1)} ${nama} ${EMOJI_ARROW} ${formatRupiah(d.total)}`;
        }).join('\n');
        c.addTextDisplayComponents(textOf(ringkas));
    }

    const grand = donors.reduce((a, d) => a + d.total, 0);
    const totalCount = donors.reduce((a, d) => a + d.count, 0);

    addDivider(c);
    c.addTextDisplayComponents(textOf(
        `**Total Terkumpul**\n` +
        `${EMOJI_ARROW} ${formatRupiah(grand)}\n` +
        `${donors.length} donatur dari ${totalCount} donasi`
    ));

    addDonateButton(c);

    return payloadOf(c);
}

// Memperbarui papan leaderboard yang terpasang.
async function refreshBoard(client, guildId) {
    const board = getBoard(guildId);
    if (!board) return;

    try {
        const channel = await client.channels.fetch(board.channelId).catch(() => null);
        if (!channel) return;
        const msg = await channel.messages.fetch(board.messageId).catch(() => null);
        if (!msg) {
            clearBoard(guildId);
            return;
        }
        await msg.edit(buildLeaderboardPayload(guildId, TOP_LIMIT));
    } catch (err) {
        console.error('[DONASI] gagal perbarui leaderboard:', err.message);
    }
}

// ============================================================
//  PEMBERIAN ROLE OTOMATIS
// ============================================================

// Memberikan seluruh role paket kepada donatur beserta masa berlakunya.
// unit lebih dari satu berarti donatur menumpuk beberapa kelipatan sekaligus,
// sehingga durasinya dikalikan. Masa berlaku ditambahkan ke sisa yang sedang
// berjalan, jadi donasi berulang memperpanjang dan tidak mengulang dari nol.
async function berikanRoleTier(guild, userId, tier, grantedById, unit = 1) {
    if (!roleSystem || !tier || !Array.isArray(tier.roles)) return { diberikan: [], gagal: [] };

    const kali = Math.max(1, unit);
    const diberikan = [];
    const gagal = [];

    for (const r of tier.roles) {
        const hasil = await roleSystem.grantTimedRole(
            guild, userId, r.id, r.durasi * kali, grantedById,
            { extend: true, reason: `Donasi paket ${tier.name}` }
        );

        if (hasil.ok) {
            diberikan.push({
                roleId: r.id,
                label: r.label,
                expiresAt: hasil.expiresAt,
                diperpanjang: hasil.diperpanjang,
            });
        } else {
            gagal.push({ roleId: r.id, alasan: hasil.reason });
            console.error(`[DONASI] gagal beri role ${r.id}: ${hasil.reason}`);
        }
    }

    return { diberikan, gagal };
}

// ============================================================
//  COMMAND: g!donasi
// ============================================================

function usageDonasi() {
    return (
        `## Cara Pakai Donasi\n` +
        `\`${PREFIX}donasi <@user atau nama> <nominal> [pesan]\`\n\n` +
        'Mengumumkan donasi dan menambahkannya ke total donatur.\n\n' +
        '**Contoh**\n' +
        `${EMOJI_ARROW} \`${PREFIX}donasi @user 35000 makasih server keren\`\n` +
        `${EMOJI_ARROW} \`${PREFIX}donasi @user 100rb\`\n` +
        `${EMOJI_ARROW} \`${PREFIX}donasi Budi 1jt terima kasih\`\n\n` +
        '**Format nominal**\n' +
        `${EMOJI_ARROW} 35000, 35.000, 35rb, 100k, 1jt, 1,5jt`
    );
}

async function cmdDonasi(message, args) {
    const parsed = parseDonorAmount(message, args);
    if (!parsed.ok) return reply(message, COLOR_INFO, usageDonasi());

    const { donor, amount, text } = parsed;

    // Paket ditentukan dari total setelah donasi ini, bukan dari nominal sekali kirim.
    const sebelum = getDonorRecord(message.guild.id, donor);
    const totalSebelum = sebelum ? sebelum.total : 0;

    const record = addDonation(message.guild.id, donor, amount, {
        tier: null,
        by: message.author.id,
        text: text || null,
    });

    const total = record.total;
    const tierSebelum = tierFor(totalSebelum);
    const { tier, tertunda, target } = unitTertunda(record, total);
    const naikPaket = tier && (!tierSebelum || tierSebelum.name !== tier.name);

    // catat nama paket pada riwayat donasi terakhir
    if (Array.isArray(record.history) && record.history.length) {
        record.history[record.history.length - 1].tier = tier ? tier.name : null;
        saveData();
    }

    let hasilRole = { diberikan: [], gagal: [] };
    let premiumInfo = null;

    if (tier && tertunda > 0 && donor.userId) {
        hasilRole = await berikanRoleTier(message.guild, donor.userId, tier, message.author.id, tertunda);

        if (tier.premium && premiumSystem && typeof premiumSystem.addWhitelist === 'function') {
            try {
                const durasi = tier.premium.durasi ? tier.premium.durasi * tertunda : null;
                const entry = premiumSystem.addWhitelist(
                    message.guild.id, donor.userId, durasi, message.author.id,
                    { note: `Donasi paket ${tier.name}` }
                );
                premiumInfo = { label: tier.premium.label, expiresAt: entry.expiresAt };
            } catch (err) {
                console.error('[DONASI] gagal beri akses premium:', err.message);
            }
        }

        tandaiDiberikan(message.guild.id, donor, tier.name, target);
    }

    const display = await donorDisplay(message.client, donor);
    const tonggak = tonggakBerikut(total);

    const channel = await message.client.channels.fetch(DONATION_CHANNEL_ID).catch(() => null);
    if (channel) {
        await channel.send(buildDonasiPayload({
            display: display.text,
            avatar: display.avatar,
            amount,
            total,
            pesan: text,
            tier,
            unitBaru: tertunda,
            naikPaket,
            roleDiberikan: hasilRole.diberikan,
            tonggak,
        }, { users: donor.userId ? [donor.userId] : [] })).catch(() => null);
    }

    let konfirmasi =
        `## Donasi Tercatat\n` +
        `${EMOJI_ARROW} Donatur: ${display.text}\n` +
        `${EMOJI_ARROW} Nominal donasi ini: ${formatRupiah(amount)}\n` +
        `${EMOJI_ARROW} Total terkumpul: ${formatRupiah(total)} dari ${record.count} donasi\n` +
        `${EMOJI_ARROW} Paket saat ini: ${tier ? tier.name : 'belum mencapai paket'}`;

    if (tier && tertunda > 0) {
        konfirmasi += `\n${EMOJI_ARROW} Benefit diberikan: ${tertunda} paket ${tier.name}` +
            (naikPaket ? ' (naik paket)' : ' (perpanjangan)');
    } else if (tonggak) {
        konfirmasi += `\n${EMOJI_ARROW} Kurang ${formatRupiah(tonggak.nilai - total)} lagi menuju ` +
            `${tonggak.tipe === 'upgrade' ? `paket ${tonggak.tier.name}` : `perpanjangan ${tonggak.tier.name}`}`;
    }

    if (tier && tertunda > 0 && !donor.userId) {
        konfirmasi += `\n\n**Benefit Belum Diberikan**\nDonatur dicatat dengan nama, bukan akun Discord. ` +
            `Berikan role secara manual, atau catat ulang dengan mention agar seluruh benefit berjalan otomatis.`;
    } else if (hasilRole.diberikan.length) {
        konfirmasi += `\n\n**Role Diberikan**\n` + hasilRole.diberikan.map(r =>
            `${EMOJI_ARROW} <@&${r.roleId}> sampai ${waktuPenuh(r.expiresAt)}${r.diperpanjang ? ' (diperpanjang)' : ''}`
        ).join('\n');
    }

    if (hasilRole.gagal.length) {
        konfirmasi += `\n\n**Role Gagal Diberikan**\n` + hasilRole.gagal.map(r =>
            `${EMOJI_ARROW} <@&${r.roleId}>: ${r.alasan}`
        ).join('\n');
    }

    if (premiumInfo) {
        konfirmasi += `\n\n**Akses Command Premium**\n` +
            `${EMOJI_ARROW} Aktif ${premiumInfo.expiresAt ? `sampai ${waktuPenuh(premiumInfo.expiresAt)}` : 'permanen'}\n` +
            `${EMOJI_ARROW} Cabut kapan saja dengan \`${PREFIX}premiumwl remove ${display.text}\``;
    }

    if (tier && tertunda > 0) {
        if (Array.isArray(tier.otomatis) && tier.otomatis.length) {
            konfirmasi += `\n\n**Aktif Bersama Role**\n` +
                tier.otomatis.map(m => `${EMOJI_ARROW} ${m}`).join('\n');
        }
        if (Array.isArray(tier.mandiri) && tier.mandiri.length) {
            konfirmasi += `\n\n**Diatur Sendiri oleh Member**\n` +
                tier.mandiri.map(m => `${EMOJI_ARROW} ${isiChannel(m)}`).join('\n');
        }
    }

    konfirmasi += `\n\n` + (channel
        ? `Diumumkan di <#${DONATION_CHANNEL_ID}>`
        : 'Channel pengumuman tidak ditemukan, cek DONATION_CHANNEL_ID.');

    await reply(message, COLOR_OK, konfirmasi);

    await refreshBoard(message.client, message.guild.id);

    console.log(`[DONASI] +${formatRupiah(amount)} dari ${display.text}, total ${formatRupiah(total)}, unit baru ${tertunda}`);
}

// ============================================================
//  COMMAND: g!donasitest
// ============================================================

async function cmdDonasiTest(message, args) {
    const parsed = parseDonorAmount(message, args);
    if (!parsed.ok) return reply(message, COLOR_INFO, usageDonasi());

    const { donor, amount, text } = parsed;
    const display = await donorDisplay(message.client, donor);

    // Simulasi: total setelah donasi ini, tanpa menyimpan apa pun
    const sebelum = getDonorRecord(message.guild.id, donor);
    const totalSebelum = sebelum ? sebelum.total : 0;
    const total = totalSebelum + amount;

    const tierSebelum = tierFor(totalSebelum);
    const tier = tierFor(total);
    const sudah = (sebelum && sebelum.granted && tier && sebelum.granted[tier.name]) || 0;
    const target = unitFor(total, tier);
    const unitBaru = tier ? Math.max(0, target - sudah) : 0;
    const naikPaket = tier && (!tierSebelum || tierSebelum.name !== tier.name);

    const now = Date.now();
    const previewRole = (tier && unitBaru > 0)
        ? tier.roles.map(r => ({ roleId: r.id, expiresAt: now + r.durasi * unitBaru, diperpanjang: false }))
        : [];

    await message.channel.send(simple(COLOR_INFO,
        `## Preview Donasi\n` +
        `Tidak dicatat, tidak diumumkan, dan tidak ada benefit yang diberikan.\n` +
        `${EMOJI_ARROW} Total sekarang: ${formatRupiah(totalSebelum)}\n` +
        `${EMOJI_ARROW} Total setelah donasi ini: ${formatRupiah(total)}`
    )).catch(() => null);

    await message.channel.send(buildDonasiPayload({
        display: display.text,
        avatar: display.avatar,
        amount,
        total,
        pesan: text,
        tier,
        unitBaru,
        naikPaket,
        roleDiberikan: previewRole,
        tonggak: tonggakBerikut(total),
    }, { parse: [] })).catch(() => null);
}

// ============================================================
//  COMMAND: g!topdonatur
// ============================================================

async function cmdTopDonatur(message, args) {
    const sub = args[0]?.toLowerCase();

    if (sub === 'pin' || sub === 'set' || sub === 'on') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

        const sent = await message.channel.send(buildLeaderboardPayload(message.guild.id, TOP_LIMIT)).catch(() => null);
        if (!sent) return;

        setBoard(message.guild.id, message.channel.id, sent.id);

        await reply(message, COLOR_OK,
            `## Leaderboard Terpasang\n` +
            `Papan leaderboard dipasang di channel ini dan akan diperbarui otomatis setiap ada donasi baru.\n\n` +
            `Untuk melepasnya gunakan \`${PREFIX}topdonatur off\`.`
        );

        console.log(`[DONASI] papan leaderboard dipasang: ${sent.id}`);
        return;
    }

    if (sub === 'off' || sub === 'stop' || sub === 'unpin') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
        if (!getBoard(message.guild.id)) return reply(message, COLOR_WARN, 'Tidak ada papan leaderboard yang terpasang.');
        clearBoard(message.guild.id);
        return reply(message, COLOR_OK, '## Leaderboard Dilepas\nPesan lamanya tidak lagi diperbarui otomatis.');
    }

    await message.channel.send(buildLeaderboardPayload(message.guild.id, TOP_LIMIT)).catch(() => null);
}

// ============================================================
//  COMMAND: g!infodonasi
// ============================================================

async function cmdInfoDonasi(message, args) {
    const donor = resolveDonorOnly(message, args) || { userId: message.author.id };
    const record = getDonorRecord(message.guild.id, donor);
    const display = await donorDisplay(message.client, donor);

    const c = newContainer(COLOR_DEFAULT);

    if (!record) {
        addHeader(c, `## ${EMOJI_TROPHY} Info Donasi\n${display.text}`, display.avatar);
        addDivider(c);
        c.addTextDisplayComponents(textOf(
            'Belum ada catatan donasi untuk pengguna ini.\n\n' +
            `Lihat paket dan benefit selengkapnya di <#${INFO_CHANNEL_ID}>.`
        ));
        addDonateButton(c);
        return message.channel.send(payloadOf(c)).catch(() => null);
    }

    // ringkasan
    const tierTotal = tierFor(record.total);
    const donors = getDonorsSorted(message.guild.id);
    const peringkat = donors.findIndex(d => donorKey(d.userId ? { userId: d.userId } : { name: d.name }) === donorKey(donor)) + 1;

    addHeader(c, `## ${EMOJI_TROPHY} Info Donasi\n${display.text}`, display.avatar);
    addDivider(c);

    let ringkas =
        `**Ringkasan**\n` +
        `${EMOJI_ARROW} Total donasi: ${formatRupiah(record.total)}\n` +
        `${EMOJI_ARROW} Jumlah donasi: ${record.count} kali\n` +
        `${EMOJI_ARROW} Peringkat: ${peringkat > 0 ? `${rankLabel(peringkat)} dari ${donors.length} donatur` : 'belum masuk peringkat'}`;

    if (record.firstAt) ringkas += `\n${EMOJI_ARROW} Donasi pertama: ${waktuPenuh(record.firstAt)}`;
    if (record.lastAt) ringkas += `\n${EMOJI_ARROW} Donasi terakhir: ${waktuPenuh(record.lastAt)} (${waktuRelatif(record.lastAt)})`;

    c.addTextDisplayComponents(textOf(ringkas));

    // paket berdasarkan akumulasi dan tonggak berikutnya
    addDivider(c);
    const tonggak = tonggakBerikut(record.total);
    const unitDidapat = record.granted
        ? Object.entries(record.granted).map(([n, u]) => `${EMOJI_ARROW} ${n}: ${u} kali`).join('\n')
        : '';

    let teksPaket = `**Paket Berdasarkan Total**\n${EMOJI_ARROW} ` +
        (tierTotal ? tierTotal.name : 'Belum mencapai paket');

    if (unitDidapat) teksPaket += `\n\n**Benefit Diterima**\n${unitDidapat}`;

    if (tonggak) {
        const dasar = tierTotal ? unitFor(record.total, tierTotal) * tierTotal.min : 0;
        const rentang = tonggak.nilai - dasar;
        const maju = record.total - dasar;
        const persen = Math.max(0, Math.min(100, Math.floor((maju / rentang) * 100)));

        teksPaket += `\n\n**Menuju ${tonggak.tipe === 'upgrade' ? `Paket ${tonggak.tier.name}` : `Perpanjangan ${tonggak.tier.name}`}**\n` +
            `${bar(maju, rentang)} ${persen}%\n` +
            `Kurang ${formatRupiah(tonggak.nilai - record.total)} lagi dari total ${formatRupiah(tonggak.nilai)}.`;
    } else {
        teksPaket += `\n\nSudah mencapai paket tertinggi.`;
    }

    c.addTextDisplayComponents(textOf(teksPaket));

    // masa berlaku role aktif
    addDivider(c);
    if (donor.userId && roleSystem && typeof roleSystem.getUserGrants === 'function') {
        const grants = roleSystem.getUserGrants(message.guild.id, donor.userId)
            .filter(g => TIERS.some(t => t.roles.some(r => r.id === g.roleId)));

        if (grants.length) {
            const now = Date.now();
            c.addTextDisplayComponents(textOf(
                `**Role Aktif**\n` +
                grants.map(g =>
                    `${EMOJI_ARROW} <@&${g.roleId}>\n` +
                    `Berlaku sampai ${waktuPenuh(g.expiresAt)} (${sisaWaktu(g.expiresAt - now)})`
                ).join('\n\n')
            ));
        } else {
            c.addTextDisplayComponents(textOf(
                `**Role Aktif**\n${EMOJI_ARROW} Tidak ada role benefit yang sedang berjalan.`
            ));
        }
    } else {
        c.addTextDisplayComponents(textOf(
            `**Role Aktif**\n${EMOJI_ARROW} ` +
            (donor.userId ? 'Data masa berlaku tidak tersedia.' : 'Donatur dicatat dengan nama, bukan akun Discord.')
        ));
    }

    // riwayat donasi
    const history = Array.isArray(record.history) ? [...record.history].reverse() : [];
    addDivider(c);
    if (history.length) {
        const tampil = history.slice(0, 8);
        c.addTextDisplayComponents(textOf(
            `**Riwayat Donasi**\n` +
            tampil.map((h, i) => {
                let baris = `**${i + 1}.** ${formatRupiah(h.amount)}`;
                if (h.tier) baris += ` \u00b7 ${h.tier}`;
                baris += `\n${EMOJI_ARROW} ${waktuPenuh(h.at)} (${waktuRelatif(h.at)})`;
                if (h.text) baris += `\n> ${h.text}`;
                return baris;
            }).join('\n\n') +
            (history.length > tampil.length ? `\n\nDan ${history.length - tampil.length} donasi lainnya.` : '')
        ));
    } else {
        c.addTextDisplayComponents(textOf(
            `**Riwayat Donasi**\n${EMOJI_ARROW} Riwayat rinci belum tersedia untuk donasi lama.`
        ));
    }

    addDivider(c);
    c.addTextDisplayComponents(textOf(
        `Lihat paket dan benefit selengkapnya di <#${INFO_CHANNEL_ID}>.`
    ));

    addDonateButton(c);

    await message.channel.send(payloadOf(c)).catch(() => null);
}

// ============================================================
//  COMMAND: g!donatur
// ============================================================

function usageDonatur() {
    return (
        `## Kelola Donatur\n` +
        `${EMOJI_ARROW} \`${PREFIX}donatur add <@user atau nama> <nominal>\` tambah ke total tanpa mengumumkan\n` +
        `${EMOJI_ARROW} \`${PREFIX}donatur set <@user atau nama> <nominal>\` set total donatur (Administrator)\n` +
        `${EMOJI_ARROW} \`${PREFIX}donatur remove <@user atau nama>\` hapus donatur dari leaderboard (Administrator)\n\n` +
        'Gunakan add untuk memasukkan donasi lama tanpa spam pengumuman.'
    );
}

async function cmdDonaturAdd(message, args) {
    const parsed = parseDonorAmount(message, args);
    if (!parsed.ok) return reply(message, COLOR_INFO, `## Cara Pakai\n\`${PREFIX}donatur add <@user atau nama> <nominal>\``);

    const { donor, amount } = parsed;
    const record = addDonation(message.guild.id, donor, amount, { by: message.author.id });
    samakanUnit(message.guild.id, donor);
    const display = await donorDisplay(message.client, donor);

    await reply(message, COLOR_OK,
        `## Total Ditambahkan\n` +
        `${EMOJI_ARROW} Donatur: ${display.text}\n` +
        `${EMOJI_ARROW} Ditambahkan: ${formatRupiah(amount)}\n` +
        `${EMOJI_ARROW} Total sekarang: ${formatRupiah(record.total)} dari ${record.count} donasi\n\n` +
        `Catatan unit benefit disamakan dengan total baru, jadi tidak ada benefit yang diberikan ulang. ` +
        `Gunakan \`${PREFIX}donasi\` bila memang ingin memberi benefit.`
    );
    await refreshBoard(message.client, message.guild.id);
}

async function cmdDonaturSet(message, args) {
    const parsed = parseDonorAmount(message, args);
    if (!parsed.ok) return reply(message, COLOR_INFO, `## Cara Pakai\n\`${PREFIX}donatur set <@user atau nama> <nominal>\``);

    const { donor, amount } = parsed;
    const record = setTotal(message.guild.id, donor, amount);
    samakanUnit(message.guild.id, donor);
    const display = await donorDisplay(message.client, donor);

    await reply(message, COLOR_OK,
        `## Total Diperbarui\n` +
        `${EMOJI_ARROW} Donatur: ${display.text}\n` +
        `${EMOJI_ARROW} Total sekarang: ${formatRupiah(record.total)}`
    );
    await refreshBoard(message.client, message.guild.id);
}

async function cmdDonaturRemove(message, args) {
    const donor = resolveDonorOnly(message, args);
    if (!donor) return reply(message, COLOR_INFO, `## Cara Pakai\n\`${PREFIX}donatur remove <@user atau nama>\``);

    const record = getDonorRecord(message.guild.id, donor);
    const display = await donorDisplay(message.client, donor);

    if (!record) return reply(message, COLOR_WARN, `${display.text} tidak ada di leaderboard.`);

    const totalHilang = record.total;
    const jumlahHilang = record.count;

    // Menghapus catatan donatur berarti seluruh benefitnya ikut hilang,
    // jadi role tier dan jadwal kedaluwarsanya juga dicabut.
    const dicabut = [];
    const gagalCabut = [];

    if (donor.userId && roleSystem && typeof roleSystem.revokeTimedRole === 'function') {
        const semuaRoleTier = [...new Set(TIERS.flatMap(t => t.roles.map(r => r.id)))];
        for (const roleId of semuaRoleTier) {
            const hasil = await roleSystem.revokeTimedRole(
                message.guild, donor.userId, roleId, 'Catatan donatur dihapus'
            );
            if (hasil.dicabut) dicabut.push(roleId);
            else if (!hasil.ok) gagalCabut.push({ roleId, alasan: hasil.reason });
        }
    }

    removeDonor(message.guild.id, donor);

    let teks =
        `## Donatur Dihapus\n` +
        `${EMOJI_ARROW} Donatur: ${display.text}\n` +
        `${EMOJI_ARROW} Total dihapus: ${formatRupiah(totalHilang)} dari ${jumlahHilang} donasi\n` +
        `${EMOJI_ARROW} Riwayat donasi ikut terhapus`;

    if (dicabut.length) {
        teks += `\n\n**Role Benefit Dicabut**\n` + dicabut.map(id => `${EMOJI_ARROW} <@&${id}>`).join('\n');
    } else if (donor.userId) {
        teks += `\n\n**Role Benefit**\n${EMOJI_ARROW} Tidak ada role tier yang sedang dipegang.`;
    } else {
        teks += `\n\n**Role Benefit**\n${EMOJI_ARROW} Donatur dicatat dengan nama, cabut role secara manual bila ada.`;
    }

    if (gagalCabut.length) {
        teks += `\n\n**Gagal Dicabut**\n` + gagalCabut.map(g => `${EMOJI_ARROW} <@&${g.roleId}>: ${g.alasan}`).join('\n');
    }

    teks += `\n\nBenefit yang diproses manual seperti custom role dan akses bot premium perlu dicabut sendiri oleh staff.`;

    await reply(message, COLOR_OK, teks);
    await refreshBoard(message.client, message.guild.id);

    console.log(`[DONASI] donatur dihapus: ${display.text}, role dicabut: ${dicabut.length}`);
}

// ============================================================
//  DISPATCHER
// ============================================================

async function handleMessage(message) {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();

        if (command === 'topdonatur' || command === 'topdonasi') {
            return cmdTopDonatur(message, args);
        }

        // info donasi bisa dilihat semua orang
        if (command === 'infodonasi' || command === 'donasiinfo' || command === 'mydonasi') {
            return cmdInfoDonasi(message, args);
        }

        const known = ['donasi', 'donasitest', 'donatur'];
        if (!known.includes(command)) return;

        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

        if (command === 'donasi') return cmdDonasi(message, args);
        if (command === 'donasitest') return cmdDonasiTest(message, args);

        if (command === 'donatur') {
            const sub = args.shift()?.toLowerCase();
            if (sub === 'add') return cmdDonaturAdd(message, args);

            if (sub === 'set' || sub === 'remove') {
                if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return reply(message, COLOR_WARN, 'Command ini khusus role dengan permission Administrator.');
                }
                return sub === 'set' ? cmdDonaturSet(message, args) : cmdDonaturRemove(message, args);
            }

            return reply(message, COLOR_INFO, usageDonatur());
        }
    } catch (err) {
        console.error('[DONASI] error:', err);
        reply(message, COLOR_WARN, `Terjadi kesalahan: ${err.message}`);
    }
}

module.exports = { handleMessage };
