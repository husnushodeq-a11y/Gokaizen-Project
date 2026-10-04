// utils/gosmartCommands.js
// Command dan tombol untuk lomba GO SMART.
//
// Dipakai oleh:
//   events/gosmartCommand.js     -> handleMessage
//   events/gosmartInteraction.js -> handleInteraction

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    PermissionsBitField,
} = require('discord.js');

const C = require('./gosmartConfig');
const D = require('./gosmartData');
const S = require('./gosmartSoal');
const E = require('./gosmartEngine');

const {
    WARNA, EMOJI, BABAK, URUTAN_BABAK, LABEL_PILIHAN,
    ROLE_PENGELOLA, BATAS_PESERTA, nomorPeringkat,
} = C;

const PREFIX = 'g!';
const COMMAND = ['gosmart', 'gs', 'cerdascermat'];

const angka = E.angka;

// ============================================================
//  IZIN
// ============================================================

function bolehKelola(member) {
    if (!member) return false;
    if (member.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) return true;
    return ROLE_PENGELOLA.some(id => member.roles?.cache?.has(id));
}

// ============================================================
//  TAMPILAN
// ============================================================

function susun(warna, bagian) {
    const c = E.wadah(warna);
    bagian.forEach((isi, i) => {
        c.addTextDisplayComponents(E.teks(isi));
        if (i < bagian.length - 1) E.pemisah(c);
    });
    return E.muatan(c);
}

const balas = (message, warna, ...bagian) =>
    message.reply(susun(warna, bagian)).catch(() => null);

const jawab = (interaction, warna, ...bagian) =>
    interaction.reply({
        ...susun(warna, bagian),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    }).catch(() => null);

// ============================================================
//  PANEL PENDAFTARAN
// ============================================================

function barisPendaftaran(tutup) {
    try {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('gs_daftar')
                .setLabel('Ikut Lomba')
                .setStyle(ButtonStyle.Success)
                .setDisabled(Boolean(tutup)),
            new ButtonBuilder()
                .setCustomId('gs_batal')
                .setLabel('Batal Ikut')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(Boolean(tutup)),
        );
    } catch {
        return null;
    }
}

function susunPanel(a) {
    const tutup = a.status !== 'pendaftaran';
    const c = E.wadah(WARNA.UTAMA);
    const jumlah = Object.keys(a.peserta).length;

    c.addTextDisplayComponents(E.teks(
        `## ${EMOJI.trophy} GO SMART\n` +
        `${EMOJI.calendar} Cerdas cermat GO KAIZEN\n\n` +
        (tutup
            ? 'Pendaftaran sudah ditutup.'
            : 'Terbuka untuk seluruh anggota. Tekan **Ikut Lomba** untuk mendaftar.')
    ));

    E.pemisah(c);

    c.addTextDisplayComponents(E.teks(
        `${EMOJI.chart} **SUSUNAN BABAK**\n` +
        URUTAN_BABAK.map(b => {
            const x = BABAK[b];
            return `${EMOJI.arrow} **${x.nama}** ${String.fromCharCode(0x2022)} ${x.jumlahSoal} soal ${String.fromCharCode(0x2022)} ${x.detik} detik per soal` +
                (x.lolos ? `\n${x.lolos} teratas lolos` : '\nperebutan juara');
        }).join('\n\n')
    ));

    E.pemisah(c);

    c.addTextDisplayComponents(E.teks(
        `${EMOJI.medal} **CARA MENILAI**\n` +
        `${EMOJI.arrow} Jawaban benar ${C.NILAI.BENAR} poin\n` +
        `${EMOJI.arrow} Bonus kecepatan sisa detik dikali ${C.NILAI.BONUS_PER_DETIK}\n` +
        `${EMOJI.arrow} Jawaban terkunci setelah ditekan dan tidak dapat diubah`
    ));

    E.pemisah(c);

    c.addTextDisplayComponents(E.teks(
        `${EMOJI.chart} **${angka(jumlah)} peserta terdaftar**\n` +
        `${EMOJI.clock} Diperbarui <t:${Math.floor(Date.now() / 1000)}:R>`
    ));

    const baris = barisPendaftaran(tutup);
    if (baris && typeof c.addActionRowComponents === 'function') {
        try { c.addActionRowComponents(baris); } catch { /* tombol opsional */ }
    }

    return E.muatan(c);
}

