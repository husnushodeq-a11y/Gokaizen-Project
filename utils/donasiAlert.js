// utils/donasiAlert.js
// Menandai donasi baru yang masuk lewat webhook Sociabuzz.
//
// Mention di dalam embed tidak pernah memicu notifikasi, dan webhook Sociabuzz
// mengirim isinya sebagai embed. Karena itu bot mengirim pesan terpisah berisi
// mention role staff, sehingga notifikasinya benar-benar sampai.
//
// Bot juga membaca nominal dan nama donatur dari pesan tersebut, lalu menyiapkan
// command pencatatan agar staff tinggal menyalin.
//
// Dipakai oleh:
//   events/donasiAlertMessage.js  -> handleMessage
//   events/donasiAlertButton.js   -> handleInteraction

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
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

// Channel tempat webhook Sociabuzz mengirim notifikasi donasi.
const LOG_CHANNEL_ID = botConfig.SOCIABUZZ_LOG_CHANNEL_ID || '1532834028053594286';

// Role staff yang perlu diberi tahu setiap ada donasi masuk.
const STAFF_ROLES = [
    '1462085261893701642', // Ketua
    '1367316783832502282', // Admin
    '1376416212724088932', // Moderator
];

// Izin minimal untuk menekan tombol penanda.
const STAFF_PERM = PermissionsBitField.Flags.ModerateMembers;

const BUTTON_ID = 'donasi_alert_done';

const COLOR = 0xF1C40F;
const COLOR_DONE = 0x57F287;

// ============================================================
//  TAMPILAN
// ============================================================

// Baris tombol untuk pesan embed biasa
function buildRow(matikan) {
    if (typeof ButtonBuilder !== 'function' || typeof ActionRowBuilder !== 'function') return null;
    try {
        const b = new ButtonBuilder()
            .setCustomId(BUTTON_ID)
            .setStyle(ButtonStyle.Success)
            .setLabel('Tandai sudah dicatat');
        if (matikan) b.setDisabled(true);
        return new ActionRowBuilder().addComponents(b);
    } catch {
        return null;
    }
}

// ============================================================
//  PEMBACAAN ISI WEBHOOK
// ============================================================

// Menggabungkan seluruh teks pada pesan webhook, termasuk isi embed,
// karena Sociabuzz menaruh keterangannya di dalam embed.
function kumpulkanTeks(message) {
    const bagian = [message.content || ''];

    for (const e of message.embeds || []) {
        if (e.title) bagian.push(e.title);
        if (e.description) bagian.push(e.description);
        if (e.author?.name) bagian.push(e.author.name);
        for (const f of e.fields || []) {
            if (f.name) bagian.push(f.name);
            if (f.value) bagian.push(f.value);
        }
    }

    return bagian.filter(Boolean).join('\n');
}

function bacaNominal(teks) {
    // Contoh yang dikenali: IDR10,000 | IDR 10.000 | Rp 10.000
    const m = teks.match(/(?:IDR|Rp)\s*([\d][\d.,]*)/i);
    if (!m) return null;

    const angka = parseInt(m[1].replace(/[.,]/g, ''), 10);
    return Number.isFinite(angka) && angka > 0 ? angka : null;
}

function bacaNama(teks) {
    const m = teks.match(/from\s+(.+)/i);
    if (!m) return null;

    let nama = m[1];

    // Buang keterangan tambahan yang biasa mengikuti nama pada template Sociabuzz
    nama = nama.split('\n')[0];
    nama = nama.split(/\s+jangan\s+/i)[0];
    nama = nama.split('<@')[0];
    nama = nama.replace(/@\S+/g, '');
    nama = nama.replace(/\s{2,}/g, ' ').trim();

    return nama || null;
}

const formatRupiah = n => 'Rp ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ============================================================
//  PESAN PEMBERITAHUAN
// ============================================================
//
// Pemberitahuan ini sengaja memakai embed biasa, bukan Components V2.
// Alasannya, mention hanya memicu notifikasi bila berada pada field content,
// sedangkan Components V2 melarang pemakaian content sama sekali.

