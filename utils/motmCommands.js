// utils/motmCommands.js
// Command pengelolaan Member of the Month, memakai awalan g!
//
// Seluruhnya berbentuk satu command induk dengan anak perintah, agar tidak
// memenuhi daftar command dan mudah diingat.
//
// Dipakai oleh events/motmCommands.js

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
    PermissionsBitField,
} = require('discord.js');

const C = require('./motmConfig');
const D = require('./motmData');
const Board = require('./motmBoard');
const Banner = require('./motmBanner');
const Scheduler = require('./motmScheduler');

const { EMOJI, rankEmoji, WARNA, BULAN, TAMPIL, CHANNEL, ROLE, POIN } = C;

const PREFIX = 'g!';
const COMMAND = ['motm', 'topactive'];

const KATEGORI = ['voice', 'chat'];
const PERIODE = ['harian', 'bulanan'];

// ============================================================
//  TAMPILAN
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
    } catch { /* opsional */ }
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

const angka = n => Number(n || 0).toLocaleString('id-ID');

// ============================================================
//  PEMBACAAN ARGUMEN
// ============================================================

function ambilTargetId(message, args) {
    const m = message.mentions.users.first();
    if (m) return m.id;
    const k = args.find(a => /^\d{17,20}$/.test(a.replace(/[<@!>]/g, '')));
    return k ? k.replace(/[<@!>]/g, '') : null;
}

function ambilKategori(args) {
    const k = args.find(a => KATEGORI.includes(a.toLowerCase()));
    return k ? k.toLowerCase() : null;
}

function ambilPeriodeArg(args) {
    const p = args.find(a => PERIODE.includes(a.toLowerCase()));
    return p ? p.toLowerCase() : null;
}

function ambilJumlah(args, targetId) {
    const kandidat = args.find(a => {
        const bersih = a.replace(/[<@!>]/g, '');
        if (bersih === targetId) return false;
        return /^-?\d{1,7}$/.test(a);
    });
    return kandidat ? parseInt(kandidat, 10) : null;
}

function sisaAlasan(args, dipakai) {
    return args.filter(a => !dipakai.includes(a)).join(' ').trim() || null;
}

// ============================================================
//  BANTUAN
// ============================================================

function bantuan() {
    return [
        `## ${EMOJI.trophy} Pengelolaan Member of the Month`,

        `**Papan**\n` +
        `${EMOJI.arrow} \`${PREFIX}motm setup\` pasang papan harian dan bulanan pada channel yang telah diatur\n` +
        `${EMOJI.arrow} \`${PREFIX}motm refresh\` segarkan seluruh papan sekarang juga\n` +
        `${EMOJI.arrow} \`${PREFIX}motm test [harian|bulanan] [voice|chat]\` tampilkan contoh papan di channel ini tanpa menyimpan apa pun`,

        `**Poin**\n` +
        `${EMOJI.arrow} \`${PREFIX}motm add <user> <voice|chat> <jumlah> [alasan]\` tambah poin\n` +
        `${EMOJI.arrow} \`${PREFIX}motm remove <user> <voice|chat> <jumlah> [alasan]\` kurangi poin\n` +
        `${EMOJI.arrow} \`${PREFIX}motm set <user> <voice|chat> <jumlah> [alasan]\` tetapkan poin bulanan\n` +
        `${EMOJI.arrow} \`${PREFIX}motm bonus <user> <voice|chat> <jumlah> [alasan]\` poin tambahan untuk bulan berjalan\n` +
        `${EMOJI.arrow} \`${PREFIX}motm reset <user>\` kosongkan poin bulan berjalan\n` +
        `${EMOJI.arrow} \`${PREFIX}motm resetall\` kosongkan poin SELURUH anggota, perlu konfirmasi`,

        `**Informasi**\n` +
        `${EMOJI.arrow} \`${PREFIX}motm info [user]\` lihat poin dan peringkat seseorang\n` +
        `${EMOJI.arrow} \`${PREFIX}motm winners\` daftar pemenang bulan sebelumnya\n` +
        `${EMOJI.arrow} \`${PREFIX}motm cek\` periksa channel, izin, dan kesiapan sistem`,

        `**Lanjutan**\n` +
        `${EMOJI.arrow} \`${PREFIX}motm forcewinner\` proses pemenang bulan lalu secara manual\n\n` +
        `Perintah poin dan lanjutan hanya untuk **Administrator**, selebihnya untuk Moderator.`,
    ];
}

