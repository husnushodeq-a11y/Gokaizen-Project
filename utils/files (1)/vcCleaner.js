// utils/vcCleaner.js
// Memutus sambungan bot yang tertinggal sendirian di voice channel.
//
// Bot musik kerap tetap berada di voice setelah semua orang pergi, bahkan
// setelah pemutarannya berhenti. Modul ini memeriksa keadaan secara berkala,
// lalu memutus bot yang sudah cukup lama tidak ditemani siapa pun.
//
// Ada jeda tunggu sebelum pemutusan, supaya bot tidak diputus ketika anggota
// hanya keluar sebentar lalu kembali.
//
// Dipakai oleh:
//   events/vcCleanerReady.js   -> mulai
//   events/vcCleanerCommand.js -> handleMessage

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
    PermissionsBitField,
} = require('discord.js');

let botConfig = {};
try {
    botConfig = require('../config.json');
} catch {
    botConfig = {};
}

// ============================================================
//  KONFIGURASI
// ============================================================

const PREFIX = 'g!';
const COMMAND = ['vcclean', 'bersihvc', 'cleanvc'];

// Channel yang tidak pernah disentuh. Bot di sini dibiarkan meski sendirian.
const CHANNEL_DIKECUALIKAN = new Set([
    ...(botConfig.VC_CLEAN_EXCEPT_CHANNELS || []),
    '1433782028985176185',
]);

// Bot tertentu yang tidak pernah diputus, diisi dengan ID bot.
const BOT_DIKECUALIKAN = new Set(botConfig.VC_CLEAN_EXCEPT_BOTS || []);

// Lama menunggu sebelum bot diputus, terhitung sejak orang terakhir pergi.
const JEDA_TUNGGU = Number(botConfig.VC_CLEAN_GRACE || 3 * 60 * 1000);

// Selang pemeriksaan
const SELANG_PERIKSA = Number(botConfig.VC_CLEAN_INTERVAL || 60 * 1000);

// Jeda sebelum bot yang sama boleh diputus lagi, menahan pengulangan ketika
// ada bot yang langsung menyambung kembali dengan sendirinya.
const JEDA_ULANG = Number(botConfig.VC_CLEAN_COOLDOWN || 5 * 60 * 1000);

// Channel catatan. Bila kosong, hanya dicatat pada log server.
const CHANNEL_CATATAN = botConfig.VC_CLEAN_LOG_CHANNEL_ID || '';

// Bot ini sendiri ikut diputus bila tertinggal sendirian.
const PUTUS_DIRI_SENDIRI = botConfig.VC_CLEAN_INCLUDE_SELF !== false;

const WARNA = {
    UTAMA: 0xD31007,
    SUKSES: 0x57F287,
    PERINGATAN: 0xED4245,
};

const PANAH = '<a:arrow:1532795180770660382>';

// ============================================================
//  TAMPILAN
// ============================================================

const teks = isi => new TextDisplayBuilder().setContent(isi);

function susun(warna, bagian) {
    const c = new ContainerBuilder();
    if (typeof c.setAccentColor === 'function') c.setAccentColor(warna);

    bagian.forEach((isi, i) => {
        c.addTextDisplayComponents(teks(isi));
        if (i < bagian.length - 1 && typeof c.addSeparatorComponents === 'function') {
            try {
                const s = new SeparatorBuilder();
                if (typeof s.setDivider === 'function') s.setDivider(true);
                if (typeof s.setSpacing === 'function' && SeparatorSpacingSize) s.setSpacing(SeparatorSpacingSize.Small);
                c.addSeparatorComponents(s);
            } catch { /* pemisah opsional */ }
        }
    });

    return {
        components: [c],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [], repliedUser: false },
    };
}

const balas = (message, warna, ...bagian) =>
    message.reply(susun(warna, bagian)).catch(() => null);

async function catat(client, isi) {
    if (!CHANNEL_CATATAN) return;
    try {
        const ch = await client.channels.fetch(CHANNEL_CATATAN).catch(() => null);
        if (ch) await ch.send(susun(WARNA.UTAMA, [isi])).catch(() => null);
    } catch { /* kegagalan catatan tidak menghentikan pembersihan */ }
}

const menitDari = ms => Math.round(ms / 60000);

// ============================================================
//  PEMANTAUAN
// ============================================================

// channelId -> waktu ketika orang terakhir pergi
const sejakKosong = new Map();

// botId -> waktu pemutusan terakhir
const putusTerakhir = new Map();

// Memeriksa apakah bot boleh memutus anggota pada channel tersebut
function alasanTidakBisa(channel, guild) {
    const me = guild.members.me;
    if (!me) return 'keterangan bot tidak terbaca';
    if (!me.permissions.has(PermissionsBitField.Flags.MoveMembers)) return 'bot tidak punya izin Move Members';

    const izin = channel.permissionsFor(me);
    if (!izin?.has(PermissionsBitField.Flags.ViewChannel)) return 'bot tidak dapat melihat channel';

    return null;
}

