// utils/gosmartEngine.js
// Mesin jalannya lomba GO SMART.
//
// Bot menampilkan soal dan menghitung waktu secara otomatis, tetapi perpindahan
// ke soal berikutnya menunggu perintah pengelola. Ini memberi ruang bagi MC
// untuk berkomentar, dan bila terjadi masalah acara berhenti di tempat, bukan
// kacau berantai.
//
// Dipakai oleh utils/gosmartCommands.js

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');

const C = require('./gosmartConfig');
const D = require('./gosmartData');

const { WARNA, EMOJI, NILAI, LABEL_PILIHAN, TAMPIL_PAPAN, SELANG_HITUNG, nomorPeringkat } = C;

// ============================================================
//  KOMPONEN
// ============================================================

const teks = isi => new TextDisplayBuilder().setContent(isi);

function wadah(warna) {
    const c = new ContainerBuilder();
    if (typeof c.setAccentColor === 'function') c.setAccentColor(warna);
    return c;
}

function pemisah(c) {
    if (typeof c.addSeparatorComponents !== 'function') return;
    try {
        const s = new SeparatorBuilder();
        if (typeof s.setDivider === 'function') s.setDivider(true);
        if (typeof s.setSpacing === 'function' && SeparatorSpacingSize) s.setSpacing(SeparatorSpacingSize.Small);
        c.addSeparatorComponents(s);
    } catch { /* pemisah opsional */ }
}

function barisTombolJawaban(nonaktif, benarIndex = null) {
    const baris = [];
    try {
        for (const kelompok of [[0, 1], [2, 3]]) {
            const row = new ActionRowBuilder();
            for (const i of kelompok) {
                const b = new ButtonBuilder()
                    .setCustomId(`gs_jawab:${i}`)
                    .setLabel(LABEL_PILIHAN[i])
                    .setStyle(
                        benarIndex === null
                            ? ButtonStyle.Primary
                            : (i === benarIndex ? ButtonStyle.Success : ButtonStyle.Secondary)
                    )
                    .setDisabled(Boolean(nonaktif));
                row.addComponents(b);
            }
            baris.push(row);
        }
    } catch {
        return [];
    }
    return baris;
}

function pasangBaris(c, baris) {
    if (typeof c.addActionRowComponents !== 'function') return;
    for (const b of baris) {
        try { c.addActionRowComponents(b); } catch { /* tombol opsional */ }
    }
}

function muatan(c, mentions) {
    return {
        components: [c],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: mentions || { parse: [] },
    };
}

const angka = n => Number(n || 0).toLocaleString('id-ID');
const detikDari = ms => (ms / 1000).toFixed(1);