// ============================================================
//  PAPAN
// ============================================================

async function cmdSetup(message) {
    await balas(message, WARNA.UTAMA, `${EMOJI.clock} Memasang papan, mohon tunggu sebentar.`);

    const hasil = [];

    for (const kategori of KATEGORI) {
        const kunci = Board.kunciPapan('harian', kategori);
        D.hapusPapan(kunci);
        Board.urutanTerakhir.delete(kunci);
        const p = await Board.kirimPapan(message.client, CHANNEL.HARIAN, 'harian', kategori);
        hasil.push(`${EMOJI.arrow} Papan harian ${kategori}: ${p ? 'terpasang' : 'GAGAL'}`);
    }

    for (const kategori of KATEGORI) {
        const kunci = Board.kunciPapan('bulanan', kategori);
        D.hapusPapan(kunci);
        Board.urutanTerakhir.delete(kunci);
        const p = await Board.kirimPapan(message.client, CHANNEL.BULANAN, 'bulanan', kategori);
        hasil.push(`${EMOJI.arrow} Papan bulanan ${kategori}: ${p ? 'terpasang' : 'GAGAL'}`);
    }

    await message.channel.send(susun(WARNA.SUKSES,
        [`## Papan Terpasang`, hasil.join('\n'),
        `Papan harian akan dikirim ulang setiap pergantian hari, papan bulanan diperbarui setiap hari.`]
    )).catch(() => null);
}

async function cmdRefresh(message) {
    let berhasil = 0;
    for (const periode of PERIODE) {
        for (const kategori of KATEGORI) {
            const ok = await Board.perbaruiPapan(message.client, periode, kategori);
            if (ok) berhasil += 1;
        }
    }
    await balas(message, WARNA.SUKSES,
        `## Papan Disegarkan`,
        `${EMOJI.arrow} ${berhasil} dari 4 papan diperbarui\n` +
        `Papan yang tidak berubah sengaja dilewati agar tidak membuang panggilan ke Discord.`);
}

async function cmdTest(message, args) {
    const periode = ambilPeriodeArg(args) || 'harian';
    const kategori = ambilKategori(args) || 'voice';

    const { payload } = await Board.susunPapan(message.client, periode, kategori, null);

    await message.channel.send(susun(WARNA.UTAMA, [
        `${EMOJI.chart} Contoh papan **${periode} ${kategori}**. Tidak disimpan dan tidak memengaruhi papan asli.`,
    ])).catch(() => null);

    await message.channel.send(payload).catch(err =>
        balas(message, WARNA.PERINGATAN, `Gagal menampilkan contoh: ${err.message}`));
}

// ============================================================
//  POIN
// ============================================================