async function perbaruiPanel(client, a) {
    if (!a.panelId) return false;
    const channel = await client.channels.fetch(a.channelId).catch(() => null);
    if (!channel) return false;
    const pesan = await channel.messages.fetch(a.panelId).catch(() => null);
    if (!pesan) return false;
    return pesan.edit(susunPanel(a)).then(() => true).catch(() => false);
}

// ============================================================
//  COMMAND
// ============================================================

function bantuan() {
    return [
        `## ${EMOJI.trophy} GO SMART`,

        `**Persiapan**\n` +
        `${EMOJI.arrow} \`${PREFIX}gosmart cek\` periksa kesiapan bank soal dan sistem\n` +
        `${EMOJI.arrow} \`${PREFIX}gosmart mulai\` pasang panel pendaftaran di channel ini\n` +
        `${EMOJI.arrow} \`${PREFIX}gosmart peserta\` lihat daftar peserta terdaftar`,

        `**Menjalankan lomba**\n` +
        `${EMOJI.arrow} \`${PREFIX}gosmart babak <penyisihan|semifinal|final>\` siapkan babak\n` +
        `${EMOJI.arrow} \`${PREFIX}gosmart soal\` tampilkan soal berikutnya\n` +
        `${EMOJI.arrow} \`${PREFIX}gosmart stop\` tutup soal yang sedang berjalan lebih cepat\n` +
        `${EMOJI.arrow} \`${PREFIX}gosmart papan\` tampilkan papan nilai\n` +
        `${EMOJI.arrow} \`${PREFIX}gosmart saring\` saring peserta ke babak berikutnya`,

        `**Penutup**\n` +
        `${EMOJI.arrow} \`${PREFIX}gosmart juara\` umumkan pemenang\n` +
        `${EMOJI.arrow} \`${PREFIX}gosmart status\` lihat keadaan acara sekarang\n` +
        `${EMOJI.arrow} \`${PREFIX}gosmart reset\` hapus acara dan mulai dari awal`,

        `**Urutan menjalankan**\n` +
        `cek, mulai, babak penyisihan, lalu soal berulang kali sampai habis, ` +
        `saring, babak semifinal, dan seterusnya sampai juara.`,
    ];
}