// Nama ditampilkan sebagai teks biasa agar selalu terbaca.
// Sebutan yang tidak diizinkan berdering membuat sebagian perangkat hanya
// menampilkan tulisan unknown-user.
function amankan(nama) {
    return String(nama || 'Peserta')
        .replace(/([*_`~|\\])/g, '\\$1')
        .slice(0, 30);
}

const namaPeserta = p => amankan(p?.nama || `Peserta ${String(p?.id || '').slice(-4)}`);

// ============================================================
//  TAMPILAN SOAL
// ============================================================

// Batang waktu yang tersisa
function batangWaktu(sisaDetik, totalDetik) {
    const panjang = 12;
    const terisi = Math.max(0, Math.min(panjang, Math.round((sisaDetik / totalDetik) * panjang)));
    return '`' + '\u2588'.repeat(terisi) + '\u2591'.repeat(panjang - terisi) + '`';
}

function susunSoal(a, soal, sisaDetik, totalDetik, jumlahJawab) {
    const c = wadah(WARNA.SOAL);
    const babak = C.BABAK[a.babak];

    c.addTextDisplayComponents(teks(
        `## ${EMOJI.trophy} SOAL ${soal.nomor} DARI ${a.daftarSoal.length}\n` +
        `${EMOJI.calendar} Babak ${babak?.nama || a.babak}`
    ));

    pemisah(c);

    c.addTextDisplayComponents(teks(
        `### ${soal.t}\n\n` +
        soal.p.map((pil, i) => `**${LABEL_PILIHAN[i]}.** ${pil}`).join('\n')
    ));

    pemisah(c);

    c.addTextDisplayComponents(teks(
        `${EMOJI.clock} ${batangWaktu(sisaDetik, totalDetik)} **${Math.ceil(sisaDetik)} detik**\n` +
        `${EMOJI.chart} ${jumlahJawab} peserta sudah menjawab\n` +
        `${EMOJI.arrow} Jawaban terkunci setelah ditekan, pilih dengan yakin`
    ));

    pasangBaris(c, barisTombolJawaban(false));
    return muatan(c);
}

function susunSoalTutup(a, soal, hasil) {
    const c = wadah(hasil.benar.length ? WARNA.BENAR : WARNA.SALAH);
    const babak = C.BABAK[a.babak];

    c.addTextDisplayComponents(teks(
        `## ${EMOJI.trophy} SOAL ${soal.nomor} DARI ${a.daftarSoal.length}\n` +
        `${EMOJI.calendar} Babak ${babak?.nama || a.babak} ${String.fromCharCode(0x2022)} waktu habis`
    ));

    pemisah(c);

    c.addTextDisplayComponents(teks(
        `### ${soal.t}\n\n` +
        soal.p.map((pil, i) =>
            i === soal.j ? `**${LABEL_PILIHAN[i]}. ${pil}** ${EMOJI.up}` : `${LABEL_PILIHAN[i]}. ${pil}`
        ).join('\n')
    ));

    pemisah(c);

    let isi = `${EMOJI.arrow} Jawaban benar: **${LABEL_PILIHAN[soal.j]}. ${soal.p[soal.j]}**`;
    if (soal.e) isi += `\n${EMOJI.arrow} ${soal.e}`;
    c.addTextDisplayComponents(teks(isi));

    pemisah(c);

    // penjawab benar tercepat
    if (hasil.benar.length) {
        const tercepat = hasil.benar.slice(0, 5).map((x, i) =>
            `${nomorPeringkat(i + 1)} ${namaPeserta(x.peserta)} ${EMOJI.arrow} ${detikDari(x.waktuMs)} detik, **+${angka(x.dapat)}** poin`
        ).join('\n');

        let ringkas = `${EMOJI.chart} **PENJAWAB TERCEPAT**\n${tercepat}`;
        if (hasil.benar.length > 5) ringkas += `\n${EMOJI.arrow} dan ${hasil.benar.length - 5} peserta lain menjawab benar`;
        c.addTextDisplayComponents(teks(ringkas));
    } else {
        c.addTextDisplayComponents(teks(
            `${EMOJI.chart} Tidak ada satu pun peserta yang menjawab benar.`
        ));
    }

    pemisah(c);

    c.addTextDisplayComponents(teks(
        `${EMOJI.arrow} Benar ${hasil.benar.length} ${String.fromCharCode(0x2022)} ` +
        `Salah ${hasil.salah.length} ${String.fromCharCode(0x2022)} ` +
        `Tidak menjawab ${hasil.tidakJawab.length}`
    ));

    pasangBaris(c, barisTombolJawaban(true, soal.j));
    return muatan(c);
}

// ============================================================
//  PAPAN NILAI
// ============================================================

function susunPapan(a, judul, batas = TAMPIL_PAPAN) {
    const c = wadah(WARNA.PAPAN);
    const urut = D.peringkat(a);
    const babak = C.BABAK[a.babak];

    c.addTextDisplayComponents(teks(
        `## ${EMOJI.chart} ${judul || 'PAPAN NILAI'}\n` +
        `${EMOJI.calendar} Babak ${babak?.nama || a.babak} ${String.fromCharCode(0x2022)} ` +
        `soal ${a.soalKe} dari ${a.daftarSoal.length}`
    ));

    pemisah(c);

    if (!urut.length) {
        c.addTextDisplayComponents(teks(`${EMOJI.arrow} Belum ada peserta.`));
        return muatan(c);
    }

    const baris = urut.slice(0, batas).map((p, i) =>
        `${nomorPeringkat(i + 1)} ${namaPeserta(p)}\n` +
        `${EMOJI.arrow} **${angka(p.nilai)}** poin ${String.fromCharCode(0x2022)} ` +
        `${p.benar} benar ${String.fromCharCode(0x2022)} ${p.salah} salah`
    ).join('\n\n');

    c.addTextDisplayComponents(teks(baris));

    if (urut.length > batas) {
        pemisah(c);
        c.addTextDisplayComponents(teks(`${EMOJI.arrow} dan ${urut.length - batas} peserta lainnya`));
    }

    pemisah(c);
    c.addTextDisplayComponents(teks(
        `${EMOJI.chart} ${urut.length} peserta masih bermain\n` +
        `${EMOJI.clock} Diperbarui <t:${Math.floor(Date.now() / 1000)}:R>`
    ));

    return muatan(c);
}

// ============================================================
//  JALANNYA SOAL
// ============================================================

// Pewaktu yang sedang berjalan, agar dapat dihentikan bila perlu
const pewaktu = new Map();

function hentikanPewaktu(guildId) {
    const t = pewaktu.get(guildId);
    if (t) {
        clearInterval(t.interval);
        clearTimeout(t.timeout);
        pewaktu.delete(guildId);
    }
}

// Menampilkan satu soal, menghitung mundur, lalu menutupnya sendiri.
// selesai(hasil) dipanggil setelah soal berakhir.
async function jalankanSoal(client, a, selesai) {
    const channel = await client.channels.fetch(a.channelId).catch(() => null);
    if (!channel) return { ok: false, alasan: 'channel tidak ditemukan' };

    const soal = a.daftarSoal[a.soalKe];
    if (!soal) return { ok: false, alasan: 'soal habis' };

    const babak = C.BABAK[a.babak];
    const totalDetik = babak?.detik || 10;

    const nomorSoal = a.soalKe + 1;
    const pesan = await channel.send(
        susunSoal(a, { ...soal, nomor: nomorSoal }, totalDetik, totalDetik, 0)
    ).catch(err => {
        console.error('[GOSMART] gagal mengirim soal:', err.message);
        return null;
    });

    if (!pesan) return { ok: false, alasan: 'gagal mengirim soal' };

    D.mulaiSoal(a, pesan.id);
    hentikanPewaktu(a.guildId);

    // pembaruan hitungan mundur
    const interval = setInterval(async () => {
        const s = a.soalAktif;
        if (!s || s.selesai) return;

        const lewat = (Date.now() - s.mulaiAt) / 1000;
        const sisa = Math.max(0, totalDetik - lewat);
        if (sisa <= 0) return;

        await pesan.edit(
            susunSoal(a, s, sisa, totalDetik, Object.keys(s.jawaban).length)
        ).catch(() => null);
    }, SELANG_HITUNG);

    // penutupan otomatis
    const timeout = setTimeout(async () => {
        clearInterval(interval);
        pewaktu.delete(a.guildId);

        const s = a.soalAktif;
        if (!s || s.selesai) return;

        const hasil = D.tutupSoal(a, NILAI, totalDetik);
        await pesan.edit(susunSoalTutup(a, s, hasil)).catch(() => null);

        if (typeof selesai === 'function') await selesai(hasil, s);
    }, totalDetik * 1000);

    pewaktu.set(a.guildId, { interval, timeout });
    return { ok: true, pesan, soal: a.soalAktif };
}

// Menutup soal lebih cepat, dipakai bila pengelola ingin mempercepat
async function tutupPaksa(client, a) {
    const s = a.soalAktif;
    if (!s || s.selesai) return null;

    hentikanPewaktu(a.guildId);

    const babak = C.BABAK[a.babak];
    const hasil = D.tutupSoal(a, NILAI, babak?.detik || 10);

    const channel = await client.channels.fetch(a.channelId).catch(() => null);
    if (channel) {
        const pesan = await channel.messages.fetch(s.pesanId).catch(() => null);
        if (pesan) await pesan.edit(susunSoalTutup(a, s, hasil)).catch(() => null);
    }

    return hasil;
}

module.exports = {
    susunSoal,
    susunSoalTutup,
    susunPapan,
    jalankanSoal,
    tutupPaksa,
    hentikanPewaktu,
    namaPeserta,
    muatan,
    wadah,
    teks,
    pemisah,
    angka,
};
