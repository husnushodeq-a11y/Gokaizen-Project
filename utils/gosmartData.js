// utils/gosmartData.js
// Penyimpanan keadaan lomba GO SMART.
//
// Seluruh keadaan disimpan ke berkas, sehingga nilai peserta tidak hilang
// bila bot sempat dimatikan di tengah acara. Yang hilang hanya soal yang
// sedang berjalan, dan itu dapat diulang oleh pengelola.

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'gosmartData.json');

function muat() {
    try {
        if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        console.error('[GOSMART] gagal membaca gosmartData.json:', err.message);
    }
    return {};
}

const db = muat();

function simpan() {
    try {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (err) {
        console.error('[GOSMART] gagal menyimpan gosmartData.json:', err.message);
    }
}

// ============================================================
//  KEADAAN ACARA
// ============================================================
//
// status:
//   idle        belum ada acara
//   pendaftaran panel pendaftaran terbuka
//   siap        babak sudah disiapkan, menunggu soal pertama
//   soal        sebuah soal sedang berjalan
//   jeda        soal berakhir, menunggu perintah lanjut
//   selesai     seluruh babak selesai

function acara(guildId) {
    return db[guildId] || null;
}

function buatAcara(guildId, channelId, oleh) {
    db[guildId] = {
        guildId,
        channelId,
        oleh,
        dibuatAt: Date.now(),
        status: 'pendaftaran',
        babak: null,
        panelId: null,
        peserta: {},
        soalDipakai: [],
        daftarSoal: [],
        soalKe: 0,
        soalAktif: null,
        riwayatBabak: {},
    };
    simpan();
    return db[guildId];
}

function hapusAcara(guildId) {
    delete db[guildId];
    simpan();
}

const simpanAcara = () => simpan();

// ============================================================
//  PESERTA
// ============================================================

function daftarkan(a, userId, nama) {
    if (a.peserta[userId]) return { baru: false, peserta: a.peserta[userId] };

    a.peserta[userId] = {
        id: userId,
        nama: nama || null,
        nilai: 0,
        benar: 0,
        salah: 0,
        tidakJawab: 0,
        totalWaktu: 0,
        aktif: true,
    };
    simpan();
    return { baru: true, peserta: a.peserta[userId] };
}

function batalkan(a, userId) {
    if (!a.peserta[userId]) return false;
    delete a.peserta[userId];
    simpan();
    return true;
}

// Peserta yang masih berhak bermain pada babak berjalan
function pesertaAktif(a) {
    return Object.values(a.peserta).filter(p => p.aktif);
}

// Peringkat berdasarkan nilai, lalu waktu tercepat bila seri
function peringkat(a, hanyaAktif = true) {
    const daftar = hanyaAktif ? pesertaAktif(a) : Object.values(a.peserta);
    return [...daftar].sort((x, y) =>
        (y.nilai - x.nilai) ||
        (y.benar - x.benar) ||
        (x.totalWaktu - y.totalWaktu) ||
        x.id.localeCompare(y.id)
    );
}

function posisiPeserta(a, userId) {
    const urut = peringkat(a);
    const i = urut.findIndex(p => p.id === userId);
    return i === -1 ? null : { posisi: i + 1, dari: urut.length, peserta: urut[i] };
}

// ============================================================
//  BABAK
// ============================================================

function mulaiBabak(a, namaBabak, daftarSoal) {
    // catat hasil babak sebelumnya sebelum ditimpa
    if (a.babak) {
        a.riwayatBabak[a.babak] = peringkat(a).map(p => ({
            id: p.id, nama: p.nama, nilai: p.nilai, benar: p.benar, salah: p.salah,
        }));
    }

    a.babak = namaBabak;
    a.daftarSoal = daftarSoal;
    a.soalKe = 0;
    a.soalAktif = null;
    a.status = 'siap';

    // nilai dimulai ulang setiap babak agar setiap babak berdiri sendiri
    for (const p of Object.values(a.peserta)) {
        if (!p.aktif) continue;
        p.nilai = 0;
        p.benar = 0;
        p.salah = 0;
        p.tidakJawab = 0;
        p.totalWaktu = 0;
    }

    for (const s of daftarSoal) {
        if (!a.soalDipakai.includes(s.t)) a.soalDipakai.push(s.t);
    }

    simpan();
}

// Menyisakan sejumlah peserta teratas, sisanya dinonaktifkan
function saring(a, jumlah) {
    const urut = peringkat(a);
    const lolos = urut.slice(0, jumlah);
    const idLolos = new Set(lolos.map(p => p.id));

    for (const p of Object.values(a.peserta)) {
        if (p.aktif && !idLolos.has(p.id)) p.aktif = false;
    }

    simpan();
    return { lolos, gugur: urut.length - lolos.length };
}

// ============================================================
//  SOAL
// ============================================================

function mulaiSoal(a, pesanId) {
    const soal = a.daftarSoal[a.soalKe];
    if (!soal) return null;

    a.soalAktif = {
        ...soal,
        nomor: a.soalKe + 1,
        pesanId,
        mulaiAt: Date.now(),
        jawaban: {},
        selesai: false,
    };
    a.status = 'soal';
    simpan();
    return a.soalAktif;
}

// Mencatat jawaban. Jawaban yang sudah masuk tidak dapat diubah.
function catatJawaban(a, userId, pilihan) {
    const s = a.soalAktif;
    if (!s || s.selesai) return { ok: false, alasan: 'tutup' };
    if (s.jawaban[userId]) return { ok: false, alasan: 'sudah' };

    const waktuMs = Date.now() - s.mulaiAt;
    s.jawaban[userId] = { pilihan, waktuMs };
    simpan();

    return { ok: true, waktuMs };
}

// Menutup soal dan menghitung nilai seluruh peserta
function tutupSoal(a, nilaiConfig, detik) {
    const s = a.soalAktif;
    if (!s || s.selesai) return null;

    s.selesai = true;
    s.selesaiAt = Date.now();

    const hasil = { benar: [], salah: [], tidakJawab: [] };
    const batasMs = detik * 1000;

    for (const p of pesertaAktif(a)) {
        const jawab = s.jawaban[p.id];

        if (!jawab) {
            p.tidakJawab += 1;
            hasil.tidakJawab.push(p);
            continue;
        }

        p.totalWaktu += jawab.waktuMs;

        if (jawab.pilihan === s.j) {
            const sisaDetik = Math.max(0, (batasMs - jawab.waktuMs) / 1000);
            const bonus = Math.round(sisaDetik * nilaiConfig.BONUS_PER_DETIK);
            const dapat = nilaiConfig.BENAR + bonus;

            p.nilai += dapat;
            p.benar += 1;
            hasil.benar.push({ peserta: p, waktuMs: jawab.waktuMs, bonus, dapat });
        } else {
            p.nilai += nilaiConfig.SALAH;
            p.salah += 1;
            hasil.salah.push({ peserta: p, waktuMs: jawab.waktuMs, pilihan: jawab.pilihan });
        }
    }

    hasil.benar.sort((x, y) => x.waktuMs - y.waktuMs);

    a.soalKe += 1;
    a.status = 'jeda';
    simpan();

    return hasil;
}

const adaSoalBerikutnya = a => a.soalKe < a.daftarSoal.length;

module.exports = {
    db,
    simpan: simpanAcara,
    acara,
    buatAcara,
    hapusAcara,

    daftarkan,
    batalkan,
    pesertaAktif,
    peringkat,
    posisiPeserta,

    mulaiBabak,
    saring,

    mulaiSoal,
    catatJawaban,
    tutupSoal,
    adaSoalBerikutnya,
};
