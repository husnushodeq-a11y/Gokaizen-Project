// utils/antrianSystem.js
// Antrian untuk tampil di stage atau bernyanyi.
//
// Staff membuka panel di sebuah channel, lalu anggota masuk antrian lewat
// tombol. Panel diperbarui setiap kali antriannya berubah, sehingga semua
// orang melihat urutan yang sama.
//
// Antrian disimpan ke berkas agar tetap ada meskipun bot sempat dimatikan
// di tengah acara.
//
// Dipakai oleh:
//   events/antrianCommand.js     -> handleMessage
//   events/antrianInteraction.js -> handleInteraction

const fs = require('fs');
const path = require('path');

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
    PermissionsBitField,
} = require('discord.js');

// ============================================================
//  KONFIGURASI
// ============================================================

const PREFIX = 'g!';
const COMMAND = ['antrian', 'antre', 'queue'];

// Batas jumlah orang dalam satu antrian
const BATAS_ANTRIAN = 50;

// Berapa banyak nama yang ditampilkan pada panel
const TAMPIL_PANEL = 15;

// Panjang maksimal judul lagu
const MAKS_JUDUL = 80;

const WARNA = {
    BUKA: 0xD31007,
    TAMPIL: 0xE8B923,
    TUTUP: 0x57606A,
    SUKSES: 0x57F287,
    PERINGATAN: 0xED4245,
};

const EMOJI = {
    mic: '<:voice:1533011140672622632>',
    trophy: '<:piala:1532795152572092456>',
    arrow: '<a:arrow:1532795180770660382>',
    clock: '<:clock:1533011216765681664>',
    crown: '<:crown:1533011500610883726>',
    chart: '<:chart:1533011589001908317>',
};

const rankEmoji = {
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

const nomor = i => rankEmoji[i] || `**${i}.**`;

// ============================================================
//  PENYIMPANAN
// ============================================================

const DATA_FILE = path.join(__dirname, '..', 'data', 'antrianData.json');

function muat() {
    try {
        if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        console.error('[ANTRIAN] gagal membaca antrianData.json:', err.message);
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
        console.error('[ANTRIAN] gagal menyimpan antrianData.json:', err.message);
    }
}

const kunci = (guildId, channelId) => `${guildId}:${channelId}`;

function ambilAntrian(guildId, channelId) {
    return db[kunci(guildId, channelId)] || null;
}

function setAntrian(guildId, channelId, data) {
    db[kunci(guildId, channelId)] = data;
    simpan();
}

function hapusAntrian(guildId, channelId) {
    delete db[kunci(guildId, channelId)];
    simpan();
}

// Antrian mana pun di server ini yang masih terbuka
function antrianTerbuka(guildId) {
    return Object.entries(db)
        .filter(([k, v]) => k.startsWith(`${guildId}:`) && !v.tutup)
        .map(([, v]) => v);
}

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

function susun(warna, bagian) {
    const c = wadah(warna);
    bagian.forEach((isi, i) => {
        c.addTextDisplayComponents(teks(isi));
        if (i < bagian.length - 1) pemisah(c);
    });
    return {
        components: [c],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [], repliedUser: false },
    };
}

const balas = (message, warna, ...bagian) =>
    message.reply(susun(warna, bagian)).catch(() => null);

const jawab = (interaction, warna, ...bagian) =>
    interaction.reply({
        ...susun(warna, bagian),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    }).catch(() => null);

// ============================================================
//  PANEL
// ============================================================