// Bot dengan role lebih tinggi tidak dapat diputus
function bisaDiputus(target, guild) {
    const me = guild.members.me;
    if (!me) return false;
    if (target.id === guild.ownerId) return false;
    return target.roles.highest.position < me.roles.highest.position;
}

// Mengumpulkan keadaan setiap voice channel
function petaKeadaan(guild) {
    const hasil = [];

    for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased?.()) continue;
        if (!channel.members || channel.members.size === 0) continue;
        if (CHANNEL_DIKECUALIKAN.has(channel.id)) continue;
        if (guild.afkChannelId && channel.id === guild.afkChannelId) continue;

        const manusia = channel.members.filter(m => !m.user.bot);
        const botDiDalam = channel.members.filter(m =>
            m.user.bot &&
            !BOT_DIKECUALIKAN.has(m.id) &&
            (PUTUS_DIRI_SENDIRI || m.id !== guild.members.me?.id)
        );

        hasil.push({ channel, jumlahManusia: manusia.size, bot: [...botDiDalam.values()] });
    }

    return hasil;
}

// Satu putaran pemeriksaan
async function periksa(client, guild) {
    if (!guild) return { diputus: [], dipantau: 0 };

    const sekarang = Date.now();
    const diputus = [];
    let dipantau = 0;

    for (const { channel, jumlahManusia, bot } of petaKeadaan(guild)) {
        // masih ada orang, penanda dibersihkan
        if (jumlahManusia > 0) {
            sejakKosong.delete(channel.id);
            continue;
        }

        // tidak ada bot yang perlu diurus
        if (!bot.length) {
            sejakKosong.delete(channel.id);
            continue;
        }

        // mulai menghitung sejak channel ditinggalkan
        if (!sejakKosong.has(channel.id)) {
            sejakKosong.set(channel.id, sekarang);
            dipantau += 1;
            continue;
        }

        const lama = sekarang - sejakKosong.get(channel.id);
        if (lama < JEDA_TUNGGU) {
            dipantau += 1;
            continue;
        }

        const masalah = alasanTidakBisa(channel, guild);
        if (masalah) {
            console.error(`[VCCLEAN] tidak dapat membersihkan ${channel.name}: ${masalah}`);
            continue;
        }

        for (const target of bot) {
            const terakhir = putusTerakhir.get(target.id) || 0;
            if (sekarang - terakhir < JEDA_ULANG) continue;

            if (!bisaDiputus(target, guild)) {
                console.error(`[VCCLEAN] posisi role bot harus di atas ${target.user.tag}`);
                continue;
            }

            const berhasil = await target.voice
                .disconnect('Tertinggal sendirian di voice channel')
                .then(() => true)
                .catch(err => {
                    console.error(`[VCCLEAN] gagal memutus ${target.user.tag}: ${err.message}`);
                    return false;
                });

            if (berhasil) {
                putusTerakhir.set(target.id, sekarang);
                diputus.push({ bot: target, channel, lama });
                console.log(`[VCCLEAN] ${target.user.tag} diputus dari ${channel.name} setelah ${menitDari(lama)} menit sendirian`);
            }
        }

        sejakKosong.delete(channel.id);
    }

    if (diputus.length) {
        await catat(client,
            `## Bot Diputus dari Voice\n` +
            diputus.map(d =>
                `${PANAH} ${d.bot} dari **${d.channel.name}**, sendirian ${menitDari(d.lama)} menit`
            ).join('\n')
        );
    }

    return { diputus, dipantau };
}

// ============================================================
//  PENYALAAN
// ============================================================

let timer = null;

function mulai(client, guild) {
    if (timer) return;

    timer = setInterval(() => {
        const g = guild || client.guilds.cache.first();
        periksa(client, g).catch(err => console.error('[VCCLEAN] galat pemeriksaan:', err.message));
    }, SELANG_PERIKSA);

    if (typeof timer.unref === 'function') timer.unref();

    console.log(
        `[VCCLEAN] pembersih voice dimulai, memeriksa setiap ${menitDari(SELANG_PERIKSA)} menit, ` +
        `jeda tunggu ${menitDari(JEDA_TUNGGU)} menit, ${CHANNEL_DIKECUALIKAN.size} channel dikecualikan`
    );
}

// ============================================================
//  COMMAND
// ============================================================

