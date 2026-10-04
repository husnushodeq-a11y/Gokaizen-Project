// utils/motmConfig.js
// Seluruh pengaturan Member of the Month dikumpulkan di satu berkas.
// Untuk mengganti emoji, warna, atau aturan poin, cukup ubah di sini.

let botConfig = {};
try {
    botConfig = require('../config.json');
} catch {
    botConfig = {};
}

// ============================================================
//  EMOJI
// ============================================================
//
// Cara mengganti: ketik \:namaemoji: di Discord untuk melihat bentuk mentahnya,
// lalu tempel hasilnya di sini. Emoji animasi memakai awalan <a: bukan <:
//
// Emoji harus berasal dari server yang bot ikut di dalamnya. Bila emoji berada
// di server lain, bot juga memerlukan izin Use External Emojis.

const EMOJI = {
    // Peringkat 1 sampai 10
    rank: {
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
    },

    // Penanda umum
    trophy: '<:piala:1532795152572092456>',      // judul juara dan pengumuman
    arrow: '<a:arrow:1532795180770660382>',      // penanda butir daftar

    // Kategori
    voice: '<:voice:1533011140672622632>',       // kategori suara
    chat: '<:chat:1533011166555803712>',         // kategori obrolan

    // Penanda pada papan peringkat
    live: '<:live:1533011193478774794>',         // papan diperbarui otomatis
    clock: '<:clock:1533011216765681664>',       // waktu pembaruan terakhir
    up: '<:up:1533011246205374464>',             // peringkat naik
    down: '<:down:1533011274433302621>',         // peringkat turun
    same: '<:same:1533011303495372900>',         // peringkat tetap
    crown: '<:crown:1533011500610883726>',       // pemenang
    medal: '<:medali:1533011104731627671>',      // riwayat pemenang
    calendar: '<:calendar:1533011556214898790>', // periode
    chart: '<:chart:1533011589001908317>',       // ringkasan statistik
};

// Mengambil penanda peringkat. Di atas 10 memakai angka biasa.
function rankEmoji(pos) {
    return EMOJI.rank[pos] || `**${pos}.**`;
}

// ============================================================
//  ATURAN POIN
// ============================================================

const POIN = {
    // ---------- SUARA ----------
    // Poin diberikan berkala selama anggota benar benar berada di voice
    VOICE_PER_MENIT: Number(botConfig.WARGA_VOICE_POINTS_PER_5MIN || 1),
    VOICE_SETIAP_MENIT: 5,

    // Batas harian. Tanpa batas, satu orang yang membiarkan voice menyala
    // sepanjang hari akan selalu menempati peringkat teratas.
    // 120 poin setara sepuluh jam dalam sehari.
    VOICE_BATAS_HARIAN: Number(botConfig.MOTM_VOICE_DAILY_LIMIT || 120),

    // Jumlah orang minimal di dalam satu voice channel agar poin dihitung.
    // Sendirian di voice tidak dianggap kegiatan bersama.
    VOICE_MIN_ORANG: Number(botConfig.MOTM_VOICE_MIN_MEMBERS || 2),

    // Anggota yang mematikan suara masuk dianggap tidak sedang menyimak
    VOICE_ABAIKAN_DEAFEN: botConfig.MOTM_VOICE_IGNORE_DEAFEN !== false,

    // Anggota yang mematikan mikrofon sendiri tetap dihitung, karena banyak
    // yang menyimak tanpa berbicara. Ubah menjadi true bila ingin lebih ketat.
    VOICE_ABAIKAN_MUTE: botConfig.MOTM_VOICE_IGNORE_MUTE === true,

    // ---------- OBROLAN ----------
    CHAT_PER_PESAN: Number(botConfig.WARGA_CHAT_POINTS_PER_MESSAGE || 2),
    CHAT_BATAS_HARIAN: Number(botConfig.WARGA_CHAT_DAILY_LIMIT_POINTS || 200),

    // Jeda antar pesan yang dihitung, dalam detik.
    // Menahan pengumpulan poin dengan mengirim banyak pesan sekaligus.
    CHAT_JEDA_DETIK: Number(botConfig.MOTM_CHAT_COOLDOWN || 8),

    // Pesan yang terlalu pendek tidak dihitung
    CHAT_MIN_HURUF: Number(botConfig.MOTM_CHAT_MIN_LENGTH || 3),

    // ---------- AMBANG PESERTA ----------
    // Nilai minimal agar seseorang masuk hitungan Member of the Month.
    // Disesuaikan untuk server besar agar daftar peserta berisi yang benar
    // benar aktif, bukan yang sekadar lewat.
    MINIMAL_VOICE: Number(botConfig.MOTM_MIN_VOICE || 60),
    MINIMAL_CHAT: Number(botConfig.MOTM_MIN_CHAT || 40),
};