async function cmdUbahPoin(message, args, mode) {
    const targetId = ambilTargetId(message, args);
    const kategori = ambilKategori(args);
    const jumlah = ambilJumlah(args, targetId);

    if (!targetId || !kategori || jumlah === null) {
        return balas(message, WARNA.UTAMA,
            `## Cara Pakai`,
            `\`${PREFIX}motm ${mode} <user> <voice|chat> <jumlah> [alasan]\`\n\n` +
            `Contoh: \`${PREFIX}motm ${mode} @user voice 50 juara event\``);
    }

    const target = await message.client.users.fetch(targetId).catch(() => null);
    const nama = target ? target.username : null;

    const dipakai = args.filter(a =>
        a.replace(/[<@!>]/g, '') === targetId ||
        a.toLowerCase() === kategori ||
        a === String(jumlah));
    const alasan = sisaAlasan(args, dipakai);

    const sebelum = D.bacaPoin(targetId, 'bulanan', kategori);

    let hasil;
    let judul;

    if (mode === 'set') {
        hasil = D.setPoinBulanan(targetId, kategori, jumlah, { nama, oleh: message.author.id, alasan });
        judul = 'Poin Ditetapkan';
    } else if (mode === 'bonus') {
        hasil = D.ubahPoin(targetId, kategori, Math.abs(jumlah), {
            nama, oleh: message.author.id, alasan, jenis: 'bonus', hanyaBulanan: true,
        });
        judul = 'Bonus Diberikan';
    } else {
        const nilai = mode === 'remove' ? -Math.abs(jumlah) : Math.abs(jumlah);
        hasil = D.ubahPoin(targetId, kategori, nilai, { nama, oleh: message.author.id, alasan });
        judul = nilai >= 0 ? 'Poin Ditambahkan' : 'Poin Dikurangi';
    }

    const sesudah = D.bacaPoin(targetId, 'bulanan', kategori);
    const posisi = D.posisiUser(targetId, 'bulanan', kategori);

    let isi =
        `${EMOJI.arrow} Member: <@${targetId}>\n` +
        `${EMOJI.arrow} Kategori: ${kategori === 'voice' ? EMOJI.voice : EMOJI.chat} ${kategori}\n` +
        `${EMOJI.arrow} Poin bulanan: ${angka(sebelum)} menjadi **${angka(sesudah)}**`;

    if (mode === 'bonus') {
        isi += `\n${EMOJI.arrow} Bonus hanya menambah catatan bulanan, tidak memengaruhi papan harian`;
    }
    if (posisi.posisi) {
        isi += `\n${EMOJI.arrow} Peringkat sekarang: **${posisi.posisi}** dari ${angka(posisi.total)} peserta`;
    }
    if (alasan) isi += `\n${EMOJI.arrow} Alasan: ${alasan}`;
    isi += `\n${EMOJI.arrow} Oleh: <@${message.author.id}>`;

    await balas(message, WARNA.SUKSES, `## ${judul}`, isi);

    // papan disegarkan agar perubahan langsung terlihat
    for (const periode of PERIODE) await Board.perbaruiPapan(message.client, periode, kategori);
}

async function cmdReset(message, args) {
    const targetId = ambilTargetId(message, args);
    if (!targetId) {
        return balas(message, WARNA.UTAMA, `## Cara Pakai`, `\`${PREFIX}motm reset <user>\``);
    }

    const dipakai = args.filter(a => a.replace(/[<@!>]/g, '') === targetId);
    const alasan = sisaAlasan(args, dipakai);

    const sebelum = D.resetBulanan(targetId, { oleh: message.author.id, alasan });

    await balas(message, WARNA.SUKSES,
        `## Poin Dikosongkan`,
        `${EMOJI.arrow} Member: <@${targetId}>\n` +
        `${EMOJI.arrow} Voice: ${angka(sebelum.voice)} menjadi 0\n` +
        `${EMOJI.arrow} Chat: ${angka(sebelum.chat)} menjadi 0\n` +
        `${EMOJI.arrow} Poin harian ikut dikosongkan` +
        (alasan ? `\n${EMOJI.arrow} Alasan: ${alasan}` : '') +
        `\n${EMOJI.arrow} Oleh: <@${message.author.id}>`);

    for (const periode of PERIODE) {
        for (const kategori of KATEGORI) await Board.perbaruiPapan(message.client, periode, kategori);
    }
}

