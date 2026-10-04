// utils/motmBoard.js
// Menyusun dan memperbarui papan peringkat Member of the Month.
//
// Ada dua papan yang berjalan bersamaan:
//   harian  : pesan baru dikirim setiap pergantian hari, isinya disegarkan berkala
//   bulanan : pesannya tetap, isinya diperbarui setiap pergantian hari
//
// Masing-masing papan terdiri dari dua kategori, yaitu suara dan obrolan.

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    MessageFlags,
} = require('discord.js');

const C = require('./motmConfig');
const D = require('./motmData');
const Banner = require('./motmBanner');

const { EMOJI, rankEmoji, WARNA, BULAN, TAMPIL, CHANNEL, ROLE, POIN } = C;

const TOMBOL_ID = 'motm_lanjutan';

// ============================================================
//  KOMPONEN
// ============================================================

const adaV2 =
    typeof ContainerBuilder === 'function' &&
    typeof TextDisplayBuilder === 'function' &&
    MessageFlags && MessageFlags.IsComponentsV2 !== undefined;

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
    } catch { /* pemisah bersifat opsional */ }
}

// Menempelkan gambar banner ke dalam wadah
function galeri(c, namaBerkas) {
    if (typeof MediaGalleryBuilder !== 'function' || typeof c.addMediaGalleryComponents !== 'function') return false;
    try {
        const g = new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(`attachment://${namaBerkas}`)
        );
        c.addMediaGalleryComponents(g);
        return true;
    } catch {
        return false;
    }
}

