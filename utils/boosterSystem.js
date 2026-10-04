// utils/boosterSystem.js
// Pengumuman untuk anggota yang melakukan boost ke server.
//
// Pengumuman dikirim otomatis ketika seseorang mulai boost, dan dapat dicoba
// lebih dulu dengan command tanpa mengirim apa pun ke channel umum.
//
// Dipakai oleh:
//   events/boosterAnnounce.js -> handleMemberUpdate
//   events/boosterCommands.js -> handleMessage

const fs = require('fs');
const path = require('path');

const {
    MessageType,
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
    PermissionsBitField,
} = require('discord.js');

const Banner = require('./boosterBanner');

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
const COMMAND = ['boostertest', 'testbooster', 'boosttest'];

// Channel tempat pengumuman boost dikirim
const CHANNEL_PENGUMUMAN = botConfig.BOOSTER_ANNOUNCE_CHANNEL_ID || '';

// Channel yang disebut pada daftar benefit
const CHANNEL_ROLE_PREMIUM = botConfig.BOOSTER_ROLE_CHANNEL_ID || '1496646087266668636';
const CHANNEL_VOICE_PRIORITAS = botConfig.BOOSTER_VOICE_CHANNEL_ID || '1461294184894824560';

// Role booster
const ROLE_BOOSTER = botConfig.BOOSTER_ROLE_ID || '1348517203770740859';

const WARNA = {
    BOOST: 0xF47FFF,
    SUKSES: 0x57F287,
    PERINGATAN: 0xED4245,
};

const EMOJI = {
    boost: '<a:tier_booster:1534281108294864937>',
    arrow: '<a:arrow:1532795180770660382>',
    trophy: '<:piala:1532795152572092456>',
    calendar: '<:calendar:1533011556214898790>',
    chart: '<:chart:1533011589001908317>',
    medal: '<:medali:1533011104731627671>',
};

// Daftar benefit booster, disamakan dengan yang tertulis pada regulasi
const BENEFIT = [
    `Mendapatkan role <@&${ROLE_BOOSTER}>`,
    `Dapat memilih role premium di <#${CHANNEL_ROLE_PREMIUM}>`,
    'Display role di member list',
    'Gradient color role',
    `Akses priority voice di <#${CHANNEL_VOICE_PRIORITAS}>`,
];

// ============================================================
//  CATATAN JUMLAH BOOST
// ============================================================
//
// Discord tidak memberi tahu berapa kali seseorang sudah melakukan boost.
// Yang tersedia hanya keterangan sedang boost atau tidak. Karena itu jumlahnya
// dihitung sendiri dari pesan sistem yang dikirim Discord setiap ada boost.
//
// Hitungan dimulai sejak fitur ini berjalan. Boost yang terjadi sebelumnya
// atau ketika bot sedang mati tidak ikut terhitung.

const DATA_FILE = path.join(__dirname, '..', 'data', 'boosterData.json');

function muatData() {
    try {
        if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        console.error('[BOOSTER] gagal membaca boosterData.json:', err.message);
    }
    return {};
}

const db = muatData();