async function cmdResetSemua(message, args) {
    const konfirmasi = args.map(a => a.toUpperCase());
    const yakin = konfirmasi.includes('YAKIN');
    const hapusRiwayat = konfirmasi.includes('HAPUSRIWAYAT');

    const jumlahAnggota = Object.keys(D.db.users).length;
    const jumlahRiwayat = D.daftarPemenang(999).length;

    if (!yakin) {
        return balas(message, WARNA.PERINGATAN,
            `## Mengosongkan Seluruh Poin`,
            `Tindakan ini **tidak dapat dibatalkan**. Yang akan dikosongkan:\n` +
            `${EMOJI.arrow} Poin harian, bulanan, dan tahunan seluruh anggota\n` +
            `${EMOJI.arrow} Riwayat penyesuaian poin\n` +
            `${EMOJI.arrow} Catatan papan, sehingga perlu dipasang ulang\n\n` +
            `Yang **tetap disimpan**:\n` +
            `${EMOJI.arrow} Nama anggota\n` +
            `${EMOJI.arrow} Riwayat pemenang bulan sebelumnya (${jumlahRiwayat} bulan)`,

            `**Terdampak**\n` +
            `${EMOJI.arrow} ${angka(jumlahAnggota)} anggota tercatat\n\n` +
            `Salinan cadangan dibuat otomatis sebelum penghapusan.`,

            `**Untuk melanjutkan**\n` +
            `\`${PREFIX}motm resetall YAKIN\`\n\n` +
            `Bila riwayat pemenang juga ingin dihapus:\n` +
            `\`${PREFIX}motm resetall YAKIN HAPUSRIWAYAT\``);
    }

    const cadangan = D.buatCadangan();
    const hasil = D.resetSemuaPoin({ hapusRiwayat });

    // catatan papan ikut dikosongkan, jadi ingatan urutan juga dibersihkan
    Board.urutanTerakhir.clear();

    let isi =
        `${EMOJI.arrow} Anggota diproses: ${angka(hasil.anggota)}\n` +
        `${EMOJI.arrow} Poin voice dihapus: ${angka(hasil.totalVoice)}\n` +
        `${EMOJI.arrow} Poin chat dihapus: ${angka(hasil.totalChat)}\n` +
        `${EMOJI.arrow} Riwayat pemenang: ${hasil.riwayatDihapus ? `${hasil.jumlahRiwayat} bulan ikut dihapus` : 'tetap disimpan'}`;

    if (cadangan) {
        isi += `\n${EMOJI.arrow} Cadangan: \`${cadangan.split('/').pop()}\``;
    } else {
        isi += `\n${EMOJI.arrow} Cadangan gagal dibuat, periksa log`;
    }

    await balas(message, WARNA.SUKSES,
        `## Seluruh Poin Dikosongkan`,
        isi,
        `**Langkah berikutnya**\n` +
        `${EMOJI.arrow} Jalankan \`${PREFIX}motm setup\` untuk memasang papan dalam keadaan bersih\n` +
        `${EMOJI.arrow} Hapus pesan papan lama di channel secara manual bila masih ada`);

    console.log(`[MOTM] seluruh poin dikosongkan oleh ${message.author.tag}, cadangan: ${cadangan || 'gagal'}`);
}

// ============================================================
//  INFORMASI
// ============================================================