function barisTombol(channelId, tutup) {
    const baris = [];

    try {
        baris.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`antri_join:${channelId}`)
                .setLabel('Masuk Antrian')
                .setStyle(ButtonStyle.Success)
                .setDisabled(tutup),
            new ButtonBuilder()
                .setCustomId(`antri_leave:${channelId}`)
                .setLabel('Batal Antrian')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(tutup),
        ));

        baris.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`antri_next:${channelId}`)
                .setLabel('Panggil Berikutnya')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(tutup),
            new ButtonBuilder()
                .setCustomId(`antri_selesai:${channelId}`)
                .setLabel('Selesai Tampil')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(tutup),
            new ButtonBuilder()
                .setCustomId(`antri_tutup:${channelId}`)
                .setLabel(tutup ? 'Sudah Ditutup' : 'Tutup Antrian')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(tutup),
        ));
    } catch {
        return [];
    }

    return baris;
}

function susunPanel(data) {
    const tutup = Boolean(data.tutup);
    const c = wadah(tutup ? WARNA.TUTUP : (data.tampil ? WARNA.TAMPIL : WARNA.BUKA));

    // judul
    c.addTextDisplayComponents(teks(
        `## ${EMOJI.mic} ${data.judul || 'ANTRIAN TAMPIL'}\n` +
        (tutup
            ? 'Antrian sudah ditutup.'
            : 'Tekan tombol di bawah untuk masuk antrian.')
    ));

    pemisah(c);

    // yang sedang tampil
    if (data.tampil) {
        c.addTextDisplayComponents(teks(
            `${EMOJI.crown} **SEDANG TAMPIL**\n` +
            `${EMOJI.arrow} <@${data.tampil.userId}>` +
            (data.tampil.lagu ? `\n${EMOJI.arrow} Membawakan: **${data.tampil.lagu}**` : '') +
            (data.tampil.mulaiAt ? `\n${EMOJI.clock} Mulai <t:${Math.floor(data.tampil.mulaiAt / 1000)}:R>` : '')
        ));
        pemisah(c);
    }

    // daftar antrian
    const antrian = data.antrian || [];
    if (!antrian.length) {
        c.addTextDisplayComponents(teks(
            `${EMOJI.arrow} Antrian masih kosong.` +
            (tutup ? '' : ' Jadilah yang pertama.')
        ));
    } else {
        const tampil = antrian.slice(0, TAMPIL_PANEL);
        const baris = tampil.map((a, i) =>
            `${nomor(i + 1)} <@${a.userId}>` +
            (a.lagu ? `\n${EMOJI.arrow} ${a.lagu}` : '')
        ).join('\n\n');

        let isi = `${EMOJI.trophy} **ANTRIAN (${antrian.length})**\n\n${baris}`;
        if (antrian.length > TAMPIL_PANEL) {
            isi += `\n\n${EMOJI.arrow} dan ${antrian.length - TAMPIL_PANEL} orang lainnya`;
        }
        c.addTextDisplayComponents(teks(isi));
    }

    pemisah(c);

    // keterangan
    const selesai = (data.selesai || []).length;
    c.addTextDisplayComponents(teks(
        `${EMOJI.chart} ${antrian.length} menunggu ${String.fromCharCode(0x2022)} ${selesai} sudah tampil\n` +
        `${EMOJI.clock} Diperbarui <t:${Math.floor(Date.now() / 1000)}:R>` +
        (tutup ? '' : `\n${EMOJI.arrow} Tombol panggil, selesai, dan tutup hanya untuk staff`)
    ));

    // tombol
    const baris = barisTombol(data.channelId, tutup);
    for (const b of baris) {
        if (typeof c.addActionRowComponents === 'function') {
            try { c.addActionRowComponents(b); } catch { /* tombol opsional */ }
        }
    }

    return {
        components: [c],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    };
}

// Memperbarui pesan panel yang terpasang
async function perbaruiPanel(client, data) {
    if (!data?.messageId) return false;

    const channel = await client.channels.fetch(data.channelId).catch(() => null);
    if (!channel) return false;

    const pesan = await channel.messages.fetch(data.messageId).catch(() => null);
    if (!pesan) return false;

    return pesan.edit(susunPanel(data)).then(() => true).catch(err => {
        console.error('[ANTRIAN] gagal memperbarui panel:', err.message);
        return false;
    });
}

