// utils/gosmartConfig.js
// Seluruh pengaturan lomba GO SMART dikumpulkan di satu berkas.
// Untuk mengubah jumlah soal, lama waktu, atau nilai, cukup ubah di sini.

let botConfig = {};
try {
    botConfig = require('../config.json');
} catch {
    botConfig = {};
}

// ============================================================
//  BABAK
// ============================================================
//
// jumlahSoal : berapa soal yang dimainkan pada babak tersebut
// detik      : waktu menjawab setiap soal
// lolos      : berapa peserta teratas yang maju ke babak berikutnya
//              bernilai 0 berarti babak terakhir

const BABAK = {
    penyisihan: {
        nama: 'PENYISIHAN',
        urutan: 1,
        jumlahSoal: Number(botConfig.GOSMART_SOAL_PENYISIHAN || 20),
        detik: Number(botConfig.GOSMART_DETIK_PENYISIHAN || 10),
        lolos: Number(botConfig.GOSMART_LOLOS_PENYISIHAN || 20),
        berikutnya: 'semifinal',
        keterangan: 'Terbuka untuk seluruh anggota',
    },
    semifinal: {
        nama: 'SEMIFINAL',
        urutan: 2,
        jumlahSoal: Number(botConfig.GOSMART_SOAL_SEMIFINAL || 15),
        detik: Number(botConfig.GOSMART_DETIK_SEMIFINAL || 8),
        lolos: Number(botConfig.GOSMART_LOLOS_SEMIFINAL || 8),
        berikutnya: 'final',
        keterangan: 'Hanya peserta yang lolos penyisihan',
    },
    final: {
        nama: 'FINAL',
        urutan: 3,
        jumlahSoal: Number(botConfig.GOSMART_SOAL_FINAL || 12),
        detik: Number(botConfig.GOSMART_DETIK_FINAL || 6),
        lolos: 0,
        berikutnya: null,
        keterangan: 'Perebutan juara',
    },
};

const URUTAN_BABAK = ['penyisihan', 'semifinal', 'final'];

// ============================================================
//  NILAI
// ============================================================

const NILAI = {
    // Nilai dasar untuk jawaban benar
    BENAR: Number(botConfig.GOSMART_NILAI_BENAR || 100),

    // Bonus kecepatan, dikalikan sisa detik yang tersisa
    BONUS_PER_DETIK: Number(botConfig.GOSMART_BONUS_DETIK || 10),

    // Nilai untuk jawaban salah. Dibiarkan nol agar tidak menghukum keberanian,
    // sebab penguncian jawaban sudah cukup menahan tebakan asal.
    SALAH: Number(botConfig.GOSMART_NILAI_SALAH || 0),
};

// ============================================================
//  TAMPILAN
// ============================================================

const WARNA = {
    UTAMA: 0xD31007,
    SOAL: 0xE8B923,
    BENAR: 0x57F287,
    SALAH: 0xED4245,
    PAPAN: 0x2EA0F0,
    JUARA: 0xFFD700,
};

const EMOJI = {
    trophy: '<:piala:1532795152572092456>',
    arrow: '<a:arrow:1532795180770660382>',
    clock: '<:clock:1533011216765681664>',
    chart: '<:chart:1533011589001908317>',
    crown: '<:crown:1533011500610883726>',
    medal: '<:medali:1533011104731627671>',
    calendar: '<:calendar:1533011556214898790>',
    live: '<:live:1533011193478774794>',
    up: '<:up:1533011246205374464>',
    down: '<:down:1533011274433302621>',

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
};

const nomorPeringkat = i => EMOJI.rank[i] || `**${i}.**`;

// Label pilihan jawaban
const LABEL_PILIHAN = ['A', 'B', 'C', 'D'];

// ============================================================
//  PENGATURAN LAIN
// ============================================================

// Role yang boleh menjalankan lomba selain moderator
const ROLE_PENGELOLA = botConfig.GOSMART_ROLE_PENGELOLA || [
    '1460793400616812694',
];

// Jumlah peserta yang ditampilkan pada papan nilai
const TAMPIL_PAPAN = Number(botConfig.GOSMART_TAMPIL_PAPAN || 10);

// Berapa lama hasil soal ditampilkan sebelum tombol lanjut muncul
const JEDA_HASIL = Number(botConfig.GOSMART_JEDA_HASIL || 2000);

// Selang pembaruan hitungan mundur pada pesan soal
const SELANG_HITUNG = Number(botConfig.GOSMART_SELANG_HITUNG || 2000);

// Batas peserta pada babak penyisihan
const BATAS_PESERTA = Number(botConfig.GOSMART_BATAS_PESERTA || 500);

module.exports = {
    BABAK,
    URUTAN_BABAK,
    NILAI,
    WARNA,
    EMOJI,
    nomorPeringkat,
    LABEL_PILIHAN,
    ROLE_PENGELOLA,
    TAMPIL_PAPAN,
    JEDA_HASIL,
    SELANG_HITUNG,
    BATAS_PESERTA,
};
