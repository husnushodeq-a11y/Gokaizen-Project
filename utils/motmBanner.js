// utils/motmBanner.js
// Membuat banner Member of the Month bertema retro merah memakai canvas.
//
// Tata letaknya sengaja dipisah pada objek TATA agar mudah diperiksa dan diubah.
// Setiap perubahan posisi diperiksa oleh periksaTata() supaya tidak ada elemen
// yang saling menimpa, seperti judul yang tertutup lingkaran juara.

const fs = require('fs');
const path = require('path');

const { LOGO_URL, BULAN, WARNA } = require('./motmConfig');

let Canvas = null;
try {
    Canvas = require('canvas');
} catch {
    console.warn('[MOTM] modul canvas tidak tersedia, banner dinonaktifkan.');
}

const LEBAR = 1600;
const TINGGI = 660;

// ============================================================
//  TATA LETAK
// ============================================================

const TATA = {
    logo: { cx: 152, cy: 112, r: 54 },
    judul: { y: 104, ukuran: 56 },
    kategori: { y: 152, ukuran: 24 },
    garis: { y: 182, lebar: 600 },

    juara1: { cx: 800, cy: 382, r: 102, badge: 480, nama: 560, poin: 600 },
    juara2: { cx: 415, cy: 408, r: 78, badge: 482, nama: 560, poin: 596 },
    juara3: { cx: 1185, cy: 408, r: 78, badge: 482, nama: 560, poin: 596 },

    horizon: 620,
};

// Memastikan tidak ada elemen yang bertabrakan.
// Dijalankan sekali saat modul dimuat sehingga kesalahan tata letak segera terlihat.
function periksaTata() {
    const masalah = [];

    const bawahKategori = TATA.kategori.y;
    if (bawahKategori >= TATA.garis.y) masalah.push('teks kategori menimpa garis pemisah');

    const atasJuara1 = TATA.juara1.cy - TATA.juara1.r - 18;
    if (TATA.garis.y >= atasJuara1) masalah.push('garis pemisah menimpa lingkaran juara 1');

    const bawahBadge1 = TATA.juara1.badge + 31;
    const atasNama1 = TATA.juara1.nama - 40 * 0.72;
    if (bawahBadge1 >= atasNama1) masalah.push('badge juara 1 menimpa nama');

    if (TATA.juara1.poin > TINGGI - 30) masalah.push('teks poin melewati batas bawah kanvas');

    if (masalah.length) {
        console.error('[MOTM] tata letak banner bermasalah:', masalah.join('; '));
    }
    return masalah;
}

periksaTata();

// ============================================================
//  UTILITAS GAMBAR
// ============================================================

// Logo diunduh sekali lalu disimpan, agar tidak diambil ulang setiap pembuatan banner.
let logoCache = null;
let logoGagal = false;

// Berkas logo pada server dicoba lebih dulu. Tautan Discord punya masa berlaku
// dan akan berhenti bekerja setelah beberapa waktu, sehingga berkas setempat
// jauh lebih dapat diandalkan.
const LOGO_LOKAL = [
    path.join(__dirname, '..', 'assets', 'gk-logo.png'),
    path.join(__dirname, '..', 'assets', 'logo.png'),
    path.join(__dirname, '..', 'gk-logo.png'),
];

async function ambilLogo() {
    if (logoCache) return logoCache;
    if (logoGagal || !Canvas) return null;

    // berkas setempat
    for (const berkas of LOGO_LOKAL) {
        try {
            if (fs.existsSync(berkas)) {
                logoCache = await Canvas.loadImage(berkas);
                console.log('[MOTM] logo dimuat dari berkas:', berkas);
                return logoCache;
            }
        } catch (err) {
            console.error('[MOTM] gagal memuat logo dari berkas:', err.message);
        }
    }

    // tautan sebagai cadangan
    if (LOGO_URL) {
        try {
            logoCache = await Canvas.loadImage(LOGO_URL);
            return logoCache;
        } catch (err) {
            console.error(
                '[MOTM] gagal memuat logo dari tautan:', err.message,
                '\n[MOTM] taruh berkas logo di assets/gk-logo.png agar tidak bergantung pada tautan yang bisa kedaluwarsa'
            );
        }
    }

    logoGagal = true;
    return null;
}

async function ambilAvatar(url) {
    if (!Canvas || !url) return null;
    try {
        return await Canvas.loadImage(url);
    } catch {
        return null;
    }
}