function barisTombol(periode, kategori, nonaktif) {
    if (typeof ButtonBuilder !== 'function') return null;
    try {
        const b = new ButtonBuilder()
            .setCustomId(`${TOMBOL_ID}:${periode}:${kategori}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel(`Lihat peringkat 11 sampai ${TAMPIL.LANJUTAN}`);
        if (nonaktif) b.setDisabled(true);
        return new ActionRowBuilder().addComponents(b);
    } catch {
        return null;
    }
}

// ============================================================
//  UTILITAS
// ============================================================

const angka = n => Number(n || 0).toLocaleString('id-ID');

function labelPeriode(periode) {
    const now = new Date();
    if (periode === 'harian') {
        return `${now.getDate()} ${BULAN[now.getMonth()]} ${now.getFullYear()}`;
    }
    return `${BULAN[now.getMonth()]} ${now.getFullYear()}`;
}

const emojiKategori = k => (k === 'voice' ? EMOJI.voice : EMOJI.chat);
const namaKategori = k => (k === 'voice' ? 'VOICE' : 'CHAT');
const warnaKategori = k => (k === 'voice' ? WARNA.VOICE : WARNA.CHAT);

// Keterangan cara memperoleh poin, ditampilkan di bagian bawah papan
function aturanKategori(kategori) {
    return kategori === 'voice'
        ? `${POIN.VOICE_PER_MENIT} poin setiap ${POIN.VOICE_SETIAP_MENIT} menit berada di voice channel`
        : `${POIN.CHAT_PER_PESAN} poin per pesan di channel general, paling banyak ${POIN.CHAT_BATAS_HARIAN} poin per hari`;
}

// Membandingkan posisi dengan pembaruan sebelumnya
function penandaGerak(sebelumnya, id, posisiSekarang) {
    if (!sebelumnya) return '';
    const lama = sebelumnya.indexOf(id);
    if (lama === -1) return ` ${EMOJI.up}`;
    if (lama > posisiSekarang) return ` ${EMOJI.up}`;
    if (lama < posisiSekarang) return ` ${EMOJI.down}`;
    return ` ${EMOJI.same}`;
}

async function ambilAvatar(client, userId) {
    const u = await client.users.fetch(userId).catch(() => null);
    return u ? u.displayAvatarURL({ extension: 'png', size: 256 }) : null;
}

// ============================================================
//  PENYUSUNAN PAPAN
// ============================================================

async function susunPapan(client, periode, kategori, urutanSebelumnya) {
    const daftar = D.ambilPeringkat(periode, kategori, TAMPIL.EMBED);
    const info = D.ringkasan(periode, kategori);
    const label = labelPeriode(periode);

    const c = wadah(warnaKategori(kategori));

    // judul
    const judul = periode === 'harian'
        ? `## ${EMOJI.trophy} TOP ACTIVE TODAY ${String.fromCharCode(0x2022)} ${namaKategori(kategori)}`
        : `## ${EMOJI.trophy} LEADERBOARD BULANAN ${String.fromCharCode(0x2022)} ${namaKategori(kategori)}`;

    c.addTextDisplayComponents(teks(
        `${judul}\n${EMOJI.calendar} ${label}`
    ));

    pemisah(c);

    // banner
    let berkas = null;
    if (Banner.tersedia() && daftar.length) {
        const tiga = [];
        for (const u of daftar.slice(0, TAMPIL.KANVAS)) {
            tiga.push({ nama: u.nama, poin: u.poin, avatar: await ambilAvatar(client, u.id) });
        }

        const buffer = await Banner.buatBanner({
            kategori,
            periode,
            bulan: new Date(),
            juara: tiga,
        });

        if (buffer) {
            const namaBerkas = `motm-${periode}-${kategori}.png`;
            berkas = new AttachmentBuilder(buffer, { name: namaBerkas });
            if (!galeri(c, namaBerkas)) berkas = null;
            if (berkas) pemisah(c);
        }
    }

    // daftar peringkat
    if (!daftar.length) {
        c.addTextDisplayComponents(teks(
            `${EMOJI.arrow} Belum ada aktivitas yang tercatat pada periode ini.`
        ));
    } else {
        const baris = daftar.map((u, i) => {
            const gerak = penandaGerak(urutanSebelumnya, u.id, i);
            return `${rankEmoji(i + 1)} <@${u.id}>${gerak}\n${EMOJI.arrow} ${angka(u.poin)} poin`;
        }).join('\n\n');

        c.addTextDisplayComponents(teks(baris));
    }

    pemisah(c);

    // keterangan
    const waktu = `<t:${Math.floor(Date.now() / 1000)}:R>`;
    const keterangan =
        `${EMOJI.chart} ${angka(info.peserta)} peserta ${String.fromCharCode(0x2022)} ${angka(info.totalPoin)} poin terkumpul\n` +
        `${EMOJI.clock} Diperbarui ${waktu}\n` +
        `${EMOJI.arrow} ${aturanKategori(kategori)}`;

    c.addTextDisplayComponents(teks(
        periode === 'harian' ? `${EMOJI.live} Diperbarui otomatis\n${keterangan}` : keterangan
    ));

    // tombol peringkat lanjutan
    const row = barisTombol(periode, kategori, daftar.length <= TAMPIL.EMBED
        && D.ambilPeringkat(periode, kategori, TAMPIL.LANJUTAN).length <= TAMPIL.EMBED);
    if (row && typeof c.addActionRowComponents === 'function') {
        try { c.addActionRowComponents(row); } catch { /* tombol opsional */ }
    }

    const payload = {
        components: [c],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    };
    if (berkas) payload.files = [berkas];

    return { payload, urutan: daftar.map(u => u.id) };
}

// ============================================================
//  PENGIRIMAN DAN PEMBARUAN
// ============================================================

// Menyimpan urutan terakhir agar penanda naik turun bisa dihitung,
// sekaligus menghindari penyuntingan bila tidak ada perubahan sama sekali.
const urutanTerakhir = new Map();

function kunciPapan(periode, kategori) {
    return `${periode}:${kategori}`;
}

async function kirimPapan(client, channelId, periode, kategori) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
        console.error(`[MOTM] channel ${channelId} tidak ditemukan`);
        return null;
    }

    const kunci = kunciPapan(periode, kategori);
    const { payload, urutan } = await susunPapan(client, periode, kategori, urutanTerakhir.get(kunci));

    const pesan = await channel.send(payload).catch(err => {
        console.error(`[MOTM] gagal mengirim papan ${kunci}:`, err.message);
        return null;
    });

    if (pesan) {
        urutanTerakhir.set(kunci, urutan);
        D.setPapan(kunci, {
            channelId,
            messageId: pesan.id,
            hari: D.kunciHari(),
            bulan: D.kunciBulan(),
        });
    }

    return pesan;
}

async function perbaruiPapan(client, periode, kategori) {
    const kunci = kunciPapan(periode, kategori);
    const catatan = D.ambilPapan(kunci);
    if (!catatan) return false;

    const channel = await client.channels.fetch(catatan.channelId).catch(() => null);
    if (!channel) { D.hapusPapan(kunci); return false; }

    const pesan = await channel.messages.fetch(catatan.messageId).catch(() => null);
    if (!pesan) { D.hapusPapan(kunci); return false; }

    const sebelumnya = urutanTerakhir.get(kunci);
    const { payload, urutan } = await susunPapan(client, periode, kategori, sebelumnya);

    // Bila susunan peringkat sama sekali tidak berubah, penyuntingan dilewati
    // agar tidak membuang panggilan ke Discord.
    if (sebelumnya && sebelumnya.length === urutan.length && sebelumnya.every((v, i) => v === urutan[i])) {
        const info = D.ringkasan(periode, kategori);
        const terakhir = urutanTerakhir.get(kunci + ':poin');
        if (terakhir === info.totalPoin) return false;
        urutanTerakhir.set(kunci + ':poin', info.totalPoin);
    } else {
        urutanTerakhir.set(kunci + ':poin', D.ringkasan(periode, kategori).totalPoin);
    }

    const ok = await pesan.edit(payload).then(() => true).catch(err => {
        console.error(`[MOTM] gagal memperbarui papan ${kunci}:`, err.message);
        return false;
    });

    if (ok) urutanTerakhir.set(kunci, urutan);
    return ok;
}