// ============================================================
//  TINDAKAN
// ============================================================

const staff = member => member?.permissions?.has(PermissionsBitField.Flags.ModerateMembers);

function posisiDalamAntrian(data, userId) {
    return (data.antrian || []).findIndex(a => a.userId === userId);
}

async function tindakanMasuk(interaction, data, lagu) {
    const userId = interaction.user.id;

    if (data.tutup) {
        return jawab(interaction, WARNA.PERINGATAN, 'Antrian sudah ditutup.');
    }
    if (data.tampil?.userId === userId) {
        return jawab(interaction, WARNA.PERINGATAN, 'Kamu sedang tampil sekarang.');
    }

    const posisi = posisiDalamAntrian(data, userId);
    if (posisi !== -1) {
        return jawab(interaction, WARNA.PERINGATAN,
            `## Sudah di Antrian`,
            `${EMOJI.arrow} Posisi kamu: **${posisi + 1}** dari ${data.antrian.length}\n` +
            `${EMOJI.arrow} Tekan **Batal Antrian** bila ingin keluar.`);
    }

    if ((data.antrian || []).length >= BATAS_ANTRIAN) {
        return jawab(interaction, WARNA.PERINGATAN,
            `Antrian sudah penuh, batasnya ${BATAS_ANTRIAN} orang.`);
    }

    if (!data.antrian) data.antrian = [];
    data.antrian.push({
        userId,
        lagu: lagu ? lagu.slice(0, MAKS_JUDUL) : null,
        at: Date.now(),
    });

    setAntrian(interaction.guildId, data.channelId, data);
    await perbaruiPanel(interaction.client, data);

    const posisiBaru = data.antrian.length;
    await jawab(interaction, WARNA.SUKSES,
        `## Berhasil Masuk Antrian`,
        `${EMOJI.arrow} Posisi kamu: **${posisiBaru}**` +
        (lagu ? `\n${EMOJI.arrow} Lagu: **${lagu.slice(0, MAKS_JUDUL)}**` : '') +
        `\n\nKamu akan disebut ketika giliranmu tiba.`);
}

async function tindakanBatal(interaction, data) {
    const userId = interaction.user.id;
    const posisi = posisiDalamAntrian(data, userId);

    if (posisi === -1) {
        return jawab(interaction, WARNA.PERINGATAN, 'Kamu sedang tidak berada di antrian.');
    }

    data.antrian.splice(posisi, 1);
    setAntrian(interaction.guildId, data.channelId, data);
    await perbaruiPanel(interaction.client, data);

    await jawab(interaction, WARNA.SUKSES,
        `## Keluar dari Antrian`,
        'Kamu sudah dikeluarkan dari antrian. Bisa masuk lagi kapan saja.');
}

async function tindakanBerikutnya(interaction, data) {
    if (!staff(interaction.member)) {
        return jawab(interaction, WARNA.PERINGATAN, 'Tombol ini hanya untuk staff.');
    }

    if (!data.antrian?.length) {
        return jawab(interaction, WARNA.PERINGATAN, 'Antrian sudah kosong.');
    }

    // yang sedang tampil dipindahkan ke daftar selesai
    if (data.tampil) {
        if (!data.selesai) data.selesai = [];
        data.selesai.push({ ...data.tampil, selesaiAt: Date.now() });
    }

    const berikut = data.antrian.shift();
    data.tampil = { ...berikut, mulaiAt: Date.now() };

    setAntrian(interaction.guildId, data.channelId, data);
    await perbaruiPanel(interaction.client, data);

    // pemberitahuan giliran
    const channel = await interaction.client.channels.fetch(data.channelId).catch(() => null);
    if (channel) {
        const sesudah = data.antrian[0];
        let isi = `${EMOJI.crown} Giliran <@${berikut.userId}> untuk tampil` +
            (berikut.lagu ? ` membawakan **${berikut.lagu}**` : '') + '.';
        if (sesudah) isi += `\n${EMOJI.arrow} Bersiap setelahnya: <@${sesudah.userId}>`;

        await channel.send({
            content: `<@${berikut.userId}>` + (sesudah ? ` <@${sesudah.userId}>` : ''),
            embeds: [],
            allowedMentions: { users: [berikut.userId, ...(sesudah ? [sesudah.userId] : [])] },
        }).catch(() => null);

        await channel.send(susun(WARNA.TAMPIL, [isi])).catch(() => null);
    }

    await jawab(interaction, WARNA.SUKSES,
        `## Giliran Dipanggil`,
        `${EMOJI.arrow} Sekarang tampil: <@${berikut.userId}>\n` +
        `${EMOJI.arrow} Sisa antrian: ${data.antrian.length}`);
}

