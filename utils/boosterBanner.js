// utils/boosterBanner.js
// Banner ucapan terima kasih untuk anggota yang melakukan boost.
// Bertema retro merah, senada dengan banner Member of the Month.
//
// Tata letak dipisah pada objek TATA agar mudah diperiksa, dan setiap
// perubahan posisi diuji oleh periksaTata() supaya tidak ada elemen yang
// saling menimpa.

const fs = require('fs');
const path = require('path');

let Canvas = null;
try {
    Canvas = require('canvas');
} catch {
    console.warn('[BOOSTER] modul canvas tidak tersedia, banner dinonaktifkan.');
}

const LEBAR = 1200;
const TINGGI = 540;

// Warna khas boost dipadukan dengan latar merah retro
const WARNA = {
    boost: '#f47fff',
    boostGelap: '#a13bb0',
    boostTerang: '#ffd6ff',
    merah: '#d31007',
};

const TATA = {
    logo: { cx: 110, cy: 90, r: 46 },
    judul: { y: 88, ukuran: 46 },
    sub: { y: 130, ukuran: 21 },
    garis: { y: 158, lebar: 520 },
    avatar: { cx: 600, cy: 305, r: 100 },
    badge: { cy: 395, r: 26 },
    nama: { y: 462, ukuran: 36 },
    info: { y: 502, ukuran: 22 },
    horizon: 470,
};

function periksaTata() {
    const masalah = [];

    if (TATA.sub.y >= TATA.garis.y) masalah.push('teks keterangan menimpa garis pemisah');

    const atasAvatar = TATA.avatar.cy - TATA.avatar.r - 14;
    if (TATA.garis.y >= atasAvatar) masalah.push('garis pemisah menimpa lingkaran avatar');

    const bawahBadge = TATA.badge.cy + TATA.badge.r;
    const atasNama = TATA.nama.y - TATA.nama.ukuran * 0.72;
    if (bawahBadge >= atasNama) masalah.push('badge menimpa nama');

    if (TATA.info.y > TINGGI - 24) masalah.push('teks keterangan melewati batas bawah kanvas');

    if (masalah.length) console.error('[BOOSTER] tata letak banner bermasalah:', masalah.join('; '));
    return masalah;
}

periksaTata();

// ============================================================
//  BERKAS GAMBAR
// ============================================================

let logoCache = null;
let logoGagal = false;

const LOGO_LOKAL = [
    path.join(__dirname, '..', 'assets', 'gk-logo.png'),
    path.join(__dirname, '..', 'assets', 'logo.png'),
];

async function ambilLogo() {
    if (logoCache) return logoCache;
    if (logoGagal || !Canvas) return null;

    for (const berkas of LOGO_LOKAL) {
        try {
            if (fs.existsSync(berkas)) {
                logoCache = await Canvas.loadImage(berkas);
                return logoCache;
            }
        } catch { /* dicoba berkas berikutnya */ }
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

    if (gambar) ctx.drawImage(gambar, cx - r, cy - r, r * 2, r * 2);
    else { ctx.fillStyle = '#3a3a3a'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); }

    ctx.restore();
}

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
    const g = ctx.createRadialGradient(LEBAR / 2, TINGGI * 0.36, 50, LEBAR / 2, TINGGI * 0.36, LEBAR * 0.85);
    g.addColorStop(0, '#7d0e0e');
    g.addColorStop(0.45, '#3d0808');
    g.addColorStop(1, '#100303');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LEBAR, TINGGI);

    // sinar retro
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = '#ff6b6b';
    ctx.translate(LEBAR / 2, 280);
    for (const o of [-420, -240, -60, 120, 300]) {
        for (const arah of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(arah * 1000, o);
            ctx.lineTo(arah * 1000, o + 90);
            ctx.closePath();
            ctx.fill();
        }
    }
    ctx.restore();

    // semburat merah muda khas boost di belakang avatar
    ctx.save();
    const bg = ctx.createRadialGradient(TATA.avatar.cx, TATA.avatar.cy, 40, TATA.avatar.cx, TATA.avatar.cy, 300);
    bg.addColorStop(0, 'rgba(244,127,255,0.20)');
    bg.addColorStop(1, 'rgba(244,127,255,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, LEBAR, TINGGI);
    ctx.restore();

    // lantai perspektif
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = WARNA.boost;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, TATA.horizon);
    ctx.lineTo(LEBAR, TATA.horizon);
    ctx.stroke();

    for (const d of [12, 30]) {
        ctx.globalAlpha = 0.22 - d * 0.004;
        ctx.beginPath();
        ctx.moveTo(0, TATA.horizon + d);
        ctx.lineTo(LEBAR, TATA.horizon + d);
        ctx.stroke();
    }

    ctx.globalAlpha = 0.15;
    for (const x of [-400, -40, 240, 460, 600, 740, 960, 1240, 1600]) {
        ctx.beginPath();
        ctx.moveTo(600, TATA.horizon);
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
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 22;
    ctx.strokeRect(11, 11, LEBAR - 22, TINGGI - 22);
    ctx.restore();
}