function buildAlert(nama, nominal, tautan) {
    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle('Donasi Baru Masuk')
        .addFields(
            { name: 'Donatur', value: nama ? `**${nama}**` : 'tidak terbaca', inline: true },
            { name: 'Nominal', value: nominal ? `**${formatRupiah(nominal)}**` : 'tidak terbaca', inline: true },
        );

    if (tautan) embed.addFields({ name: 'Rincian', value: tautan, inline: false });

    embed.addFields({
        name: 'Catat dengan',
        value: nominal
            ? `\`${PREFIX}donasi @user ${nominal}\`\n\n` +
              'Ganti `@user` dengan akun Discord donatur. ' +
              'Pencatatan dengan nama membuat role dan benefit tidak diberikan otomatis.'
            : `\`${PREFIX}donasi @user <nominal>\`\n\n` +
              'Nominalnya tidak terbaca otomatis, jadi periksa pesan di atas sebelum mencatat.',
        inline: false,
    });

    embed.setTimestamp();

    const payload = {
        content: STAFF_ROLES.map(r => `<@&${r}>`).join(' '),
        embeds: [embed],
        allowedMentions: { roles: STAFF_ROLES },
    };

    const row = buildRow(false);
    if (row) payload.components = [row];

    return payload;
}

function buildSelesai(nama, nominal, olehId) {
    const embed = new EmbedBuilder()
        .setColor(COLOR_DONE)
        .setTitle('Donasi Sudah Dicatat')
        .addFields(
            { name: 'Donatur', value: nama ? `**${nama}**` : 'tidak terbaca', inline: true },
            { name: 'Nominal', value: nominal ? `**${formatRupiah(nominal)}**` : 'tidak terbaca', inline: true },
            { name: 'Diproses oleh', value: `<@${olehId}>`, inline: false },
        )
        .setTimestamp();

    const payload = {
        content: '',
        embeds: [embed],
        allowedMentions: { parse: [] },
    };

    const row = buildRow(true);
    if (row) payload.components = [row];

    return payload;
}

// ============================================================
//  PENANGANAN PESAN WEBHOOK
// ============================================================

// Menyimpan hasil pembacaan agar tombol penanda tetap menampilkan data yang sama.
const catatan = new Map();

function simpanCatatan(messageId, data) {
    catatan.set(messageId, data);

    // Dibersihkan setelah satu hari agar tidak menumpuk di memori.
    // unref dipakai supaya timer ini tidak pernah menahan proses tetap hidup.
    const t = setTimeout(() => catatan.delete(messageId), 24 * 60 * 60 * 1000);
    if (typeof t.unref === 'function') t.unref();
}

async function handleMessage(message) {
    try {
        if (!message.guild) return;

        // Command diagnosa, dijalankan staff di channel mana pun
        if (!message.author?.bot && message.content?.toLowerCase().startsWith(`${PREFIX}alertcek`)) {
            if (!message.member?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) return;
            return handleCek(message);
        }

        if (message.channelId !== LOG_CHANNEL_ID) return;

        // Jangan pernah menanggapi pesan bot ini sendiri
        if (message.author?.id === message.client.user.id) return;

        // Sociabuzz dapat mengirim lewat webhook maupun lewat integrasi aplikasi.
        // Keduanya diterima. Pesan bot lain hanya diproses bila memang berisi nominal,
        // supaya tidak ada pemberitahuan palsu.
        const dariWebhook = Boolean(message.webhookId);
        const dariBot = Boolean(message.author?.bot);
        if (!dariWebhook && !dariBot) return;

        const teks = kumpulkanTeks(message);
        if (!teks.trim()) return;

        const nominal = bacaNominal(teks);
        const nama = bacaNama(teks);

        if (!dariWebhook && nominal === null) return;

        console.log(`[DONASI ALERT] terdeteksi di channel log | webhook:${dariWebhook} | nama:${nama || '-'} | nominal:${nominal || '-'}`);

        // Tautan rincian pada pesan Sociabuzz, bila ada
        const tautan = (teks.match(/https:\/\/sociabuzz\.com\/\S+/i) || [])[0] || null;
        const payload = buildAlert(nama, nominal, tautan);

        let terkirim = null;
        try {
            terkirim = await message.reply(payload);
        } catch (err) {
            console.error('[DONASI ALERT] gagal membalas:', err.message);
            try {
                terkirim = await message.channel.send(payload);
            } catch (err2) {
                console.error('[DONASI ALERT] gagal mengirim ke channel:', err2.message);
                console.error('[DONASI ALERT] periksa izin bot di channel tersebut: Send Messages, Embed Links, Mention Everyone');
                return;
            }
        }

        if (terkirim) {
            simpanCatatan(terkirim.id, { nama, nominal });
            console.log(`[DONASI ALERT] pemberitahuan terkirim: ${terkirim.id}`);
        }
    } catch (err) {
        console.error('[DONASI ALERT] error:', err.message);
    }
}