async function tindakanSelesai(interaction, data) {
    if (!staff(interaction.member)) {
        return jawab(interaction, WARNA.PERINGATAN, 'Tombol ini hanya untuk staff.');
    }

    if (!data.tampil) {
        return jawab(interaction, WARNA.PERINGATAN, 'Belum ada yang sedang tampil.');
    }

    if (!data.selesai) data.selesai = [];
    data.selesai.push({ ...data.tampil, selesaiAt: Date.now() });

    const sebelumnya = data.tampil;
    data.tampil = null;

    setAntrian(interaction.guildId, data.channelId, data);
    await perbaruiPanel(interaction.client, data);

    await jawab(interaction, WARNA.SUKSES,
        `## Penampilan Selesai`,
        `${EMOJI.arrow} <@${sebelumnya.userId}> selesai tampil\n` +
        `${EMOJI.arrow} Sisa antrian: ${data.antrian?.length || 0}`);
}

async function tindakanTutup(interaction, data) {
    if (!staff(interaction.member)) {
        return jawab(interaction, WARNA.PERINGATAN, 'Tombol ini hanya untuk staff.');
    }

    data.tutup = true;
    data.tutupAt = Date.now();

    setAntrian(interaction.guildId, data.channelId, data);
    await perbaruiPanel(interaction.client, data);

    const jumlahSelesai = (data.selesai || []).length + (data.tampil ? 1 : 0);
    await jawab(interaction, WARNA.SUKSES,
        `## Antrian Ditutup`,
        `${EMOJI.arrow} Total tampil: ${jumlahSelesai}\n` +
        `${EMOJI.arrow} Belum sempat tampil: ${data.antrian?.length || 0}\n\n` +
        `Buka antrian baru dengan \`${PREFIX}antrian buka\`.`);
}

// ============================================================
//  INTERAKSI
// ============================================================