async function cmdInfo(message, args) {
    const targetId = ambilTargetId(message, args) || message.author.id;

    const bagian = [`## ${EMOJI.chart} Poin Member of the Month\n<@${targetId}>`];

    for (const kategori of KATEGORI) {
        const harian = D.bacaPoin(targetId, 'harian', kategori);
        const bulanan = D.bacaPoin(targetId, 'bulanan', kategori);
        const pos = D.posisiUser(targetId, 'bulanan', kategori);
        const posHarian = D.posisiUser(targetId, 'harian', kategori);

        bagian.push(
            `${kategori === 'voice' ? EMOJI.voice : EMOJI.chat} **${kategori.toUpperCase()}**\n` +
            `${EMOJI.arrow} Hari ini: ${angka(harian)} poin` +
            (posHarian.posisi ? ` ${String.fromCharCode(0x2022)} peringkat ${posHarian.posisi}` : '') + `\n` +
            `${EMOJI.arrow} Bulan ini: ${angka(bulanan)} poin` +
            (pos.posisi ? ` ${String.fromCharCode(0x2022)} peringkat **${pos.posisi}** dari ${angka(pos.total)}` : ' (belum masuk hitungan)')
        );
    }

    const riwayat = D.riwayatPenyesuaian(targetId, 5);
    if (riwayat.length) {
        bagian.push(
            `${EMOJI.medal} **Penyesuaian Terakhir**\n` +
            riwayat.map(r => {
                const tanda = r.jumlah >= 0 ? '+' : '';
                return `${EMOJI.arrow} ${r.jenis} ${tanda}${angka(r.jumlah)} ${r.kategori}` +
                    (r.oleh ? ` oleh <@${r.oleh}>` : '') +
                    ` <t:${Math.floor(r.at / 1000)}:R>` +
                    (r.alasan ? `\n> ${r.alasan}` : '');
            }).join('\n')
        );
    }

    await message.channel.send(susun(WARNA.UTAMA, bagian)).catch(() => null);
}

async function cmdWinners(message) {
    const daftar = D.daftarPemenang(TAMPIL.RIWAYAT);

    if (!daftar.length) {
        return balas(message, WARNA.UTAMA,
            `## ${EMOJI.medal} Riwayat Pemenang`,
            'Belum ada pemenang yang tercatat. Pemenang pertama akan muncul setelah bulan ini berakhir.');
    }

    const bagian = [`## ${EMOJI.medal} Riwayat Pemenang`];

    for (const w of daftar) {
        const [th, bl] = w.bulan.split('-');
        const label = `${BULAN[Number(bl) - 1]} ${th}`;

        const isi = KATEGORI.map(kat => {
            const list = w[kat] || [];
            const teksList = list.length
                ? list.map((u, i) => `${rankEmoji(i + 1)} <@${u.id}> ${EMOJI.arrow} ${angka(u.poin)}`).join('\n')
                : `${EMOJI.arrow} tidak ada`;
            return `${kat === 'voice' ? EMOJI.voice : EMOJI.chat} **${kat.toUpperCase()}**\n${teksList}`;
        }).join('\n\n');

        bagian.push(`${EMOJI.calendar} **${label}**\n\n${isi}`);
    }

    await message.channel.send(susun(WARNA.UTAMA, bagian)).catch(() => null);
}

// ============================================================
//  DIAGNOSA
// ============================================================

async function cmdCek(message) {
    const guild = message.guild;
    const baris = [];

    const perlu = [
        ['Melihat channel', PermissionsBitField.Flags.ViewChannel],
        ['Mengirim pesan', PermissionsBitField.Flags.SendMessages],
        ['Melampirkan berkas', PermissionsBitField.Flags.AttachFiles],
        ['Membaca riwayat pesan', PermissionsBitField.Flags.ReadMessageHistory],
    ];

    for (const [nama, id] of [['Harian', CHANNEL.HARIAN], ['Bulanan', CHANNEL.BULANAN], ['General', CHANNEL.GENERAL]]) {
        const ch = await message.client.channels.fetch(id).catch(() => null);
        if (!ch) {
            baris.push(`${EMOJI.arrow} ${nama}: channel \`${id}\` TIDAK ditemukan`);
            continue;
        }
        const izin = ch.permissionsFor(guild.members.me);
        const kurang = perlu.filter(([, f]) => !izin?.has(f)).map(([n]) => n);
        baris.push(`${EMOJI.arrow} ${nama}: ${ch} ${kurang.length ? `KURANG IZIN (${kurang.join(', ')})` : 'siap'}`);
    }

    // role juara
    const role = guild.roles.cache.get(ROLE.JUARA);
    const me = guild.members.me;
    let statusRole;
    if (!role) statusRole = `role \`${ROLE.JUARA}\` TIDAK ditemukan`;
    else if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) statusRole = 'bot tidak punya izin Manage Roles';
    else if (role.position >= me.roles.highest.position) statusRole = `posisi role bot harus DI ATAS ${role.name}`;
    else statusRole = `${role.name} siap`;

    // papan terpasang
    const papan = PERIODE.flatMap(p => KATEGORI.map(k => {
        const c = D.ambilPapan(Board.kunciPapan(p, k));
        return `${EMOJI.arrow} ${p} ${k}: ${c ? 'terpasang' : 'belum dipasang'}`;
    }));

    await message.channel.send(susun(WARNA.UTAMA, [
        `## ${EMOJI.chart} Pemeriksaan Sistem`,
        `**Channel dan Izin**\n${baris.join('\n')}`,
        `**Role Juara**\n${EMOJI.arrow} ${statusRole}`,
        `**Papan**\n${papan.join('\n')}`,
        `**Lainnya**\n` +
        `${EMOJI.arrow} Banner canvas: ${Banner.tersedia() ? 'aktif' : 'tidak aktif, jalankan npm install canvas'}\n` +
        `${EMOJI.arrow} Anggota tercatat: ${angka(Object.keys(D.db.users).length)}\n` +
        `${EMOJI.arrow} Aturan voice: ${POIN.VOICE_PER_MENIT} poin per ${POIN.VOICE_SETIAP_MENIT} menit\n` +
        `${EMOJI.arrow} Aturan chat: ${POIN.CHAT_PER_PESAN} poin per pesan, maksimal ${POIN.CHAT_BATAS_HARIAN} per hari`,
    ])).catch(() => null);
}