// ============================================================
//  DIAGNOSA
// ============================================================

// g!alertcek memeriksa penyebab paling umum ketika pemberitahuan tidak muncul:
// channel yang salah, izin bot yang kurang, atau role yang tidak ada.
async function handleCek(message) {
    const guild = message.guild;
    const baris = [];

    const channel = await message.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    baris.push(channel
        ? `Channel log ditemukan: ${channel}`
        : `Channel log TIDAK ditemukan. Periksa nilai LOG_CHANNEL_ID (\`${LOG_CHANNEL_ID}\`)`);

    if (channel) {
        const me = guild.members.me;
        const izin = channel.permissionsFor(me);
        const perlu = [
            ['Melihat channel', PermissionsBitField.Flags.ViewChannel],
            ['Mengirim pesan', PermissionsBitField.Flags.SendMessages],
            ['Membaca riwayat pesan', PermissionsBitField.Flags.ReadMessageHistory],
            ['Menyebut semua role', PermissionsBitField.Flags.MentionEveryone],
        ];
        for (const [nama, flag] of perlu) {
            baris.push(`${nama}: ${izin && izin.has(flag) ? 'ada' : 'TIDAK ADA'}`);
        }
    }

    const roleBaris = STAFF_ROLES.map(id => {
        const r = guild.roles.cache.get(id);
        return `${r ? `${r.name} ditemukan` : `\`${id}\` TIDAK ditemukan di server ini`}`;
    });

    const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle('Pemeriksaan Pemberitahuan Donasi')
        .addFields(
            { name: 'Channel dan Izin', value: baris.join('\n'), inline: false },
            { name: 'Role Staff', value: roleBaris.join('\n'), inline: false },
            {
                name: 'Bila semuanya sudah benar',
                value: 'Berarti pesan Sociabuzz tidak masuk ke channel tersebut. ' +
                    'Periksa kembali alamat webhook di pengaturan Sociabuzz.',
                inline: false,
            },
        );

    await message.reply({
        embeds: [embed],
        allowedMentions: { parse: [], repliedUser: false },
    }).catch(() => null);
}

// ============================================================
//  PENANGANAN TOMBOL
// ============================================================

async function handleInteraction(interaction) {
    try {
        if (!interaction.isButton?.()) return;
        if (interaction.customId !== BUTTON_ID) return;

        if (!interaction.member?.permissions?.has(STAFF_PERM)) {
            return interaction.reply({
                content: 'Hanya staff yang bisa menandai donasi sebagai sudah dicatat.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => null);
        }

        const data = catatan.get(interaction.message.id) || {};

        await interaction.update(buildSelesai(data.nama, data.nominal, interaction.user.id)).catch(() => null);

        console.log(`[DONASI ALERT] ditandai selesai oleh ${interaction.user.tag}`);
    } catch (err) {
        console.error('[DONASI ALERT] error tombol:', err.message);
    }
}

module.exports = { handleMessage, handleInteraction };