async function handleInteraction(interaction) {
    try {
        // isian judul lagu
        if (interaction.isModalSubmit?.() && interaction.customId.startsWith('antri_modal:')) {
            const channelId = interaction.customId.split(':')[1];
            const data = ambilAntrian(interaction.guildId, channelId);
            if (!data) return jawab(interaction, WARNA.PERINGATAN, 'Antrian ini sudah tidak ada.');

            let lagu = null;
            try { lagu = interaction.fields.getTextInputValue('judul')?.trim() || null; } catch { lagu = null; }

            return tindakanMasuk(interaction, data, lagu);
        }

        if (!interaction.isButton?.()) return;
        if (!interaction.customId?.startsWith('antri_')) return;

        const [aksi, channelId] = interaction.customId.split(':');
        const data = ambilAntrian(interaction.guildId, channelId);

        if (!data) {
            return jawab(interaction, WARNA.PERINGATAN,
                'Antrian ini sudah tidak ada. Minta staff membuka antrian baru.');
        }

        // tombol masuk membuka isian judul lagu
        if (aksi === 'antri_join') {
            if (data.tutup) return jawab(interaction, WARNA.PERINGATAN, 'Antrian sudah ditutup.');

            const posisi = posisiDalamAntrian(data, interaction.user.id);
            if (posisi !== -1) {
                return jawab(interaction, WARNA.PERINGATAN,
                    `## Sudah di Antrian`,
                    `${EMOJI.arrow} Posisi kamu: **${posisi + 1}** dari ${data.antrian.length}`);
            }

            if (typeof ModalBuilder === 'function' && data.pakaiJudul !== false) {
                try {
                    const modal = new ModalBuilder()
                        .setCustomId(`antri_modal:${channelId}`)
                        .setTitle('Masuk Antrian');

                    const isian = new TextInputBuilder()
                        .setCustomId('judul')
                        .setLabel('Judul lagu atau penampilan')
                        .setPlaceholder('Boleh dikosongkan')
                        .setStyle(TextInputStyle.Short)
                        .setMaxLength(MAKS_JUDUL)
                        .setRequired(false);

                    modal.addComponents(new ActionRowBuilder().addComponents(isian));
                    return interaction.showModal(modal);
                } catch {
                    // bila isian tidak dapat ditampilkan, langsung masuk tanpa judul
                }
            }

            return tindakanMasuk(interaction, data, null);
        }

        if (aksi === 'antri_leave') return tindakanBatal(interaction, data);
        if (aksi === 'antri_next') return tindakanBerikutnya(interaction, data);
        if (aksi === 'antri_selesai') return tindakanSelesai(interaction, data);
        if (aksi === 'antri_tutup') return tindakanTutup(interaction, data);
    } catch (err) {
        console.error('[ANTRIAN] galat interaksi:', err);
    }
}

// ============================================================
//  COMMAND
// ============================================================

function bantuan() {
    return [
        `## ${EMOJI.mic} Antrian Tampil`,

        `**Untuk staff**\n` +
        `${EMOJI.arrow} \`${PREFIX}antrian buka [judul]\` pasang panel antrian di channel ini\n` +
        `${EMOJI.arrow} \`${PREFIX}antrian tanpajudul [judul]\` panel tanpa isian lagu\n` +
        `${EMOJI.arrow} \`${PREFIX}antrian status\` lihat antrian yang sedang berjalan\n` +
        `${EMOJI.arrow} \`${PREFIX}antrian tutup\` tutup antrian di channel ini\n` +
        `${EMOJI.arrow} \`${PREFIX}antrian hapus\` hapus panel beserta catatannya`,

        `**Untuk anggota**\n` +
        `${EMOJI.arrow} Tekan **Masuk Antrian** pada panel, lalu isi judul lagu bila mau\n` +
        `${EMOJI.arrow} Tekan **Batal Antrian** untuk keluar`,

        `**Cara kerja**\n` +
        `${EMOJI.arrow} Panel diperbarui sendiri setiap ada perubahan\n` +
        `${EMOJI.arrow} Staff menekan **Panggil Berikutnya** untuk memanggil giliran\n` +
        `${EMOJI.arrow} Orang yang dipanggil dan yang setelahnya ikut disebut`,
    ];
}

async function cmdBuka(message, args, pakaiJudul) {
    const adaSebelumnya = ambilAntrian(message.guildId, message.channelId);
    if (adaSebelumnya && !adaSebelumnya.tutup) {
        return balas(message, WARNA.PERINGATAN,
            `## Sudah Ada Antrian`,
            `Antrian di channel ini masih berjalan.\n` +
            `Tutup dulu dengan \`${PREFIX}antrian tutup\`, atau hapus dengan \`${PREFIX}antrian hapus\`.`);
    }

    const judul = args.join(' ').trim().slice(0, 60) || 'ANTRIAN TAMPIL';

    const data = {
        guildId: message.guildId,
        channelId: message.channelId,
        judul,
        pakaiJudul,
        dibuatOleh: message.author.id,
        dibuatAt: Date.now(),
        tampil: null,
        antrian: [],
        selesai: [],
        tutup: false,
    };

    const pesan = await message.channel.send(susunPanel(data)).catch(err => {
        console.error('[ANTRIAN] gagal mengirim panel:', err.message);
        return null;
    });

    if (!pesan) {
        return balas(message, WARNA.PERINGATAN, 'Gagal memasang panel. Periksa izin bot di channel ini.');
    }

    data.messageId = pesan.id;
    setAntrian(message.guildId, message.channelId, data);

    await message.delete().catch(() => null);
    console.log(`[ANTRIAN] panel dibuka di ${message.channel.name} oleh ${message.author.tag}`);
}