async function cmdCek(message) {
    const ringkas = S.ringkasanSoal();
    const cukup = S.periksaKecukupan(BABAK);

    const bagian = [`## ${EMOJI.chart} Pemeriksaan Kesiapan`];

    bagian.push(
        `**Bank Soal**\n` +
        `${EMOJI.arrow} Total soal sah: ${ringkas.sah}` +
        (ringkas.rusak ? `\n${EMOJI.arrow} Soal bermasalah: ${ringkas.rusak}` : '') + '\n' +
        Object.entries(ringkas.perKategori)
            .map(([k, v]) => `${EMOJI.arrow} ${k}: ${v} soal`).join('\n')
    );

    bagian.push(
        `**Kebutuhan Seluruh Acara**\n` +
        `${EMOJI.arrow} Dibutuhkan ${cukup.totalButuh} soal untuk tiga babak\n` +
        Object.entries(cukup.butuhTotal)
            .map(([k, v]) => {
                const punya = ringkas.perKategori[k] || 0;
                return `${EMOJI.arrow} ${k}: butuh ${v}, tersedia ${punya}` + (punya >= v ? '' : ' **KURANG**');
            }).join('\n')
    );

    if (cukup.kurang.length) {
        bagian.push(
            `${EMOJI.arrow} **Bank soal belum cukup**\n` +
            cukup.kurang.map(k => `${EMOJI.arrow} Tambahkan ${k.kurang} soal kategori ${k.kategori}`).join('\n') +
            `\n\nSoal ditambahkan pada berkas \`utils/gosmartSoal.js\`. ` +
            `Soal tidak boleh diulang antar babak, sebab peserta yang lolos sudah melihatnya.`
        );
    } else {
        bagian.push(`${EMOJI.arrow} Bank soal cukup untuk seluruh acara tanpa pengulangan.`);
    }

    const a = D.acara(message.guildId);
    bagian.push(
        `**Keadaan Acara**\n` +
        (a
            ? `${EMOJI.arrow} Ada acara berjalan di <#${a.channelId}>\n` +
              `${EMOJI.arrow} Status: ${a.status}\n` +
              `${EMOJI.arrow} Peserta: ${Object.keys(a.peserta).length}`
            : `${EMOJI.arrow} Belum ada acara. Mulai dengan \`${PREFIX}gosmart mulai\`.`)
    );

    await message.channel.send(susun(WARNA.PAPAN, bagian)).catch(() => null);
}

async function cmdMulai(message) {
    const lama = D.acara(message.guildId);
    if (lama) {
        return balas(message, WARNA.SALAH,
            `## Sudah Ada Acara`,
            `Acara sedang berjalan di <#${lama.channelId}> dengan status **${lama.status}**.\n` +
            `Hapus dulu dengan \`${PREFIX}gosmart reset\` bila ingin memulai dari awal.`);
    }

    const a = D.buatAcara(message.guildId, message.channelId, message.author.id);
    const pesan = await message.channel.send(susunPanel(a)).catch(() => null);

    if (!pesan) {
        D.hapusAcara(message.guildId);
        return balas(message, WARNA.SALAH, 'Gagal memasang panel. Periksa izin bot di channel ini.');
    }

    a.panelId = pesan.id;
    D.simpan();

    await message.delete().catch(() => null);
    console.log(`[GOSMART] acara dibuka oleh ${message.author.tag}`);
}

async function cmdBabak(message, args) {
    const a = D.acara(message.guildId);
    if (!a) return balas(message, WARNA.SALAH, `Belum ada acara. Mulai dengan \`${PREFIX}gosmart mulai\`.`);

    const nama = (args[0] || '').toLowerCase();
    if (!BABAK[nama]) {
        return balas(message, WARNA.SOAL,
            `## Cara Pakai`,
            `\`${PREFIX}gosmart babak <penyisihan|semifinal|final>\``);
    }

    const cfg = BABAK[nama];
    const peserta = D.pesertaAktif(a);

    if (!peserta.length) {
        return balas(message, WARNA.SALAH, 'Belum ada peserta yang terdaftar.');
    }

    const soal = S.ambilSoal(nama, cfg.jumlahSoal, a.soalDipakai);
    if (soal.length < cfg.jumlahSoal) {
        return balas(message, WARNA.SALAH,
            `## Soal Tidak Cukup`,
            `Babak ini membutuhkan ${cfg.jumlahSoal} soal, tetapi hanya tersedia ${soal.length} ` +
            `yang belum terpakai.\n\nTambahkan soal pada \`utils/gosmartSoal.js\`, ` +
            `lalu periksa lagi dengan \`${PREFIX}gosmart cek\`.`);
    }

    D.mulaiBabak(a, nama, soal);
    await perbaruiPanel(message.client, a);

    await message.channel.send(susun(WARNA.UTAMA, [
        `## ${EMOJI.trophy} BABAK ${cfg.nama}`,
        `${EMOJI.arrow} ${cfg.keterangan}\n` +
        `${EMOJI.arrow} ${cfg.jumlahSoal} soal, ${cfg.detik} detik setiap soal\n` +
        `${EMOJI.arrow} ${peserta.length} peserta bermain` +
        (cfg.lolos ? `\n${EMOJI.arrow} ${cfg.lolos} teratas akan lolos ke babak berikutnya` : `\n${EMOJI.arrow} Babak penentuan juara`),
        `Pengelola menekan \`${PREFIX}gosmart soal\` untuk memulai soal pertama.`,
    ])).catch(() => null);
}