function simpanData() {
    try {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (err) {
        console.error('[BOOSTER] gagal menyimpan boosterData.json:', err.message);
    }
}

function catatanServer(guildId) {
    if (!db[guildId]) db[guildId] = { users: {}, total: 0 };
    if (!db[guildId].users) db[guildId].users = {};
    return db[guildId];
}

function tambahHitungan(guildId, userId) {
    const server = catatanServer(guildId);
    const sekarang = Date.now();

    const lama = server.users[userId];
    if (lama) {
        lama.jumlah += 1;
        lama.terakhir = sekarang;
    } else {
        server.users[userId] = { jumlah: 1, pertama: sekarang, terakhir: sekarang };
    }

    server.total = (server.total || 0) + 1;
    simpanData();
    return server.users[userId].jumlah;
}

function bacaHitungan(guildId, userId) {
    return db[guildId]?.users?.[userId]?.jumlah || 0;
}

function daftarBooster(guildId, batas = 10) {
    const server = db[guildId];
    if (!server?.users) return [];
    return Object.entries(server.users)
        .map(([id, d]) => ({ id, ...d }))
        .sort((a, b) => (b.jumlah - a.jumlah) || (a.pertama - b.pertama))
        .slice(0, batas);
}

// Satu boost dapat terpantau dari dua sumber sekaligus, yaitu pesan sistem
// dan perubahan keterangan anggota. Penanda ini mencegah keduanya mengumumkan
// hal yang sama dua kali.
//
// Pesan sistem selalu diproses karena dikirim pada setiap boost. Pemantauan
// perubahan anggota yang mengalah, sebab hanya berguna sebagai cadangan.
const penandaBoost = new Map();

function tandaiDiumumkan(userId) {
    penandaBoost.set(userId, Date.now());

    // penanda lama dibersihkan agar tidak menumpuk
    if (penandaBoost.size > 200) {
        const batas = Date.now() - 5 * 60 * 1000;
        for (const [id, t] of penandaBoost) if (t < batas) penandaBoost.delete(id);
    }
}

function baruDiumumkan(userId, jeda = 10000) {
    const t = penandaBoost.get(userId) || 0;
    return Date.now() - t < jeda;
}

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
    } catch { /* pemisah opsional */ }
}

function galeri(c, namaBerkas) {
    if (typeof MediaGalleryBuilder !== 'function' || typeof c.addMediaGalleryComponents !== 'function') return false;
    try {
        c.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(`attachment://${namaBerkas}`)
            )
        );
        return true;
    } catch {
        return false;
    }
}

function tombolRole(c) {
    if (typeof ButtonBuilder !== 'function' || typeof c.addActionRowComponents !== 'function') return;
    try {
        c.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel('Pilih Role Premium')
                    .setURL(`https://discord.com/channels/${c._guildId || '@me'}/${CHANNEL_ROLE_PREMIUM}`)
            )
        );
    } catch { /* tombol opsional */ }
}