// ============================================================
//  ISI
// ============================================================

async function gambarLogo(ctx) {
    const { cx, cy, r } = TATA.logo;
    const logo = await ambilLogo();

    ctx.save();
    ctx.strokeStyle = WARNA.merah;
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
        ctx.fillStyle = WARNA.merah;
        ctx.font = 'bold 38px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('GK', cx, cy + 14);
    }

    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
}

function gambarJudul(ctx, keterangan) {
    ctx.textAlign = 'center';

    const g = ctx.createLinearGradient(0, TATA.judul.y - TATA.judul.ukuran, 0, TATA.judul.y + 8);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, WARNA.boostTerang);
    g.addColorStop(0.55, WARNA.boost);
    g.addColorStop(1, WARNA.boostGelap);

    ctx.save();
    ctx.shadowColor = 'rgba(244,127,255,0.8)';
    ctx.shadowBlur = 26;
    ctx.font = `bold ${TATA.judul.ukuran}px sans-serif`;
    ctx.fillStyle = g;
    ctx.fillText('SERVER BOOSTER', LEBAR / 2, TATA.judul.y);
    ctx.restore();

    ctx.strokeStyle = '#2b0000';
    ctx.lineWidth = 2;
    ctx.font = `bold ${TATA.judul.ukuran}px sans-serif`;
    ctx.strokeText('SERVER BOOSTER', LEBAR / 2, TATA.judul.y);

    ctx.font = `bold ${TATA.sub.ukuran}px sans-serif`;
    ctx.fillStyle = '#ffc6ff';
    ctx.fillText(keterangan, LEBAR / 2, TATA.sub.y);

    const lg = ctx.createLinearGradient(
        LEBAR / 2 - TATA.garis.lebar / 2, 0,
        LEBAR / 2 + TATA.garis.lebar / 2, 0
    );
    lg.addColorStop(0, 'rgba(244,127,255,0)');
    lg.addColorStop(0.5, 'rgba(244,127,255,0.85)');
    lg.addColorStop(1, 'rgba(244,127,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(LEBAR / 2 - TATA.garis.lebar / 2, TATA.garis.y, TATA.garis.lebar, 3);
}

// Lambang boost sederhana berbentuk berlian
function gambarLambangBoost(ctx, cx, cy, r) {
    ctx.save();
    ctx.translate(cx, cy);

    ctx.shadowColor = 'rgba(244,127,255,0.9)';
    ctx.shadowBlur = 18;

    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, WARNA.boostTerang);
    g.addColorStop(0.5, WARNA.boost);
    g.addColorStop(1, WARNA.boostGelap);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.78, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.78, 0);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.restore();
}

async function gambarAnggota(ctx, data) {
    const t = TATA.avatar;

    // pendar di belakang avatar
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = WARNA.boost;
    ctx.shadowColor = 'rgba(244,127,255,0.9)';
    ctx.shadowBlur = 45;
    ctx.beginPath();
    ctx.arc(t.cx, t.cy, t.r + 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const avatar = await ambilAvatar(data.avatar);
    potongLingkaran(ctx, t.cx, t.cy, t.r, avatar);

    const cg = ctx.createLinearGradient(t.cx - t.r, t.cy - t.r, t.cx + t.r, t.cy + t.r);
    cg.addColorStop(0, WARNA.boostTerang);
    cg.addColorStop(0.5, WARNA.boost);
    cg.addColorStop(1, WARNA.boostGelap);

    ctx.save();
    ctx.shadowColor = 'rgba(244,127,255,0.8)';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = cg;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(t.cx, t.cy, t.r + 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    gambarLambangBoost(ctx, t.cx, TATA.badge.cy, TATA.badge.r);

    ctx.textAlign = 'center';
    ctx.font = `bold ${TATA.nama.ukuran}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(potongTeks(ctx, data.nama || 'Booster', 520), t.cx, TATA.nama.y);

    ctx.font = `bold ${TATA.info.ukuran}px sans-serif`;
    ctx.fillStyle = '#ffc6ff';
    ctx.fillText(data.info || 'Terima kasih atas dukungannya', t.cx, TATA.info.y);
}

// ============================================================
//  PEMBUATAN
// ============================================================

// data = { nama, avatar, info, keterangan }
async function buatBanner(data = {}) {
    if (!Canvas) return null;

    try {
        const kanvas = Canvas.createCanvas(LEBAR, TINGGI);
        const ctx = kanvas.getContext('2d');

        gambarLatar(ctx);
        await gambarLogo(ctx);
        gambarJudul(ctx, data.keterangan || 'GO KAIZEN OFFICIAL');
        await gambarAnggota(ctx, data);
        gambarScanline(ctx);
        gambarBingkai(ctx);

        return kanvas.toBuffer('image/png');
    } catch (err) {
        console.error('[BOOSTER] gagal membuat banner:', err.message);
        return null;
    }
}

const tersedia = () => Boolean(Canvas);

module.exports = { buatBanner, tersedia, TATA, LEBAR, TINGGI, periksaTata, angka };