async function cmdSoal(message) {
    const a = D.acara(message.guildId);
    if (!a) return balas(message, WARNA.SALAH, 'Belum ada acara.');
    if (!a.babak) return balas(message, WARNA.SALAH, `Siapkan babak dulu dengan \`${PREFIX}gosmart babak <nama>\`.`);

    if (a.status === 'soal' && a.soalAktif && !a.soalAktif.selesai) {
        return balas(message, WARNA.SALAH,
            'Masih ada soal yang berjalan. Tunggu waktunya habis, atau tutup lebih cepat dengan ' +
            `\`${PREFIX}gosmart stop\`.`);
    }

    if (!D.adaSoalBerikutnya(a)) {
        const cfg = BABAK[a.babak];
        return balas(message, WARNA.PAPAN,
            `## Soal Babak Ini Sudah Habis`,
            `${EMOJI.arrow} Seluruh ${a.daftarSoal.length} soal sudah dimainkan\n` +
            (cfg?.lolos
                ? `${EMOJI.arrow} Lanjutkan dengan \`${PREFIX}gosmart saring\``
                : `${EMOJI.arrow} Umumkan pemenang dengan \`${PREFIX}gosmart juara\``));
    }

    const hasil = await E.jalankanSoal(message.client, a, async () => {
        // setelah soal berakhir, papan nilai ditampilkan sendiri
        const channel = await message.client.channels.fetch(a.channelId).catch(() => null);
        if (!channel) return;

        await channel.send(E.susunPapan(a, 'PAPAN NILAI SEMENTARA')).catch(() => null);

        const sisa = a.daftarSoal.length - a.soalKe;
        const cfg = BABAK[a.babak];
        const lanjut = sisa > 0
            ? `${EMOJI.arrow} Sisa ${sisa} soal. Pengelola menekan \`${PREFIX}gosmart soal\` untuk melanjutkan.`
            : (cfg?.lolos
                ? `${EMOJI.arrow} Babak selesai. Lanjutkan dengan \`${PREFIX}gosmart saring\`.`
                : `${EMOJI.arrow} Babak selesai. Umumkan pemenang dengan \`${PREFIX}gosmart juara\`.`);

        await channel.send(susun(WARNA.PAPAN, [lanjut])).catch(() => null);
    });

    if (!hasil.ok) {
        return balas(message, WARNA.SALAH, `Gagal menampilkan soal: ${hasil.alasan}`);
    }

    await message.delete().catch(() => null);
}

async function cmdStop(message) {
    const a = D.acara(message.guildId);
    if (!a) return balas(message, WARNA.SALAH, 'Belum ada acara.');

    const hasil = await E.tutupPaksa(message.client, a);
    if (!hasil) return balas(message, WARNA.SALAH, 'Tidak ada soal yang sedang berjalan.');

    await balas(message, WARNA.PAPAN,
        `## Soal Ditutup Lebih Cepat`,
        `${EMOJI.arrow} Benar ${hasil.benar.length} ${String.fromCharCode(0x2022)} ` +
        `Salah ${hasil.salah.length} ${String.fromCharCode(0x2022)} ` +
        `Tidak menjawab ${hasil.tidakJawab.length}`);

    const channel = await message.client.channels.fetch(a.channelId).catch(() => null);
    if (channel) await channel.send(E.susunPapan(a, 'PAPAN NILAI SEMENTARA')).catch(() => null);
}