function ringkas(warna, bagian) {
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
    message.reply(ringkas(warna, bagian)).catch(() => null);

// ============================================================
//  PENYUSUNAN PENGUMUMAN
// ============================================================

const angka = n => Number(n || 0).toLocaleString('id-ID');

function labelTingkat(guild) {
    const tingkat = guild.premiumTier;
    if (tingkat === 3 || tingkat === 'TIER_3') return 'Level 3';
    if (tingkat === 2 || tingkat === 'TIER_2') return 'Level 2';
    if (tingkat === 1 || tingkat === 'TIER_1') return 'Level 1';
    return 'Belum berlevel';
}

// Sebutan untuk boost berulang
function sebutanBoost(ke) {
    if (ke <= 1) return null;
    if (ke === 2) return 'Boost kedua';
    if (ke === 3) return 'Boost ketiga';
    return `Boost ke ${ke}`;
}

// data = { member, guild, uji, keBerapa }
async function susunPengumuman({ member, guild, uji = false, keBerapa = 1 }) {
    const c = wadah(WARNA.BOOST);
    if (guild) c._guildId = guild.id;

    const avatar = member.displayAvatarURL
        ? member.displayAvatarURL({ extension: 'png', size: 256 })
        : member.user.displayAvatarURL({ extension: 'png', size: 256 });

    const totalBoost = guild.premiumSubscriptionCount || 0;

    // bagian atas, menyesuaikan boost keberapa
    const ulang = keBerapa > 1;
    const judul = ulang
        ? `## ${EMOJI.boost} BOOST LAGI, TERIMA KASIH`
        : `## ${EMOJI.boost} TERIMA KASIH SUDAH BOOST`;
    const pembuka = ulang
        ? `${member} kembali menambah boost untuk ${guild.name}, kali ini yang **ke ${keBerapa}**.`
        : `${member} baru saja melakukan boost untuk ${guild.name}.`;

    c.addTextDisplayComponents(teks(`${judul}\n${pembuka}`));

    pemisah(c);

    // banner
    let berkas = null;
    if (Banner.tersedia()) {
        const buffer = await Banner.buatBanner({
            nama: member.displayName || member.user.username,
            avatar,
            info: sebutanBoost(keBerapa) || 'Terima kasih atas dukungannya',
            keterangan: `${guild.name}`.toUpperCase().slice(0, 40),
        });

        if (buffer) {
            const namaBerkas = 'booster.png';
            berkas = new AttachmentBuilder(buffer, { name: namaBerkas });
            if (!galeri(c, namaBerkas)) berkas = null;
            if (berkas) pemisah(c);
        }
    }

    // keadaan server
    let keterangan =
        `${EMOJI.chart} **KEADAAN SERVER**\n` +
        `${EMOJI.arrow} Total boost saat ini: **${angka(totalBoost)}**\n` +
        `${EMOJI.arrow} Tingkat server: **${labelTingkat(guild)}**`;

    if (ulang) {
        const catatan = db[guild.id]?.users?.[member.id];
        keterangan += `\n\n${EMOJI.medal} **RIWAYAT BOOST**\n` +
            `${EMOJI.arrow} Boost dari kamu: **${keBerapa} kali**`;
        if (catatan?.pertama) {
            keterangan += `\n${EMOJI.arrow} Pertama kali mendukung: <t:${Math.floor(catatan.pertama / 1000)}:D>`;
        }
    }

    c.addTextDisplayComponents(teks(keterangan));

    pemisah(c);

    // benefit
    c.addTextDisplayComponents(teks(
        `${EMOJI.medal} **BENEFIT YANG DITERIMA**\n` +
        BENEFIT.map(b => `${EMOJI.arrow} ${b}`).join('\n') +
        (ulang ? `\n\n> Benefit tidak bertambah pada boost berikutnya, tetapi dukungannya sangat berarti.` : '')
    ));

    pemisah(c);

    // penutup
    const penutup = ulang
        ? `${EMOJI.arrow} Benefit kamu tetap berjalan seperti biasa\n` +
          `${EMOJI.arrow} Atur role premium kapan saja di <#${CHANNEL_ROLE_PREMIUM}>\n\n` +
          `Mendukung berkali kali seperti ini yang benar benar menjaga server tetap hidup. Terima kasih banyak.`
        : `${EMOJI.arrow} Role booster diberikan otomatis oleh Discord\n` +
          `${EMOJI.arrow} Pilih role premium kamu di <#${CHANNEL_ROLE_PREMIUM}>\n` +
          `${EMOJI.arrow} Benefit berlaku selama boost masih aktif\n\n` +
          `Dukungan seperti ini yang membuat server tetap berjalan. Terima kasih.`;

    c.addTextDisplayComponents(teks(penutup));

    const muatan = {
        components: [c],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: uji ? { parse: [] } : { users: [member.id] },
    };
    if (berkas) muatan.files = [berkas];

    return muatan;
}

// ============================================================
//  PENGIRIMAN OTOMATIS
// ============================================================

async function kirimPengumuman(guild, member, keBerapa = 1) {
    if (!CHANNEL_PENGUMUMAN) {
        console.warn('[BOOSTER] BOOSTER_ANNOUNCE_CHANNEL_ID belum diisi, pengumuman dilewati.');
        return false;
    }

    const channel = await guild.client.channels.fetch(CHANNEL_PENGUMUMAN).catch(() => null);
    if (!channel) {
        console.error('[BOOSTER] channel pengumuman tidak ditemukan:', CHANNEL_PENGUMUMAN);
        return false;
    }

    const muatan = await susunPengumuman({ member, guild, keBerapa });
    const terkirim = await channel.send(muatan).catch(err => {
        console.error('[BOOSTER] gagal mengirim pengumuman:', err.message);
        return null;
    });

    if (terkirim) console.log(`[BOOSTER] pengumuman dikirim untuk ${member.user.tag}, boost ke ${keBerapa}`);
    return Boolean(terkirim);
}

// Dipanggil dari event guildMemberUpdate.
// Hanya menangkap boost pertama, karena setelah itu keterangan premiumSince
// tidak berubah lagi walau seseorang menambah boost.
async function handleMemberUpdate(oldMember, newMember) {
    try {
        const sebelum = oldMember.premiumSince;
        const sesudah = newMember.premiumSince;

        if (sebelum || !sesudah) return;

        // memberi kesempatan pesan sistem tiba lebih dulu
        await new Promise(r => setTimeout(r, 5000));
        if (baruDiumumkan(newMember.id)) return;

        tandaiDiumumkan(newMember.id);
        const ke = tambahHitungan(newMember.guild.id, newMember.id);
        await kirimPengumuman(newMember.guild, newMember, ke);
    } catch (err) {
        console.error('[BOOSTER] galat pada pemantauan boost:', err.message);
    }
}

// Jenis pesan sistem yang dikirim Discord setiap kali ada boost,
// termasuk boost kedua dan seterusnya.
const JENIS_BOOST = new Set([
    MessageType?.UserPremiumGuildSubscription,
    MessageType?.UserPremiumGuildSubscriptionTier1,
    MessageType?.UserPremiumGuildSubscriptionTier2,
    MessageType?.UserPremiumGuildSubscriptionTier3,
].filter(v => v !== undefined));

// Dipanggil dari event messageCreate.
// Inilah sumber utama penghitungan, karena pesan sistem dikirim pada setiap
// boost, bukan hanya yang pertama.
async function handleSystemMessage(message) {
    try {
        if (!message.guild) return;
        if (!JENIS_BOOST.has(message.type)) return;

        const member = message.member
            || await message.guild.members.fetch(message.author.id).catch(() => null);
        if (!member) return;

        tandaiDiumumkan(member.id);
        const ke = tambahHitungan(message.guild.id, member.id);
        await kirimPengumuman(message.guild, member, ke);
    } catch (err) {
        console.error('[BOOSTER] galat pada pesan sistem boost:', err.message);
    }
}

// ============================================================
//  COMMAND UJI
// ============================================================

function bantuan() {
    return [
        `## ${EMOJI.boost} Uji Pengumuman Booster`,

        `**Cara pakai**\n` +
        `${EMOJI.arrow} \`${PREFIX}boostertest\` contoh boost pertama memakai akun kamu\n` +
        `${EMOJI.arrow} \`${PREFIX}boostertest 3\` contoh tampilan boost ke tiga\n` +
        `${EMOJI.arrow} \`${PREFIX}boostertest @user 2\` contoh boost kedua memakai anggota lain\n` +
        `${EMOJI.arrow} \`${PREFIX}boostertest kirim\` kirim sungguhan ke channel pengumuman\n` +
        `${EMOJI.arrow} \`${PREFIX}boostertest daftar\` lihat siapa saja yang tercatat pernah boost`,

        `**Catatan**\n` +
        `${EMOJI.arrow} Tanpa kata kirim, contoh hanya muncul di channel ini\n` +
        `${EMOJI.arrow} Anggota yang dijadikan contoh tidak akan disebut\n` +
        `${EMOJI.arrow} Channel pengumuman: ${CHANNEL_PENGUMUMAN ? `<#${CHANNEL_PENGUMUMAN}>` : '**belum diatur**'}`,
    ];
}

async function handleMessage(message) {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();
        if (!COMMAND.includes(command)) return;

        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

        if (args[0]?.toLowerCase() === 'help') {
            return message.channel.send(ringkas(WARNA.BOOST, bantuan())).catch(() => null);
        }

        // daftar booster yang tercatat
        if (args[0]?.toLowerCase() === 'daftar' || args[0]?.toLowerCase() === 'list') {
            const daftar = daftarBooster(message.guild.id, 15);
            if (!daftar.length) {
                return balas(message, WARNA.BOOST, `## Daftar Booster`,
                    'Belum ada boost yang tercatat sejak fitur ini berjalan.');
            }
            const total = db[message.guild.id]?.total || 0;
            return message.channel.send(ringkas(WARNA.BOOST, [
                `## ${EMOJI.boost} Booster Tercatat`,
                daftar.map((d, i) =>
                    `**${i + 1}.** <@${d.id}> ${EMOJI.arrow} ${d.jumlah} kali` +
                    `\nPertama <t:${Math.floor(d.pertama / 1000)}:D>`).join('\n\n'),
                `${EMOJI.chart} Total ${angka(total)} boost tercatat sejak fitur berjalan.\n` +
                `Boost sebelum fitur ini ada tidak ikut terhitung.`,
            ])).catch(() => null);
        }

        const kirimSungguhan = args.some(a => ['kirim', 'send', 'real'].includes(a.toLowerCase()));

        // boost keberapa yang ingin dicontohkan
        const angkaUji = args.find(a => /^\d{1,3}$/.test(a));
        const keBerapaUji = angkaUji ? Math.max(1, parseInt(angkaUji, 10)) : null;

        // anggota yang dijadikan contoh
        const disebut = message.mentions.members?.first();
        const idMentah = args.find(a => /^\d{17,20}$/.test(a.replace(/[<@!>]/g, '')));
        let member = disebut;

        if (!member && idMentah) {
            member = await message.guild.members.fetch(idMentah.replace(/[<@!>]/g, '')).catch(() => null);
        }
        if (!member) member = message.member;

        if (kirimSungguhan) {
            if (!CHANNEL_PENGUMUMAN) {
                return balas(message, WARNA.PERINGATAN,
                    `## Channel Belum Diatur`,
                    `Isi \`BOOSTER_ANNOUNCE_CHANNEL_ID\` pada config terlebih dahulu.`);
            }

            const ke = keBerapaUji || bacaHitungan(message.guild.id, member.id) || 1;
            const ok = await kirimPengumuman(message.guild, member, ke);
            return balas(message, ok ? WARNA.SUKSES : WARNA.PERINGATAN,
                ok ? `## Pengumuman Dikirim` : `## Gagal Mengirim`,
                ok
                    ? `${EMOJI.arrow} Anggota: ${member}\n${EMOJI.arrow} Channel: <#${CHANNEL_PENGUMUMAN}>`
                    : `${EMOJI.arrow} Periksa izin bot pada channel pengumuman.`);
        }

        // pratinjau
        await message.channel.send(ringkas(WARNA.BOOST, [
            `${EMOJI.chart} Contoh pengumuman booster. Tidak dikirim ke channel pengumuman dan tidak menyebut siapa pun.`,
        ])).catch(() => null);

        const muatan = await susunPengumuman({
            member,
            guild: message.guild,
            uji: true,
            keBerapa: keBerapaUji || bacaHitungan(message.guild.id, member.id) || 1,
        });
        await message.channel.send(muatan).catch(err =>
            balas(message, WARNA.PERINGATAN, `Gagal menampilkan contoh: ${err.message}`));
    } catch (err) {
        console.error('[BOOSTER] galat command:', err);
        balas(message, WARNA.PERINGATAN, `Terjadi kesalahan: ${err.message}`);
    }
}

module.exports = {
    handleMessage,
    handleMemberUpdate,
    handleSystemMessage,
    bacaHitungan,
    daftarBooster,
    susunPengumuman,
    kirimPengumuman,
    BENEFIT,
    adaV2,
};