async function cmdStatus(message) {
    const guild = message.guild;
    const keadaan = petaKeadaan(guild);
    const sekarang = Date.now();

    const sendirian = keadaan.filter(k => k.jumlahManusia === 0 && k.bot.length);

    const bagian = [`## Pembersih Voice Otomatis`];

    bagian.push(
        `**Pengaturan**\n` +
        `${PANAH} Pemeriksaan setiap ${menitDari(SELANG_PERIKSA)} menit\n` +
        `${PANAH} Jeda tunggu sebelum diputus: ${menitDari(JEDA_TUNGGU)} menit\n` +
        `${PANAH} Channel dikecualikan: ${[...CHANNEL_DIKECUALIKAN].map(id => `<#${id}>`).join(', ') || 'tidak ada'}\n` +
        `${PANAH} Bot dikecualikan: ${BOT_DIKECUALIKAN.size ? [...BOT_DIKECUALIKAN].map(id => `<@${id}>`).join(', ') : 'tidak ada'}\n` +
        `${PANAH} Catatan dikirim ke: ${CHANNEL_CATATAN ? `<#${CHANNEL_CATATAN}>` : 'hanya log server'}`
    );

    if (!sendirian.length) {
        bagian.push(`**Keadaan Sekarang**\n${PANAH} Tidak ada bot yang tertinggal sendirian.`);
    } else {
        bagian.push(
            `**Sedang Dipantau**\n` +
            sendirian.map(k => {
                const mulaiKosong = sejakKosong.get(k.channel.id);
                const sisa = mulaiKosong
                    ? Math.max(0, JEDA_TUNGGU - (sekarang - mulaiKosong))
                    : JEDA_TUNGGU;
                return `${PANAH} **${k.channel.name}**\n` +
                    `Bot: ${k.bot.map(b => b.user.username).join(', ')}\n` +
                    `Diputus dalam ${Math.ceil(sisa / 60000)} menit lagi`;
            }).join('\n\n')
        );
    }

    // pemeriksaan izin
    const me = guild.members.me;
    const punyaIzin = me?.permissions.has(PermissionsBitField.Flags.MoveMembers);
    bagian.push(
        `**Kesiapan**\n` +
        `${PANAH} Izin Move Members: ${punyaIzin ? 'ada' : 'TIDAK ADA, fitur tidak akan bekerja'}\n` +
        `${PANAH} Posisi role bot harus di atas role bot lain yang ingin diputus`
    );

    await message.channel.send(susun(WARNA.UTAMA, bagian)).catch(() => null);
}

async function cmdSekarang(message) {
    const hasil = await periksa(message.client, message.guild);

    if (!hasil.diputus.length) {
        return balas(message, WARNA.UTAMA,
            `## Tidak Ada yang Diputus`,
            `${PANAH} Tidak ada bot yang sudah melewati jeda tunggu.\n` +
            `${PANAH} Sedang dipantau: ${hasil.dipantau} channel\n\n` +
            `Gunakan \`${PREFIX}vcclean paksa\` untuk memutus tanpa menunggu.`);
    }

    await balas(message, WARNA.SUKSES,
        `## Pembersihan Selesai`,
        hasil.diputus.map(d =>
            `${PANAH} ${d.bot} dari **${d.channel.name}**`).join('\n'));
}

async function cmdPaksa(message) {
    const guild = message.guild;
    const keadaan = petaKeadaan(guild);
    const diputus = [];

    for (const { channel, jumlahManusia, bot } of keadaan) {
        if (jumlahManusia > 0 || !bot.length) continue;

        const masalah = alasanTidakBisa(channel, guild);
        if (masalah) continue;

        for (const target of bot) {
            if (!bisaDiputus(target, guild)) continue;

            const ok = await target.voice.disconnect('Dibersihkan oleh staff').then(() => true).catch(() => false);
            if (ok) {
                putusTerakhir.set(target.id, Date.now());
                diputus.push({ bot: target, channel });
            }
        }
        sejakKosong.delete(channel.id);
    }

    if (!diputus.length) {
        return balas(message, WARNA.UTAMA,
            `## Tidak Ada yang Diputus`,
            `Tidak ada bot yang sedang tertinggal sendirian di voice.`);
    }

    await balas(message, WARNA.SUKSES,
        `## Pembersihan Paksa Selesai`,
        diputus.map(d => `${PANAH} ${d.bot} dari **${d.channel.name}**`).join('\n'));

    await catat(message.client,
        `## Pembersihan Paksa\n` +
        `${PANAH} Oleh ${message.author}\n` +
        diputus.map(d => `${PANAH} ${d.bot} dari **${d.channel.name}**`).join('\n'));
}

async function handleMessage(message) {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();
        if (!COMMAND.includes(command)) return;

        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

        const anak = args[0]?.toLowerCase();

        if (anak === 'now' || anak === 'jalan') return cmdSekarang(message);
        if (anak === 'paksa' || anak === 'force') return cmdPaksa(message);

        return cmdStatus(message);
    } catch (err) {
        console.error('[VCCLEAN] galat command:', err);
        balas(message, WARNA.PERINGATAN, `Terjadi kesalahan: ${err.message}`);
    }
}

module.exports = {
    mulai,
    periksa,
    handleMessage,
    petaKeadaan,
    CHANNEL_DIKECUALIKAN,
    JEDA_TUNGGU,
};