async function cmdPapan(message) {
    const a = D.acara(message.guildId);
    if (!a) return balas(message, WARNA.SALAH, 'Belum ada acara.');
    await message.channel.send(E.susunPapan(a, 'PAPAN NILAI', 15)).catch(() => null);
}

async function cmdSaring(message) {
    const a = D.acara(message.guildId);
    if (!a) return balas(message, WARNA.SALAH, 'Belum ada acara.');
    if (!a.babak) return balas(message, WARNA.SALAH, 'Belum ada babak yang berjalan.');

    const cfg = BABAK[a.babak];
    if (!cfg.lolos) {
        return balas(message, WARNA.SALAH,
            'Babak ini adalah babak terakhir. Umumkan pemenang dengan ' +
            `\`${PREFIX}gosmart juara\`.`);
    }

    if (D.adaSoalBerikutnya(a)) {
        return balas(message, WARNA.SALAH,
            `Masih ada ${a.daftarSoal.length - a.soalKe} soal yang belum dimainkan pada babak ini.`);
    }

    const hasil = D.saring(a, cfg.lolos);
    const berikut = BABAK[cfg.berikutnya];

    const daftar = hasil.lolos.slice(0, 20).map((p, i) =>
        `${nomorPeringkat(i + 1)} ${E.namaPeserta(p)} ${EMOJI.arrow} ${angka(p.nilai)} poin`
    ).join('\n');

    await message.channel.send(susun(WARNA.BENAR, [
        `## ${EMOJI.trophy} PESERTA YANG LOLOS`,
        `${EMOJI.arrow} ${hasil.lolos.length} peserta melaju ke babak ${berikut?.nama || cfg.berikutnya}\n` +
        `${EMOJI.arrow} ${hasil.gugur} peserta berhenti sampai di sini`,
        daftar || 'tidak ada',
        `Lanjutkan dengan \`${PREFIX}gosmart babak ${cfg.berikutnya}\`.`,
    ])).catch(() => null);
}

async function cmdJuara(message) {
    const a = D.acara(message.guildId);
    if (!a) return balas(message, WARNA.SALAH, 'Belum ada acara.');

    const urut = D.peringkat(a);
    if (!urut.length) return balas(message, WARNA.SALAH, 'Tidak ada peserta.');

    a.status = 'selesai';
    D.simpan();

    const tigaBesar = urut.slice(0, 3).map((p, i) =>
        `${nomorPeringkat(i + 1)} **${E.namaPeserta(p)}**\n` +
        `${EMOJI.arrow} ${angka(p.nilai)} poin ${String.fromCharCode(0x2022)} ${p.benar} benar ${String.fromCharCode(0x2022)} ${p.salah} salah`
    ).join('\n\n');

    const sisa = urut.slice(3, 8);
    const bagian = [
        `## ${EMOJI.crown} JUARA GO SMART\n${EMOJI.calendar} Cerdas cermat GO KAIZEN`,
        tigaBesar,
    ];

    if (sisa.length) {
        bagian.push(
            `${EMOJI.medal} **PERINGKAT BERIKUTNYA**\n` +
            sisa.map((p, i) => `${nomorPeringkat(i + 4)} ${E.namaPeserta(p)} ${EMOJI.arrow} ${angka(p.nilai)} poin`).join('\n')
        );
    }

    bagian.push(
        `Terima kasih kepada seluruh peserta yang sudah meramaikan.\n` +
        `Hadiah akan disampaikan oleh pengelola acara.`
    );

    await message.channel.send(susun(WARNA.JUARA, bagian)).catch(() => null);
    await perbaruiPanel(message.client, a);
}