// ============================================================
//  TOMBOL PERINGKAT LANJUTAN
// ============================================================

async function handleTombol(interaction) {
    if (!interaction.isButton?.()) return;
    if (!interaction.customId?.startsWith(TOMBOL_ID)) return;

    const [, periode, kategori] = interaction.customId.split(':');

    const semua = D.ambilPeringkat(periode, kategori, TAMPIL.LANJUTAN);
    const lanjutan = semua.slice(TAMPIL.EMBED);

    const c = wadah(warnaKategori(kategori));
    c.addTextDisplayComponents(teks(
        `## ${EMOJI.trophy} Peringkat ${TAMPIL.EMBED + 1} sampai ${TAMPIL.LANJUTAN}\n` +
        `${emojiKategori(kategori)} ${namaKategori(kategori)} ${String.fromCharCode(0x2022)} ${labelPeriode(periode)}`
    ));
    pemisah(c);

    if (!lanjutan.length) {
        c.addTextDisplayComponents(teks(
            `${EMOJI.arrow} Belum ada peserta di luar peringkat ${TAMPIL.EMBED} besar.`
        ));
    } else {
        const baris = lanjutan
            .map((u, i) => `**${TAMPIL.EMBED + i + 1}.** <@${u.id}> ${EMOJI.arrow} ${angka(u.poin)} poin`)
            .join('\n');
        c.addTextDisplayComponents(teks(baris));
    }

    // posisi penekan tombol, agar mereka tahu ada di peringkat berapa
    const posisi = D.posisiUser(interaction.user.id, periode, kategori);
    pemisah(c);
    c.addTextDisplayComponents(teks(
        posisi.posisi
            ? `${EMOJI.chart} Posisi kamu: **${posisi.posisi}** dari ${angka(posisi.total)} peserta dengan ${angka(posisi.poin)} poin`
            : `${EMOJI.chart} Kamu belum masuk hitungan pada periode ini`
    ));

    await interaction.reply({
        components: [c],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
    }).catch(() => null);
}

// ============================================================
//  ROLE PEMENANG
// ============================================================

// Memberikan role juara kepada tiga peringkat teratas pada masing masing
// kategori, lalu mencabutnya dari pemenang sebelumnya yang tidak lagi masuk.
async function segarkanRoleJuara(guild, pemenangBaru) {
    if (!guild || !ROLE.JUARA) return { diberi: [], dicabut: [] };

    const role = guild.roles.cache.get(ROLE.JUARA);
    if (!role) {
        console.error('[MOTM] role juara tidak ditemukan:', ROLE.JUARA);
        return { diberi: [], dicabut: [] };
    }

    const me = guild.members.me;
    if (!me?.permissions?.has?.('ManageRoles') && !me?.permissions?.has?.(1n << 28n)) {
        console.error('[MOTM] bot tidak punya izin Manage Roles');
        return { diberi: [], dicabut: [] };
    }
    if (role.position >= me.roles.highest.position) {
        console.error('[MOTM] posisi role bot harus di atas role juara');
        return { diberi: [], dicabut: [] };
    }

    const harusPunya = new Set(pemenangBaru);
    const diberi = [];
    const dicabut = [];

    // cabut dari yang tidak lagi termasuk
    const pemegang = role.members;
    if (pemegang) {
        for (const [id, member] of pemegang) {
            if (!harusPunya.has(id)) {
                const ok = await member.roles.remove(role.id, 'Bukan pemenang bulan berjalan').then(() => true).catch(() => false);
                if (ok) dicabut.push(id);
            }
        }
    }

    // berikan kepada pemenang baru
    for (const id of harusPunya) {
        const member = await guild.members.fetch(id).catch(() => null);
        if (!member) continue;
        if (member.roles.cache.has(role.id)) continue;

        const ok = await member.roles.add(role.id, 'Pemenang Member of the Month').then(() => true).catch(() => false);
        if (ok) diberi.push(id);
    }

    return { diberi, dicabut };
}

module.exports = {
    susunPapan,
    kirimPapan,
    perbaruiPapan,
    handleTombol,
    segarkanRoleJuara,
    kunciPapan,
    urutanTerakhir,
    adaV2,
    TOMBOL_ID,
};