// ============================================================
//  CHANNEL DAN ROLE
// ============================================================

// ID server utama
const GUILD_ID = botConfig.GUILD_ID || '';

const CHANNEL = {
    // Channel yang dihitung untuk poin obrolan
    GENERAL: botConfig.WARGA_GENERAL_CHANNEL_ID || '1428279995880570961',

    // Papan harian. Setiap pergantian hari dikirim pesan baru.
    HARIAN: botConfig.MOTM_TODAY_CHANNEL_ID || '1533006197773307964',

    // Papan bulanan. Pesannya tetap, isinya diperbarui setiap hari.
    BULANAN: botConfig.MOTM_BOARD_CHANNEL_ID || '1533006406549246014',

    // Pengumuman pemenang bulanan. Bila kosong, memakai channel bulanan.
    PENGUMUMAN: botConfig.MOTM_ANNOUNCE_CHANNEL_ID || '',
};

const ROLE = {
    // Role penghargaan bagi tiga peringkat teratas pada masing-masing kategori.
    // Diberikan setelah bulan berakhir dan dicabut ketika pemenang baru terpilih.
    JUARA: botConfig.MOTM_ROLE_WINNER || '1422554387393286187',
};

// ============================================================
//  TAMPILAN
// ============================================================

const WARNA = {
    UTAMA: 0xD31007,      // merah GO KAIZEN
    VOICE: 0xE8B923,      // aksen kategori suara
    CHAT: 0x2EA0F0,       // aksen kategori obrolan
    SUKSES: 0x57F287,
    PERINGATAN: 0xED4245,
};

// Berkas logo yang dipakai pada banner
const LOGO_URL = botConfig.MOTM_LOGO_URL ||
    'https://cdn.discordapp.com/attachments/1504624138118234234/1532931525262184579/914c863d32d00b2b33d8dcf1ab147759-1.png?ex=6a6ea53c&is=6a6d53bc&hm=d6b6c5c720e51c536ece057405cb63d8eb07e8830e0ed673f1f3bc8e5ac43e99&';

const BULAN = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// Jumlah peringkat yang ditampilkan
const TAMPIL = {
    EMBED: 10,        // pada papan peringkat
    KANVAS: 3,        // pada gambar banner
    LANJUTAN: 30,     // batas atas saat tombol peringkat lanjutan ditekan
    RIWAYAT: 12,      // daftar pemenang bulan sebelumnya
};

// Selang pembaruan papan harian, dalam milidetik
const PAPAN_INTERVAL = Number(botConfig.MOTM_BOARD_INTERVAL || 5 * 60 * 1000);

// Berapa hari catatan harian disimpan sebelum dibersihkan.
// Menjaga ukuran berkas data tetap wajar.
const SIMPAN_HARIAN = Number(botConfig.MOTM_KEEP_DAYS || 45);

module.exports = {
    GUILD_ID,
    EMOJI,
    rankEmoji,
    POIN,
    CHANNEL,
    ROLE,
    WARNA,
    LOGO_URL,
    BULAN,
    TAMPIL,
    PAPAN_INTERVAL,
    SIMPAN_HARIAN,
};