async function cmdForceWinner(message) {
    await balas(message, WARNA.UTAMA, `${EMOJI.clock} Memproses pemenang bulan lalu.`);

    const ok = await Scheduler.prosesBulanBaru(message.client, message.guild);

    await balas(message, ok ? WARNA.SUKSES : WARNA.PERINGATAN,
        ok ? `## Pemenang Diproses` : `## Tidak Ada yang Diproses`,
        ok
            ? `${EMOJI.arrow} Pengumuman dikirim dan role juara disesuaikan.`
            : `${EMOJI.arrow} Pemenang bulan lalu sudah pernah diproses sebelumnya.`);
}

// ============================================================
//  PENYALUR
// ============================================================

const ANAK_ADMIN = new Set(['add', 'remove', 'set', 'bonus', 'reset', 'resetall', 'forcewinner']);

async function handleMessage(message) {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();
        if (!COMMAND.includes(command)) return;

        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

        const anak = args.shift()?.toLowerCase();

        if (!anak || anak === 'help') {
            return message.channel.send(susun(WARNA.UTAMA, bantuan())).catch(() => null);
        }

        if (ANAK_ADMIN.has(anak) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return balas(message, WARNA.PERINGATAN,
                `Perintah ini khusus role dengan permission **Administrator**.`);
        }

        switch (anak) {
            case 'setup': return cmdSetup(message);
            case 'refresh': return cmdRefresh(message);
            case 'test': case 'preview': return cmdTest(message, args);
            case 'add': return cmdUbahPoin(message, args, 'add');
            case 'remove': case 'kurang': return cmdUbahPoin(message, args, 'remove');
            case 'set': return cmdUbahPoin(message, args, 'set');
            case 'bonus': return cmdUbahPoin(message, args, 'bonus');
            case 'reset': return cmdReset(message, args);
            case 'resetall': case 'resetsemua': return cmdResetSemua(message, args);
            case 'info': return cmdInfo(message, args);
            case 'winners': case 'pemenang': return cmdWinners(message);
            case 'cek': case 'check': return cmdCek(message);
            case 'forcewinner': return cmdForceWinner(message);
            default:
                return message.channel.send(susun(WARNA.UTAMA, bantuan())).catch(() => null);
        }
    } catch (err) {
        console.error('[MOTM] galat command:', err);
        balas(message, WARNA.PERINGATAN, `Terjadi kesalahan: ${err.message}`);
    }
}

module.exports = { handleMessage };
