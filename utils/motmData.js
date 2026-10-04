// utils/motmData.js
// Penyimpanan dan perhitungan poin untuk Member of the Month.
//
// Berkas data berukuran besar karena memuat puluhan ribu anggota. Versi lama
// menulis ulang seluruh berkas secara sinkron setiap kali ada satu pesan masuk,
// sehingga bot berhenti merespons selama proses penulisan berlangsung.
//
// Di sini penulisan dikumpulkan lebih dulu, dijalankan berkala tanpa memblokir,
// dan hanya dilakukan bila memang ada perubahan.

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const { POIN, SIMPAN_HARIAN } = require('./motmConfig');

const DATA_FILE = path.join(__dirname, '..', 'data', 'warga_data.json');
const TEMP_FILE = DATA_FILE + '.tmp';

// Selang penulisan ke disk
const SIMPAN_INTERVAL = 30 * 1000;

// ============================================================
//  PEMUATAN
// ============================================================

function muat() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const isi = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            return {
                users: isi.users || {},
                boards: isi.boards || {},
                winners: isi.winners || {},
                liveMessages: isi.liveMessages || [],
            };
        }
    } catch (err) {
        console.error('[MOTM] gagal membaca warga_data.json:', err.message);
    }
    return { users: {}, boards: {}, winners: {}, liveMessages: [] };
}

const db = muat();

let berubah = false;
let sedangMenulis = false;

const tandaiBerubah = () => { berubah = true; };

// Penulisan memakai berkas sementara lalu diganti namanya, sehingga berkas asli
// tidak pernah dalam keadaan setengah tertulis bila proses berhenti mendadak.
async function simpanKeDisk() {
    if (!berubah || sedangMenulis) return;

    sedangMenulis = true;
    berubah = false;

    try {
        await fsp.mkdir(path.dirname(DATA_FILE), { recursive: true });
        await fsp.writeFile(TEMP_FILE, JSON.stringify(db));
        await fsp.rename(TEMP_FILE, DATA_FILE);
    } catch (err) {
        berubah = true; // dicoba lagi pada giliran berikutnya
        console.error('[MOTM] gagal menyimpan data:', err.message);
    } finally {
        sedangMenulis = false;
    }
}

// Dipakai saat bot dimatikan, agar perubahan terakhir tidak hilang.
function simpanSegera() {
    if (!berubah) return;
    try {
        fs.writeFileSync(TEMP_FILE, JSON.stringify(db));
        fs.renameSync(TEMP_FILE, DATA_FILE);
        berubah = false;
    } catch (err) {
        console.error('[MOTM] gagal menyimpan data saat penutupan:', err.message);
    }
}

let penyimpanTimer = null;

function mulaiPenyimpan() {
    if (penyimpanTimer) return;
    penyimpanTimer = setInterval(() => { simpanKeDisk().catch(() => {}); }, SIMPAN_INTERVAL);
    if (typeof penyimpanTimer.unref === 'function') penyimpanTimer.unref();

    for (const sinyal of ['SIGINT', 'SIGTERM']) {
        process.once(sinyal, () => { simpanSegera(); process.exit(0); });
    }
    process.once('beforeExit', simpanSegera);
}

// ============================================================
//  KUNCI WAKTU
// ============================================================