async function cmdPeserta(message) {
    const a = D.acara(message.guildId);
    if (!a) return balas(message, WARNA.SALAH, 'Belum ada acara.');

    const semua = Object.values(a.peserta);
    const aktif = semua.filter(p => p.aktif);

    if (!semua.length) {
        return balas(message, WARNA.PAPAN, `## Peserta`, 'Belum ada yang mendaftar.');
    }

    const daftar = aktif.slice(0, 40).map((p, i) => `${i + 1}. ${E.namaPeserta(p)}`).join('\n');

    await message.channel.send(susun(WARNA.PAPAN, [
        `## ${EMOJI.chart} Peserta Terdaftar`,
        `${EMOJI.arrow} Terdaftar: ${semua.length}\n${EMOJI.arrow} Masih bermain: ${aktif.length}`,
        daftar + (aktif.length > 40 ? `\n\ndan ${aktif.length - 40} lainnya` : ''),
    ])).catch(() => null);
}

async function cmdStatus(message) {
    const a = D.acara(message.guildId);
    if (!a) {
        return balas(message, WARNA.PAPAN, `## Status`, `Belum ada acara. Mulai dengan \`${PREFIX}gosmart mulai\`.`);
    }

    const cfg = BABAK[a.babak];
    await message.channel.send(susun(WARNA.PAPAN, [
        `## ${EMOJI.chart} Status Acara`,
        `${EMOJI.arrow} Channel: <#${a.channelId}>\n` +
        `${EMOJI.arrow} Status: **${a.status}**\n` +
        `${EMOJI.arrow} Babak: ${cfg ? cfg.nama : 'belum dimulai'}\n` +
        `${EMOJI.arrow} Soal: ${a.soalKe} dari ${a.daftarSoal.length}\n` +
        `${EMOJI.arrow} Peserta terdaftar: ${Object.keys(a.peserta).length}\n` +
        `${EMOJI.arrow} Masih bermain: ${D.pesertaAktif(a).length}\n` +
        `${EMOJI.arrow} Soal terpakai sepanjang acara: ${a.soalDipakai.length}`,
    ])).catch(() => null);
}

async function cmdReset(message, args) {
    const a = D.acara(message.guildId);
    if (!a) return balas(message, WARNA.SALAH, 'Tidak ada acara yang berjalan.');

    if (args[0]?.toUpperCase() !== 'YAKIN') {
        return balas(message, WARNA.SALAH,
            `## Menghapus Acara`,
            `Seluruh nilai dan daftar peserta akan hilang dan tidak dapat dikembalikan.\n\n` +
            `${EMOJI.arrow} Peserta: ${Object.keys(a.peserta).length}\n` +
            `${EMOJI.arrow} Babak: ${a.babak || 'belum dimulai'}`,
            `Untuk melanjutkan, ketik \`${PREFIX}gosmart reset YAKIN\`.`);
    }

    E.hentikanPewaktu(message.guildId);
    D.hapusAcara(message.guildId);

    await balas(message, WARNA.BENAR, `## Acara Dihapus`, `Mulai lagi dengan \`${PREFIX}gosmart mulai\`.`);
}

// ============================================================
//  PENYALUR COMMAND
// ============================================================

async function handleMessage(message) {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();
        if (!COMMAND.includes(command)) return;

        if (!bolehKelola(message.member)) return;

        const anak = args.shift()?.toLowerCase();

        switch (anak) {
            case 'cek': case 'check': return cmdCek(message);
            case 'mulai': case 'start': return cmdMulai(message);
            case 'babak': case 'round': return cmdBabak(message, args);
            case 'soal': case 'next': return cmdSoal(message);
            case 'stop': case 'tutup': return cmdStop(message);
            case 'papan': case 'nilai': return cmdPapan(message);
            case 'saring': case 'filter': return cmdSaring(message);
            case 'juara': case 'winner': return cmdJuara(message);
            case 'peserta': return cmdPeserta(message);
            case 'status': return cmdStatus(message);
            case 'reset': return cmdReset(message, args);
            default:
                return message.channel.send(susun(WARNA.UTAMA, bantuan())).catch(() => null);
        }
    } catch (err) {
        console.error('[GOSMART] galat command:', err);
        balas(message, WARNA.SALAH, `Terjadi kesalahan: ${err.message}`);
    }
}

