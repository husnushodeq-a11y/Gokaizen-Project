// utils/motmScheduler.js
// Mengatur jadwal papan Member of the Month.
//
//   setiap beberapa menit : papan harian disegarkan
//   pergantian hari       : papan harian baru dikirim, papan bulanan diperbarui
//   pergantian bulan      : pemenang diumumkan, role juara disesuaikan
//
// Pemeriksaan dilakukan berkala dan membandingkan tanggal tersimpan dengan
// tanggal sekarang, sehingga pergantian tetap terproses walau bot sempat mati.

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    AttachmentBuilder,
    MessageFlags,
} = require('discord.js');

const C = require('./motmConfig');
const D = require('./motmData');
const Board = require('./motmBoard');
const Banner = require('./motmBanner');
const VoiceTicker = require('./motmVoiceTicker');

const { EMOJI, rankEmoji, WARNA, BULAN, TAMPIL, CHANNEL, PAPAN_INTERVAL } = C;

const KATEGORI = ['voice', 'chat'];
const CEK_INTERVAL = 60 * 1000;

let berjalan = false;
let sedangProses = false;

const angka = n => Number(n || 0).toLocaleString('id-ID');

// ============================================================
//  PENGUMUMAN PEMENANG
// ============================================================

function labelBulan(bulanKey) {
    const [th, bl] = bulanKey.split('-');
    return `${BULAN[Number(bl) - 1]} ${th}`;
}

async function susunPengumuman(client, bulanKey, hasil) {
    const c = new ContainerBuilder();
    if (typeof c.setAccentColor === 'function') c.setAccentColor(WARNA.UTAMA);

    const tambahTeks = isi => c.addTextDisplayComponents(new TextDisplayBuilder().setContent(isi));
    const pisah = () => {
        if (typeof c.addSeparatorComponents !== 'function') return;
        try {
            const s = new SeparatorBuilder();
            if (typeof s.setDivider === 'function') s.setDivider(true);
            if (typeof s.setSpacing === 'function' && SeparatorSpacingSize) s.setSpacing(SeparatorSpacingSize.Small);
            c.addSeparatorComponents(s);
        } catch { /* opsional */ }
    };

    tambahTeks(
        `## ${EMOJI.crown} MEMBER OF THE MONTH\n` +
        `${EMOJI.calendar} ${labelBulan(bulanKey)}\n\n` +
        'Selamat kepada seluruh pemenang. Terima kasih sudah menjaga server tetap hidup sepanjang bulan ini.'
    );

    const berkas = [];

    for (const kategori of KATEGORI) {
        const daftar = hasil[kategori] || [];
        pisah();

        const judul = kategori === 'voice'
            ? `${EMOJI.voice} **KATEGORI VOICE**`
            : `${EMOJI.chat} **KATEGORI CHAT**`;

        const isi = daftar.length
            ? daftar.slice(0, 3).map((u, i) =>
                `${rankEmoji(i + 1)} <@${u.id}>\n${EMOJI.arrow} ${angka(u.poin)} poin`).join('\n\n')
            : `${EMOJI.arrow} Tidak ada peserta yang memenuhi syarat`;

        tambahTeks(`${judul}\n\n${isi}`);

        // banner per kategori
        if (Banner.tersedia() && daftar.length) {
            const tiga = [];
            for (const u of daftar.slice(0, 3)) {
                const usr = await client.users.fetch(u.id).catch(() => null);
                tiga.push({
                    nama: u.nama,
                    poin: u.poin,
                    avatar: usr ? usr.displayAvatarURL({ extension: 'png', size: 256 }) : null,
                });
            }

            const [th, bl] = bulanKey.split('-');
            const buffer = await Banner.buatBanner({
                kategori,
                bulan: new Date(Number(th), Number(bl) - 1, 1),
                juara: tiga,
            });

            if (buffer && typeof MediaGalleryBuilder === 'function' && typeof c.addMediaGalleryComponents === 'function') {
                const nama = `motm-pemenang-${kategori}.png`;
                try {
                    c.addMediaGalleryComponents(
                        new MediaGalleryBuilder().addItems(
                            new MediaGalleryItemBuilder().setURL(`attachment://${nama}`)
                        )
                    );
                    berkas.push(new AttachmentBuilder(buffer, { name: nama }));
                } catch { /* banner opsional */ }
            }
        }
    }

    pisah();
    tambahTeks(
        `${EMOJI.medal} Role juara diberikan kepada tiga peringkat teratas pada setiap kategori.\n` +
        `${EMOJI.arrow} Role akan berpindah ke pemenang berikutnya pada akhir bulan depan.`
    );

    const payload = {
        components: [c],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    };
    if (berkas.length) payload.files = berkas;

    return payload;
}

// ============================================================
//  PERGANTIAN BULAN
// ============================================================