function potongLingkaran(ctx, cx, cy, r, gambar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (gambar) {
        ctx.drawImage(gambar, cx - r, cy - r, r * 2, r * 2);
    } else {
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    ctx.restore();
}

// Memotong nama yang terlalu panjang agar tidak melebar keluar kolomnya
function potongTeks(ctx, teks, maksLebar) {
    if (ctx.measureText(teks).width <= maksLebar) return teks;

    let hasil = teks;
    while (hasil.length > 1 && ctx.measureText(hasil + '...').width > maksLebar) {
        hasil = hasil.slice(0, -1);
    }
    return hasil + '...';
}

const angka = n => Number(n || 0).toLocaleString('id-ID');

// ============================================================
//  LATAR
// ============================================================

function gambarLatar(ctx) {
    // gradasi merah gelap
    const g = ctx.createRadialGradient(LEBAR / 2, TINGGI * 0.34, 60, LEBAR / 2, TINGGI * 0.34, LEBAR * 0.8);
    g.addColorStop(0, '#7d0e0e');
    g.addColorStop(0.45, '#3d0808');
    g.addColorStop(1, '#100303');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LEBAR, TINGGI);

    // sinar retro dari tengah
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = '#ff6b6b';
    ctx.translate(LEBAR / 2, 300);
    for (const o of [-520, -300, -80, 140, 360]) {
        for (const arah of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(arah * 1300, o);
            ctx.lineTo(arah * 1300, o + 110);
            ctx.closePath();
            ctx.fill();
        }
    }
    ctx.restore();

    // lantai perspektif
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#ff2b2b';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, TATA.horizon);
    ctx.lineTo(LEBAR, TATA.horizon);
    ctx.stroke();

    for (const d of [10, 26, 48]) {
        ctx.globalAlpha = 0.3 - d * 0.004;
        ctx.beginPath();
        ctx.moveTo(0, TATA.horizon + d);
        ctx.lineTo(LEBAR, TATA.horizon + d);
        ctx.stroke();
    }

    ctx.globalAlpha = 0.18;
    for (const x of [-600, -120, 260, 540, 800, 1060, 1340, 1720, 2200]) {
        ctx.beginPath();
        ctx.moveTo(800, TATA.horizon);
        ctx.lineTo(x, TINGGI);
        ctx.stroke();
    }
    ctx.restore();
}

function gambarScanline(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#000000';
    for (let y = 0; y < TINGGI; y += 6) ctx.fillRect(0, y, LEBAR, 2);
    ctx.restore();
}

function gambarBingkai(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 24;
    ctx.strokeRect(12, 12, LEBAR - 24, TINGGI - 24);
    ctx.restore();
}

// ============================================================
//  BAGIAN ATAS
// ============================================================

async function gambarLogo(ctx) {
    const { cx, cy, r } = TATA.logo;
    const logo = await ambilLogo();

    // cincin luar
    ctx.save();
    ctx.strokeStyle = '#d31007';
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (logo) {
        potongLingkaran(ctx, cx, cy, r, logo);
    } else {
        ctx.fillStyle = '#140303';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#d31007';
        ctx.font = 'bold 46px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('GK', cx, cy + 17);
    }

    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
}

function gambarJudul(ctx, kategoriLabel, periodeLabel) {
    ctx.textAlign = 'center';

    // judul dengan gradasi krom kemerahan
    const g = ctx.createLinearGradient(0, TATA.judul.y - TATA.judul.ukuran, 0, TATA.judul.y + 8);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, '#ffdcdc');
    g.addColorStop(0.52, '#d31007');
    g.addColorStop(1, '#7d0b0b');

    ctx.save();
    ctx.shadowColor = 'rgba(255,43,43,0.75)';
    ctx.shadowBlur = 26;
    ctx.font = `bold ${TATA.judul.ukuran}px sans-serif`;
    ctx.fillStyle = g;
    ctx.fillText('MEMBER OF THE MONTH', LEBAR / 2, TATA.judul.y);
    ctx.restore();

    ctx.strokeStyle = '#2b0000';
    ctx.lineWidth = 2;
    ctx.font = `bold ${TATA.judul.ukuran}px sans-serif`;
    ctx.strokeText('MEMBER OF THE MONTH', LEBAR / 2, TATA.judul.y);

    // kategori dan periode
    ctx.font = `bold ${TATA.kategori.ukuran}px sans-serif`;
    ctx.fillStyle = '#ffb3b3';
    ctx.fillText(`${kategoriLabel}  ${String.fromCharCode(0x2022)}  ${periodeLabel}`, LEBAR / 2, TATA.kategori.y);

    // garis pemisah dengan ujung memudar
    const lg = ctx.createLinearGradient(
        LEBAR / 2 - TATA.garis.lebar / 2, 0,
        LEBAR / 2 + TATA.garis.lebar / 2, 0
    );
    lg.addColorStop(0, 'rgba(211,16,7,0)');
    lg.addColorStop(0.5, 'rgba(255,92,92,0.85)');
    lg.addColorStop(1, 'rgba(211,16,7,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(LEBAR / 2 - TATA.garis.lebar / 2, TATA.garis.y, TATA.garis.lebar, 3);
}

// ============================================================
//  PODIUM
// ============================================================