async function cmdStatus(message) {
    const daftar = antrianTerbuka(message.guildId);

    if (!daftar.length) {
        return balas(message, WARNA.TUTUP,
            `## Tidak Ada Antrian`,
            `Belum ada antrian yang sedang berjalan.\nBuka dengan \`${PREFIX}antrian buka\`.`);
    }

    const bagian = [`## ${EMOJI.mic} Antrian Berjalan`];

    for (const d of daftar) {
        bagian.push(
            `**${d.judul}** di <#${d.channelId}>\n` +
            `${EMOJI.arrow} Sedang tampil: ${d.tampil ? `<@${d.tampil.userId}>` : 'belum ada'}\n` +
            `${EMOJI.arrow} Menunggu: ${d.antrian?.length || 0} orang\n` +
            `${EMOJI.arrow} Sudah tampil: ${d.selesai?.length || 0} orang`
        );
    }

    await message.channel.send(susun(WARNA.BUKA, bagian)).catch(() => null);
}

async function cmdTutup(message) {
    const data = ambilAntrian(message.guildId, message.channelId);
    if (!data) return balas(message, WARNA.PERINGATAN, 'Tidak ada antrian di channel ini.');
    if (data.tutup) return balas(message, WARNA.PERINGATAN, 'Antrian di channel ini sudah ditutup.');

    data.tutup = true;
    data.tutupAt = Date.now();
    setAntrian(message.guildId, message.channelId, data);
    await perbaruiPanel(message.client, data);

    await balas(message, WARNA.SUKSES,
        `## Antrian Ditutup`,
        `${EMOJI.arrow} Sudah tampil: ${(data.selesai || []).length}\n` +
        `${EMOJI.arrow} Belum sempat tampil: ${data.antrian?.length || 0}`);
}

async function cmdHapus(message) {
    const data = ambilAntrian(message.guildId, message.channelId);
    if (!data) return balas(message, WARNA.PERINGATAN, 'Tidak ada antrian di channel ini.');

    if (data.messageId) {
        const pesan = await message.channel.messages.fetch(data.messageId).catch(() => null);
        if (pesan) await pesan.delete().catch(() => null);
    }

    hapusAntrian(message.guildId, message.channelId);
    await balas(message, WARNA.SUKSES, 'Panel antrian dan catatannya sudah dihapus.');
}

async function handleMessage(message) {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();
        if (!COMMAND.includes(command)) return;

        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

        const anak = args.shift()?.toLowerCase();

        if (anak === 'buka' || anak === 'open') return cmdBuka(message, args, true);
        if (anak === 'tanpajudul' || anak === 'polos') return cmdBuka(message, args, false);
        if (anak === 'status') return cmdStatus(message);
        if (anak === 'tutup' || anak === 'close') return cmdTutup(message);
        if (anak === 'hapus' || anak === 'delete') return cmdHapus(message);

        return message.channel.send(susun(WARNA.BUKA, bantuan())).catch(() => null);
    } catch (err) {
        console.error('[ANTRIAN] galat command:', err);
        balas(message, WARNA.PERINGATAN, `Terjadi kesalahan: ${err.message}`);
    }
}

module.exports = {
    handleMessage,
    handleInteraction,
    susunPanel,
    ambilAntrian,
    antrianTerbuka,
};