async function prosesBulanBaru(client, guild) {
    const bulanLalu = D.kunciBulanLalu();

    // sudah pernah diproses
    if (D.ambilPemenang(bulanLalu)) return false;

    // Peringkat dihitung dari catatan bulan lalu, bukan bulan berjalan.
    const hasil = {};
    const semuaPemenang = new Set();

    for (const kategori of KATEGORI) {
        const bidang = kategori === 'voice' ? 'monthlyVoice' : 'monthlyChat';
        const minimal = kategori === 'voice' ? C.POIN.MINIMAL_VOICE : C.POIN.MINIMAL_CHAT;

        const daftar = [];
        for (const u of Object.values(D.db.users)) {
            const poin = (u[bidang] && u[bidang][bulanLalu]) || 0;
            if (poin >= minimal) daftar.push({ id: u.id, nama: u.username || u.id, poin });
        }
        daftar.sort((a, b) => (b.poin - a.poin) || a.id.localeCompare(b.id));

        hasil[kategori] = daftar.slice(0, 3);
        for (const u of hasil[kategori]) semuaPemenang.add(u.id);
    }

    // catat lebih dulu agar tidak terulang bila pengiriman gagal
    D.simpanPemenang(bulanLalu, hasil);

    // role juara
    const role = await Board.segarkanRoleJuara(guild, [...semuaPemenang]);
    console.log(`[MOTM] role juara: ${role.diberi.length} diberikan, ${role.dicabut.length} dicabut`);

    // pengumuman
    const channelId = CHANNEL.PENGUMUMAN || CHANNEL.BULANAN;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel) {
        const payload = await susunPengumuman(client, bulanLalu, hasil);
        await channel.send(payload).catch(err =>
            console.error('[MOTM] gagal mengirim pengumuman pemenang:', err.message));
    }

    // papan bulanan dimulai ulang untuk bulan baru
    for (const kategori of KATEGORI) {
        D.hapusPapan(Board.kunciPapan('bulanan', kategori));
        Board.urutanTerakhir.delete(Board.kunciPapan('bulanan', kategori));
    }

    console.log(`[MOTM] pemenang ${bulanLalu} diproses`);
    return true;
}

// ============================================================
//  PERGANTIAN HARI
// ============================================================

async function prosesHariBaru(client) {
    D.bersihkanHarian();

    // papan harian: kirim pesan baru
    for (const kategori of KATEGORI) {
        const kunci = Board.kunciPapan('harian', kategori);
        Board.urutanTerakhir.delete(kunci);
        Board.urutanTerakhir.delete(kunci + ':poin');
        await Board.kirimPapan(client, CHANNEL.HARIAN, 'harian', kategori);
    }

    // papan bulanan: cukup diperbarui
    for (const kategori of KATEGORI) {
        const kunci = Board.kunciPapan('bulanan', kategori);
        const catatan = D.ambilPapan(kunci);
        if (catatan) await Board.perbaruiPapan(client, 'bulanan', kategori);
        else await Board.kirimPapan(client, CHANNEL.BULANAN, 'bulanan', kategori);
    }

    console.log('[MOTM] papan harian baru dikirim, papan bulanan diperbarui');
}

// ============================================================
//  PEMERIKSAAN BERKALA
// ============================================================

async function periksa(client, guild) {
    if (sedangProses) return;
    sedangProses = true;

    try {
        const hariIni = D.kunciHari();
        const bulanIni = D.kunciBulan();

        const catatanHarian = D.ambilPapan(Board.kunciPapan('harian', 'voice'));
        const hariTersimpan = catatanHarian?.hari || null;

        // pergantian bulan diproses lebih dulu, agar pengumuman muncul
        // sebelum papan bulanan dimulai ulang
        const catatanBulanan = D.ambilPapan(Board.kunciPapan('bulanan', 'voice'));
        if (catatanBulanan && catatanBulanan.bulan && catatanBulanan.bulan !== bulanIni) {
            await prosesBulanBaru(client, guild);
        }

        if (hariTersimpan !== hariIni) {
            await prosesHariBaru(client);
        } else {
            // penyegaran biasa
            for (const kategori of KATEGORI) {
                await Board.perbaruiPapan(client, 'harian', kategori);
            }
        }
    } catch (err) {
        console.error('[MOTM] galat pada pemeriksaan berkala:', err.message);
    } finally {
        sedangProses = false;
    }
}

// ============================================================
//  PENYALAAN
// ============================================================

async function mulai(client) {
    if (berjalan) return;
    berjalan = true;

    D.mulaiPenyimpan();

    const guild = C.GUILD_ID
        ? await client.guilds.fetch(C.GUILD_ID).catch(() => null)
        : client.guilds.cache.first();

    // penghitung poin suara berjalan sendiri, terpisah dari papan
    VoiceTicker.mulai(client, guild);

    // pemeriksaan pertama diberi jeda agar cache anggota sempat terisi
    setTimeout(() => { periksa(client, guild).catch(() => {}); }, 15000);

    const tPeriksa = setInterval(() => { periksa(client, guild).catch(() => {}); }, CEK_INTERVAL);
    if (typeof tPeriksa.unref === 'function') tPeriksa.unref();

    const tSegar = setInterval(() => {
        (async () => {
            for (const kategori of KATEGORI) {
                await Board.perbaruiPapan(client, 'harian', kategori);
            }
        })().catch(() => {});
    }, PAPAN_INTERVAL);
    if (typeof tSegar.unref === 'function') tSegar.unref();

    console.log(`[MOTM] penjadwal dimulai, papan harian disegarkan setiap ${Math.round(PAPAN_INTERVAL / 60000)} menit`);
}

module.exports = { mulai, periksa, prosesHariBaru, prosesBulanBaru, susunPengumuman };