// ============================================================
//  TOMBOL
// ============================================================

async function handleInteraction(interaction) {
    try {
        if (!interaction.isButton?.()) return;
        if (!interaction.customId?.startsWith('gs_')) return;

        const a = D.acara(interaction.guildId);
        if (!a) return jawab(interaction, WARNA.SALAH, 'Acara ini sudah tidak ada.');

        // pendaftaran
        if (interaction.customId === 'gs_daftar') {
            if (a.status !== 'pendaftaran') {
                return jawab(interaction, WARNA.SALAH, 'Pendaftaran sudah ditutup.');
            }
            if (Object.keys(a.peserta).length >= BATAS_PESERTA) {
                return jawab(interaction, WARNA.SALAH, `Peserta sudah penuh, batasnya ${BATAS_PESERTA} orang.`);
            }

            const nama = interaction.member?.displayName || interaction.user?.username;
            const hasil = D.daftarkan(a, interaction.user.id, nama);

            if (!hasil.baru) {
                return jawab(interaction, WARNA.PAPAN, 'Kamu sudah terdaftar sebagai peserta.');
            }

            await perbaruiPanel(interaction.client, a);
            return jawab(interaction, WARNA.BENAR,
                `## Berhasil Mendaftar`,
                `${EMOJI.arrow} Kamu terdaftar sebagai peserta ke **${Object.keys(a.peserta).length}**\n` +
                `${EMOJI.arrow} Tunggu pengelola memulai babak pertama\n\n` +
                `Ingat, jawaban terkunci setelah ditekan. Pilih dengan yakin.`);
        }

        if (interaction.customId === 'gs_batal') {
            if (a.status !== 'pendaftaran') {
                return jawab(interaction, WARNA.SALAH, 'Pendaftaran sudah ditutup, tidak bisa membatalkan.');
            }
            const ok = D.batalkan(a, interaction.user.id);
            if (!ok) return jawab(interaction, WARNA.SALAH, 'Kamu belum terdaftar.');

            await perbaruiPanel(interaction.client, a);
            return jawab(interaction, WARNA.BENAR, 'Pendaftaran kamu dibatalkan.');
        }

        // menjawab soal
        if (interaction.customId.startsWith('gs_jawab:')) {
            const pilihan = Number(interaction.customId.split(':')[1]);

            const peserta = a.peserta[interaction.user.id];
            if (!peserta) {
                return jawab(interaction, WARNA.SALAH,
                    'Kamu tidak terdaftar sebagai peserta lomba ini.');
            }
            if (!peserta.aktif) {
                return jawab(interaction, WARNA.SALAH,
                    'Kamu sudah tidak bermain pada babak ini. Terima kasih sudah ikut serta.');
            }

            const hasil = D.catatJawaban(a, interaction.user.id, pilihan);

            if (!hasil.ok && hasil.alasan === 'sudah') {
                return jawab(interaction, WARNA.SALAH,
                    'Kamu sudah menjawab soal ini. Jawaban tidak dapat diubah.');
            }
            if (!hasil.ok) {
                return jawab(interaction, WARNA.SALAH, 'Waktu menjawab sudah habis.');
            }

            return jawab(interaction, WARNA.BENAR,
                `## Jawaban Terkirim`,
                `${EMOJI.arrow} Pilihan kamu: **${LABEL_PILIHAN[pilihan]}**\n` +
                `${EMOJI.arrow} Waktu: ${(hasil.waktuMs / 1000).toFixed(1)} detik\n\n` +
                `Hasilnya diumumkan setelah waktu habis.`);
        }
    } catch (err) {
        console.error('[GOSMART] galat tombol:', err);
    }
}

module.exports = { handleMessage, handleInteraction, susunPanel, bolehKelola };