function kunciHari(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function kunciBulan(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const kunciTahun = (d = new Date()) => String(d.getFullYear());

// Kunci bulan sebelumnya, dipakai saat menentukan pemenang
function kunciBulanLalu(d = new Date()) {
    const lalu = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return kunciBulan(lalu);
}

// ============================================================
//  ANGGOTA
// ============================================================

function ambilUser(userId) {
    let u = db.users[userId];
    if (!u) {
        u = db.users[userId] = {
            id: userId,
            username: '',
            monthlyChat: {},
            monthlyVoice: {},
            yearlyChat: {},
            yearlyVoice: {},
            dailyChatPoints: {},
            dailyVoice: {},
        };
    }
    // berkas lama belum memiliki catatan suara harian
    if (!u.dailyVoice) u.dailyVoice = {};
    if (!u.dailyChatPoints) u.dailyChatPoints = {};
    return u;
}

function setNama(userId, nama) {
    if (!nama) return;
    const u = ambilUser(userId);
    if (u.username !== nama) {
        u.username = nama;
        tandaiBerubah();
    }
}

// ============================================================
//  PENAMBAHAN POIN
// ============================================================

function tambahChat(userId, nama) {
    const u = ambilUser(userId);
    if (nama && u.username !== nama) u.username = nama;

    const dk = kunciHari();
    const mk = kunciBulan();
    const yk = kunciTahun();

    const hariIni = u.dailyChatPoints[dk] || 0;
    if (hariIni >= POIN.CHAT_BATAS_HARIAN) return 0;

    const tambah = Math.min(POIN.CHAT_PER_PESAN, POIN.CHAT_BATAS_HARIAN - hariIni);

    u.dailyChatPoints[dk] = hariIni + tambah;
    u.monthlyChat[mk] = (u.monthlyChat[mk] || 0) + tambah;
    u.yearlyChat[yk] = (u.yearlyChat[yk] || 0) + tambah;

    tandaiBerubah();
    return tambah;
}

function tambahVoice(userId, poin, nama) {
    if (!poin || poin <= 0) return 0;

    const u = ambilUser(userId);
    if (nama && u.username !== nama) u.username = nama;

    const dk = kunciHari();
    const mk = kunciBulan();
    const yk = kunciTahun();

    // Batas harian menahan pengumpulan poin dengan membiarkan voice menyala
    // sepanjang hari. Tanpa ini, peringkat hanya diisi yang paling lama diam.
    const hariIni = u.dailyVoice[dk] || 0;
    if (POIN.VOICE_BATAS_HARIAN > 0 && hariIni >= POIN.VOICE_BATAS_HARIAN) return 0;

    const tambah = POIN.VOICE_BATAS_HARIAN > 0
        ? Math.min(poin, POIN.VOICE_BATAS_HARIAN - hariIni)
        : poin;

    u.dailyVoice[dk] = hariIni + tambah;
    u.monthlyVoice[mk] = (u.monthlyVoice[mk] || 0) + tambah;
    u.yearlyVoice[yk] = (u.yearlyVoice[yk] || 0) + tambah;

    tandaiBerubah();
    return tambah;
}

// ============================================================
//  PERINGKAT
// ============================================================

// Menghitung berapa hari seseorang tercatat aktif dalam satu bulan.
// Dipakai sebagai pemecah seri, karena batas harian membuat banyak orang
// berakhir dengan poin yang sama persis.
function hariAktif(user, bidangHarian, awalanBulan) {
    const catatan = user[bidangHarian];
    if (!catatan) return 0;

    let jumlah = 0;
    for (const [kunci, nilai] of Object.entries(catatan)) {
        if (nilai > 0 && kunci.startsWith(awalanBulan)) jumlah += 1;
    }
    return jumlah;
}

// Hari pertama seseorang aktif pada bulan tersebut
function hariPertama(user, bidangHarian, awalanBulan) {
    const catatan = user[bidangHarian];
    if (!catatan) return '9999-99-99';

    let paling = '9999-99-99';
    for (const [kunci, nilai] of Object.entries(catatan)) {
        if (nilai > 0 && kunci.startsWith(awalanBulan) && kunci < paling) paling = kunci;
    }
    return paling;
}

// periode: 'harian' | 'bulanan'
// kategori: 'voice' | 'chat'
//
// Urutan ditentukan berlapis. Poin lebih dulu, lalu beberapa pemecah seri yang
// mencerminkan keaktifan, bukan sekadar urutan pendaftaran akun.
function ambilPeringkat(periode, kategori, batas = 30) {
    const kunci = periode === 'harian' ? kunciHari() : kunciBulan();
    const bulanIni = kunciBulan();

    const bidangHarian = kategori === 'voice' ? 'dailyVoice' : 'dailyChatPoints';
    const bidangLainHarian = kategori === 'voice' ? 'dailyChatPoints' : 'dailyVoice';
    const bidangBulanan = kategori === 'voice' ? 'monthlyVoice' : 'monthlyChat';
    const bidangLainBulanan = kategori === 'voice' ? 'monthlyChat' : 'monthlyVoice';

    const bidang = periode === 'harian' ? bidangHarian : bidangBulanan;
    const bidangLain = periode === 'harian' ? bidangLainHarian : bidangLainBulanan;

    // Ambang minimal hanya diterapkan pada peringkat bulanan, karena poin harian
    // secara alami jauh lebih kecil.
    const minimal = periode === 'bulanan'
        ? (kategori === 'voice' ? POIN.MINIMAL_VOICE : POIN.MINIMAL_CHAT)
        : 1;

    const hasil = [];
    for (const u of Object.values(db.users)) {
        const poin = (u[bidang] && u[bidang][kunci]) || 0;
        if (poin < minimal) continue;

        hasil.push({
            id: u.id,
            nama: u.username || u.id,
            poin,
            // pemecah seri
            hariAktif: periode === 'bulanan' ? hariAktif(u, bidangHarian, bulanIni) : 1,
            poinLain: (u[bidangLain] && u[bidangLain][kunci]) || 0,
            mulai: periode === 'bulanan' ? hariPertama(u, bidangHarian, bulanIni) : '',
        });
    }

    hasil.sort((a, b) =>
        (b.poin - a.poin) ||              // poin terbanyak
        (b.hariAktif - a.hariAktif) ||    // paling konsisten sepanjang bulan
        (b.poinLain - a.poinLain) ||      // paling aktif secara keseluruhan
        a.mulai.localeCompare(b.mulai) || // paling dulu mulai aktif
        a.id.localeCompare(b.id)          // penentu terakhir agar urutan tetap
    );

    return hasil.slice(0, batas);
}

// Menandai peringkat yang poinnya sama persis, agar bisa ditampilkan apa adanya
function tandaiSeri(daftar) {
    return daftar.map((u, i) => ({
        ...u,
        seri: (i > 0 && daftar[i - 1].poin === u.poin) ||
              (i < daftar.length - 1 && daftar[i + 1].poin === u.poin),
    }));
}

// Dua peserta dianggap benar benar seri bila seluruh ukuran penilaian sama.
// Bila salah satu berbeda, urutannya sudah dapat ditentukan secara adil.
function benarBenarSeri(a, b) {
    return a.poin === b.poin &&
        a.hariAktif === b.hariAktif &&
        a.poinLain === b.poinLain &&
        a.mulai === b.mulai;
}

// Mengambil pemenang sejumlah tertentu, ditambah siapa pun yang tidak dapat
// dibedakan dari peringkat terakhir yang masuk.
//
// Bila lima orang sama persis pada seluruh ukuran, memilih tiga di antaranya
// berdasarkan urutan pendaftaran akun tidak adil. Dalam keadaan itu kelimanya
// diperlakukan sebagai pemenang bersama.
function ambilPemenangSeri(periode, kategori, jumlah = 3, batasAman = 10) {
    const semua = ambilPeringkat(periode, kategori, Math.max(jumlah * 5, 50));
    if (semua.length <= jumlah) return { pemenang: semua, adaSeri: false, terpotong: false };

    const pemenang = semua.slice(0, jumlah);
    const acuan = pemenang[pemenang.length - 1];

    let i = jumlah;
    while (i < semua.length && benarBenarSeri(acuan, semua[i])) {
        pemenang.push(semua[i]);
        i += 1;
    }

    const adaSeri = pemenang.length > jumlah;

    // Pengaman agar penghargaan tidak kehilangan arti bila serinya sangat banyak.
    // Bila sampai terpotong, staff diberi tahu agar bisa memutuskan sendiri.
    const terpotong = pemenang.length > batasAman;

    return {
        pemenang: terpotong ? pemenang.slice(0, batasAman) : pemenang,
        adaSeri,
        terpotong,
        jumlahSeri: pemenang.length,
    };
}

// Peringkat seorang anggota beserta poinnya
function posisiUser(userId, periode, kategori) {
    const semua = ambilPeringkat(periode, kategori, Number.MAX_SAFE_INTEGER);
    const idx = semua.findIndex(u => u.id === userId);
    return idx === -1
        ? { posisi: null, poin: 0, total: semua.length }
        : { posisi: idx + 1, poin: semua[idx].poin, total: semua.length };
}

// Ringkasan untuk keterangan pada papan
function ringkasan(periode, kategori) {
    const semua = ambilPeringkat(periode, kategori, Number.MAX_SAFE_INTEGER);
    const total = semua.reduce((a, u) => a + u.poin, 0);
    return { peserta: semua.length, totalPoin: total };
}

// ============================================================
//  CATATAN PAPAN
// ============================================================
//
// boards menyimpan lokasi pesan papan agar bisa diperbarui, dan menandai
// hari terakhir papan harian dibuat sehingga pesan baru hanya dikirim sekali
// setiap pergantian hari.

function ambilPapan(nama) {
    return db.boards[nama] || null;
}

function setPapan(nama, data) {
    db.boards[nama] = data;
    tandaiBerubah();
}

function hapusPapan(nama) {
    if (db.boards[nama]) {
        delete db.boards[nama];
        tandaiBerubah();
    }
}

// ============================================================
//  PEMENANG BULANAN
// ============================================================

function ambilPemenang(bulanKey) {
    return db.winners[bulanKey] || null;
}

function simpanPemenang(bulanKey, data) {
    db.winners[bulanKey] = { ...data, at: Date.now() };
    tandaiBerubah();
}

function daftarPemenang(batas = 12) {
    return Object.entries(db.winners)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, batas)
        .map(([bulan, data]) => ({ bulan, ...data }));
}

// ============================================================
//  PEMBERSIHAN
// ============================================================

// Catatan harian yang sudah lama dibuang agar berkas tidak terus membesar.
// Dijalankan sekali saat bot menyala dan setiap pergantian hari.
function bersihkanHarian() {
    const batas = new Date();
    batas.setDate(batas.getDate() - SIMPAN_HARIAN);
    const batasKunci = kunciHari(batas);

    let dibuang = 0;
    for (const u of Object.values(db.users)) {
        for (const bidang of ['dailyChatPoints', 'dailyVoice']) {
            const catatan = u[bidang];
            if (!catatan) continue;
            for (const k of Object.keys(catatan)) {
                if (k < batasKunci) {
                    delete catatan[k];
                    dibuang += 1;
                }
            }
        }
    }

    if (dibuang) {
        tandaiBerubah();
        console.log(`[MOTM] membersihkan ${dibuang} catatan harian lama`);
    }
    return dibuang;
}

// Menyamakan nama anggota dengan nama tampilan terkini
async function segarkanNama(guild) {
    if (!guild) return 0;
    const anggota = await guild.members.fetch().catch(() => null);
    if (!anggota) return 0;

    let diubah = 0;
    for (const [id, m] of anggota) {
        const u = db.users[id];
        if (u && u.username !== m.displayName) {
            u.username = m.displayName;
            diubah += 1;
        }
    }

    if (diubah) tandaiBerubah();
    return diubah;
}

// ============================================================
//  PENYESUAIAN MANUAL
// ============================================================
//
// Dipakai staff untuk menambah, mengurangi, atau menetapkan poin.
// Seluruh penyesuaian dicatat agar bisa ditelusuri bila ada keberatan.

function bidangPeriode(periode, kategori) {
    if (periode === 'harian') {
        return kategori === 'voice' ? 'dailyVoice' : 'dailyChatPoints';
    }
    return kategori === 'voice' ? 'monthlyVoice' : 'monthlyChat';
}

function kunciPeriode(periode) {
    return periode === 'harian' ? kunciHari() : kunciBulan();
}

function bacaPoin(userId, periode, kategori) {
    const u = db.users[userId];
    if (!u) return 0;
    const bidang = bidangPeriode(periode, kategori);
    return (u[bidang] && u[bidang][kunciPeriode(periode)]) || 0;
}

// Menambah atau mengurangi poin. Nilai negatif berarti pengurangan.
// Poin tidak pernah turun di bawah nol.
function ubahPoin(userId, kategori, jumlah, opsi = {}) {
    const u = ambilUser(userId);
    if (opsi.nama) u.username = opsi.nama;

    const dk = kunciHari();
    const mk = kunciBulan();
    const yk = kunciTahun();

    const bidangHarian = kategori === 'voice' ? 'dailyVoice' : 'dailyChatPoints';
    const bidangBulanan = kategori === 'voice' ? 'monthlyVoice' : 'monthlyChat';
    const bidangTahunan = kategori === 'voice' ? 'yearlyVoice' : 'yearlyChat';

    const hasil = {};

    // Bonus hanya menyentuh catatan bulanan, karena sifatnya penghargaan
    // atas kegiatan tertentu, bukan keaktifan hari itu.
    if (!opsi.hanyaBulanan) {
        const sebelum = u[bidangHarian][dk] || 0;
        u[bidangHarian][dk] = Math.max(0, sebelum + jumlah);
        hasil.harian = u[bidangHarian][dk];
    }

    const sebelumBulan = u[bidangBulanan][mk] || 0;
    u[bidangBulanan][mk] = Math.max(0, sebelumBulan + jumlah);
    hasil.bulanan = u[bidangBulanan][mk];

    const sebelumTahun = u[bidangTahunan][yk] || 0;
    u[bidangTahunan][yk] = Math.max(0, sebelumTahun + jumlah);
    hasil.tahunan = u[bidangTahunan][yk];

    catatPenyesuaian(userId, {
        kategori,
        jumlah,
        jenis: opsi.jenis || (jumlah >= 0 ? 'tambah' : 'kurang'),
        oleh: opsi.oleh || null,
        alasan: opsi.alasan || null,
    });

    tandaiBerubah();
    return hasil;
}

// Menetapkan poin bulanan ke nilai tertentu
function setPoinBulanan(userId, kategori, nilai, opsi = {}) {
    const u = ambilUser(userId);
    if (opsi.nama) u.username = opsi.nama;

    const mk = kunciBulan();
    const bidang = kategori === 'voice' ? 'monthlyVoice' : 'monthlyChat';
    const sebelum = u[bidang][mk] || 0;

    u[bidang][mk] = Math.max(0, nilai);

    catatPenyesuaian(userId, {
        kategori,
        jumlah: u[bidang][mk] - sebelum,
        jenis: 'tetapkan',
        oleh: opsi.oleh || null,
        alasan: opsi.alasan || null,
    });

    tandaiBerubah();
    return { sebelum, sesudah: u[bidang][mk] };
}

// Mengosongkan poin bulan berjalan pada kedua kategori
function resetBulanan(userId, opsi = {}) {
    const u = ambilUser(userId);
    const mk = kunciBulan();
    const dk = kunciHari();

    const sebelum = {
        voice: u.monthlyVoice[mk] || 0,
        chat: u.monthlyChat[mk] || 0,
    };

    u.monthlyVoice[mk] = 0;
    u.monthlyChat[mk] = 0;
    u.dailyVoice[dk] = 0;
    u.dailyChatPoints[dk] = 0;

    catatPenyesuaian(userId, {
        kategori: 'semua',
        jumlah: -(sebelum.voice + sebelum.chat),
        jenis: 'reset',
        oleh: opsi.oleh || null,
        alasan: opsi.alasan || null,
    });

    tandaiBerubah();
    return sebelum;
}

// Membuat salinan berkas data sebelum tindakan yang tidak dapat dibatalkan
function buatCadangan() {
    try {
        if (!fs.existsSync(DATA_FILE)) return null;
        const stempel = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const tujuan = `${DATA_FILE}.cadangan-${stempel}`;
        fs.copyFileSync(DATA_FILE, tujuan);
        return tujuan;
    } catch (err) {
        console.error('[MOTM] gagal membuat cadangan:', err.message);
        return null;
    }
}

// Mengosongkan seluruh poin semua anggota.
// Nama anggota tetap disimpan agar papan tidak kehilangan keterangan,
// dan riwayat pemenang tetap ada kecuali diminta ikut dihapus.
function resetSemuaPoin(opsi = {}) {
    let anggota = 0;
    let totalVoice = 0;
    let totalChat = 0;

    const jumlahkan = obj => Object.values(obj || {}).reduce((a, b) => a + (Number(b) || 0), 0);

    for (const u of Object.values(db.users)) {
        totalVoice += jumlahkan(u.monthlyVoice);
        totalChat += jumlahkan(u.monthlyChat);

        u.monthlyVoice = {};
        u.monthlyChat = {};
        u.yearlyVoice = {};
        u.yearlyChat = {};
        u.dailyVoice = {};
        u.dailyChatPoints = {};
        delete u.adjustments;

        anggota += 1;
    }

    const riwayatDihapus = Boolean(opsi.hapusRiwayat);
    const jumlahRiwayat = Object.keys(db.winners || {}).length;
    if (riwayatDihapus) db.winners = {};

    // catatan papan dikosongkan agar dipasang ulang dalam keadaan bersih
    db.boards = {};

    tandaiBerubah();
    simpanSegera();

    return { anggota, totalVoice, totalChat, riwayatDihapus, jumlahRiwayat };
}

// Riwayat penyesuaian, dibatasi agar berkas tidak membengkak
const RIWAYAT_MAKS = 20;

function catatPenyesuaian(userId, data) {
    const u = ambilUser(userId);
    if (!Array.isArray(u.adjustments)) u.adjustments = [];
    u.adjustments.push({ ...data, at: Date.now() });
    if (u.adjustments.length > RIWAYAT_MAKS) {
        u.adjustments = u.adjustments.slice(-RIWAYAT_MAKS);
    }
}

function riwayatPenyesuaian(userId, batas = 5) {
    const u = db.users[userId];
    if (!u || !Array.isArray(u.adjustments)) return [];
    return [...u.adjustments].reverse().slice(0, batas);
}

module.exports = {
    db,
    mulaiPenyimpan,
    simpanKeDisk,
    simpanSegera,
    tandaiBerubah,

    kunciHari,
    kunciBulan,
    kunciTahun,
    kunciBulanLalu,

    ambilUser,
    setNama,
    tambahChat,
    tambahVoice,

    ambilPeringkat,
    tandaiSeri,
    ambilPemenangSeri,
    benarBenarSeri,
    posisiUser,
    ringkasan,

    bacaPoin,
    ubahPoin,
    setPoinBulanan,
    resetBulanan,
    riwayatPenyesuaian,

    ambilPapan,
    setPapan,
    hapusPapan,

    ambilPemenang,
    simpanPemenang,
    daftarPemenang,

    bersihkanHarian,
    segarkanNama,
    buatCadangan,
    resetSemuaPoin,
};