const GAYA_PERINGKAT = {
    1: {
        cincin: [['#ffeaa8', 0], ['#e8b923', 0.5], ['#a67c00', 1]],
        badgeIsi: '#e8b923', badgeGaris: '#fff3cc', badgeTeks: '#4a3200',
        warnaPoin: '#ffd966', ukuranNama: 40, ukuranPoin: 28, badgeR: 31, cincinTebal: 9,
    },
    2: {
        cincin: [['#ffffff', 0], ['#c8ccd2', 0.5], ['#7d8590', 1]],
        badgeIsi: '#c8ccd2', badgeGaris: '#ffffff', badgeTeks: '#3a3a3a',
        warnaPoin: '#c8ccd2', ukuranNama: 30, ukuranPoin: 24, badgeR: 25, cincinTebal: 7,
    },
    3: {
        cincin: [['#f0b98a', 0], ['#c87f3f', 0.5], ['#8a4f1d', 1]],
        badgeIsi: '#c87f3f', badgeGaris: '#f0b98a', badgeTeks: '#3a1c00',
        warnaPoin: '#e0a06a', ukuranNama: 30, ukuranPoin: 24, badgeR: 25, cincinTebal: 7,
    },
};

async function gambarPeringkat(ctx, posisi, data) {
    const t = TATA[`juara${posisi}`];
    const gaya = GAYA_PERINGKAT[posisi];
    if (!t || !gaya) return;

    // pendar khusus juara pertama
    if (posisi === 1) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#ff2b2b';
        ctx.shadowColor = 'rgba(232,185,35,0.9)';
        ctx.shadowBlur = 40;
        ctx.beginPath();
        ctx.arc(t.cx, t.cy, t.r + 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // avatar
    const avatar = await ambilAvatar(data?.avatar);
    potongLingkaran(ctx, t.cx, t.cy, t.r, avatar);

    // cincin
    const cg = ctx.createLinearGradient(t.cx - t.r, t.cy - t.r, t.cx + t.r, t.cy + t.r);
    for (const [warna, stop] of gaya.cincin) cg.addColorStop(stop, warna);

    ctx.save();
    if (posisi === 1) {
        ctx.shadowColor = 'rgba(232,185,35,0.8)';
        ctx.shadowBlur = 24;
    }
    ctx.strokeStyle = cg;
    ctx.lineWidth = gaya.cincinTebal;
    ctx.beginPath();
    ctx.arc(t.cx, t.cy, t.r + gaya.cincinTebal, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // badge nomor
    ctx.fillStyle = gaya.badgeIsi;
    ctx.beginPath();
    ctx.arc(t.cx, t.badge, gaya.badgeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = gaya.badgeGaris;
    ctx.lineWidth = posisi === 1 ? 4 : 3;
    ctx.stroke();

    ctx.fillStyle = gaya.badgeTeks;
    ctx.font = `bold ${posisi === 1 ? 34 : 27}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(String(posisi), t.cx, t.badge + (posisi === 1 ? 12 : 10));

    // nama
    ctx.font = `bold ${gaya.ukuranNama}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    const lebarKolom = posisi === 1 ? 340 : 300;
    ctx.fillText(potongTeks(ctx, data?.nama || 'belum ada', lebarKolom), t.cx, t.nama);

    // poin
    ctx.font = `bold ${gaya.ukuranPoin}px sans-serif`;
    ctx.fillStyle = gaya.warnaPoin;
    ctx.fillText(`${angka(data?.poin)} poin`, t.cx, t.poin);
}

// ============================================================
//  PEMBUATAN BANNER
// ============================================================

// data = { kategori: 'voice' | 'chat', bulan: Date, juara: [ {nama, poin, avatar}, ... ] }
async function buatBanner(data) {
    if (!Canvas) return null;

    try {
        const kanvas = Canvas.createCanvas(LEBAR, TINGGI);
        const ctx = kanvas.getContext('2d');

        const tanggal = data.bulan instanceof Date ? data.bulan : new Date();
        const periodeLabel = `${BULAN[tanggal.getMonth()]} ${tanggal.getFullYear()}`.toUpperCase();
        const kategoriLabel = data.kategori === 'voice' ? 'KATEGORI VOICE' : 'KATEGORI CHAT';

        gambarLatar(ctx);
        await gambarLogo(ctx);
        gambarJudul(ctx, kategoriLabel, periodeLabel);

        const juara = Array.isArray(data.juara) ? data.juara : [];

        // digambar dari peringkat luar ke tengah agar pendar juara pertama berada di atas
        await gambarPeringkat(ctx, 2, juara[1]);
        await gambarPeringkat(ctx, 3, juara[2]);
        await gambarPeringkat(ctx, 1, juara[0]);

        gambarScanline(ctx);
        gambarBingkai(ctx);

        return kanvas.toBuffer('image/png');
    } catch (err) {
        console.error('[MOTM] gagal membuat banner:', err.message);
        return null;
    }
}

const tersedia = () => Boolean(Canvas);

module.exports = { buatBanner, tersedia, TATA, LEBAR, TINGGI, periksaTata };
