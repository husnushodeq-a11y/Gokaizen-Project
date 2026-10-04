// utils/reactSystem.js
// Menambahkan reaksi ke sebuah pesan secara berurutan.
//
// Discord membatasi satu pesan hanya boleh memiliki 20 jenis reaksi, dan
// pemasangan yang terlalu cepat akan terkena pembatasan laju. Karena itu
// pemasangan diberi jeda dan jumlahnya dijaga.
//
// Dipakai oleh events/reactCommands.js

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
    PermissionsBitField,
} = require('discord.js');

const PREFIX = 'g!';

// Batas jumlah reaksi berbeda pada satu pesan menurut Discord
const BATAS_REAKSI = 20;

// Jeda antar pemasangan reaksi, dalam milidetik
const JEDA = 300;

const WARNA = {
    UTAMA: 0x5865F2,
    SUKSES: 0x57F287,
    PERINGATAN: 0xED4245,
};

const EMOJI_ARROW = '<a:arrow:1532795180770660382>';

// ============================================================
//  TAMPILAN
// ============================================================

const adaV2 =
    typeof ContainerBuilder === 'function' &&
    typeof TextDisplayBuilder === 'function' &&
    MessageFlags && MessageFlags.IsComponentsV2 !== undefined;

const teks = isi => new TextDisplayBuilder().setContent(isi);

function susun(warna, bagian) {
    if (!adaV2) {
        return { content: bagian.join('\n\n'), allowedMentions: { parse: [], repliedUser: false } };
    }

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

// ============================================================
//  PEMBACAAN SASARAN
// ============================================================

// Menerima beberapa bentuk penulisan:
//   1234567890                             id pesan pada channel yang sama
//   1111-2222                              id channel dan id pesan
//   https://discord.com/channels/a/b/c      tautan pesan
function bacaSasaran(token) {
    if (!token) return null;

    const tautan = token.match(/channels\/(\d+|@me)\/(\d+)\/(\d+)/);
    if (tautan) return { channelId: tautan[2], messageId: tautan[3] };

    const gabungan = token.match(/^(\d{17,20})-(\d{17,20})$/);
    if (gabungan) return { channelId: gabungan[1], messageId: gabungan[2] };

    if (/^\d{17,20}$/.test(token)) return { channelId: null, messageId: token };

    return null;
}

// ============================================================
//  PEMBACAAN EMOJI
// ============================================================

// Memisahkan daftar emoji dari sisa argumen.
// Emoji server ditulis <:nama:id> atau <a:nama:id>, sedangkan emoji bawaan
// ditulis apa adanya. Keduanya diterima dan urutannya dipertahankan.
// Menangkap emoji bawaan satu per satu, termasuk bendera, warna kulit,
// dan gabungan yang disambung penanda khusus.
const POLA_BAWAAN = new RegExp(
    [
        '\\p{RI}\\p{RI}',
        '[0-9#*]\\uFE0F?\\u20E3',
        '\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic}|[\\u{1F3FB}-\\u{1F3FF}])*',
    ].join('|'),
    'gu'
);

function bacaEmoji(args) {
    const hasil = [];
    const terlihat = new Set();

    const tambah = (tampil, pakai) => {
        if (terlihat.has(pakai)) return;
        terlihat.add(pakai);
        hasil.push({ tampil, pakai });
    };

    for (const token of args) {
        if (!token) continue;

        // emoji server bisa tertulis menempel tanpa spasi
        const kustom = token.match(/<a?:\w+:\d+>/g);
        if (kustom) {
            for (const e of kustom) tambah(e, e.replace(/^<|>$/g, ''));
        }

        // sisa teks setelah emoji server diambil, kemungkinan berisi emoji bawaan
        const sisa = token.replace(/<a?:\w+:\d+>/g, '');
        if (!sisa.trim()) continue;
        if (/^\d{17,20}$/.test(sisa.trim())) continue; // id pesan, bukan emoji

        // beberapa emoji bawaan sering ditempel berdempetan, jadi dipisah satu per satu
        const bawaan = sisa.match(POLA_BAWAAN);
        if (bawaan) {
            for (const e of bawaan) tambah(e, e);
        }
    }

    return hasil;
}

// ============================================================
//  PEMASANGAN REAKSI
// ============================================================

const tidur = ms => new Promise(r => setTimeout(r, ms));

async function ambilPesan(message, sasaran) {
    // membalas sebuah pesan dianggap menunjuk pesan tersebut
    if (!sasaran && message.reference?.messageId) {
        return message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    }
    if (!sasaran) return null;

    const channel = sasaran.channelId
        ? await message.client.channels.fetch(sasaran.channelId).catch(() => null)
        : message.channel;

    if (!channel || typeof channel.messages?.fetch !== 'function') return null;

    return channel.messages.fetch(sasaran.messageId).catch(() => null);
}

async function pasangReaksi(target, daftar) {
    const berhasil = [];
    const gagal = [];

    for (const e of daftar) {
        try {
            await target.react(e.pakai);
            berhasil.push(e.tampil);
        } catch (err) {
            gagal.push({ emoji: e.tampil, alasan: ringkasGalat(err.message) });
        }
        await tidur(JEDA);
    }

    return { berhasil, gagal };
}

function ringkasGalat(pesan) {
    if (!pesan) return 'tidak diketahui';
    if (/Unknown Emoji|Invalid Form/i.test(pesan)) return 'emoji tidak dikenali atau bot tidak punya aksesnya';
    if (/Missing Permissions/i.test(pesan)) return 'bot tidak punya izin Add Reactions di channel itu';
    if (/Maximum number of reactions/i.test(pesan)) return 'pesan sudah mencapai batas 20 reaksi';
    if (/rate limit/i.test(pesan)) return 'terkena pembatasan laju';
    return pesan;
}

// ============================================================
//  COMMAND: g!react
// ============================================================

function bantuan() {
    return [
        `## Memasang Reaksi`,
        `\`${PREFIX}react <pesan> <emoji...>\`\n\n` +
        `Bot akan memasang seluruh emoji ke pesan tersebut sesuai urutan penulisan.`,

        `**Cara menunjuk pesan**\n` +
        `${EMOJI_ARROW} Tempel **tautan pesan**, cara paling mudah lewat ponsel\n` +
        `${EMOJI_ARROW} Tulis **id pesan** bila pesannya ada di channel yang sama\n` +
        `${EMOJI_ARROW} Atau cukup **balas pesannya**, lalu tulis emojinya saja`,

        `**Contoh**\n` +
        `${EMOJI_ARROW} \`${PREFIX}react https://discord.com/channels/1/2/3 👍 ❤️ 🔥\`\n` +
        `${EMOJI_ARROW} \`${PREFIX}react 1234567890123456789 ✅ ❌\`\n` +
        `${EMOJI_ARROW} Balas sebuah pesan lalu ketik \`${PREFIX}react 🎉 😂\``,

        `**Catatan**\n` +
        `${EMOJI_ARROW} Satu pesan paling banyak menampung ${BATAS_REAKSI} jenis reaksi\n` +
        `${EMOJI_ARROW} Emoji server hanya bisa dipasang bila bot ikut di server pemiliknya\n` +
        `${EMOJI_ARROW} Hapus seluruh reaksi bot dengan \`${PREFIX}unreact <pesan>\``,
    ];
}

async function cmdReact(message, args) {
    const sasaran = bacaSasaran(args[0]);
    const sisa = sasaran ? args.slice(1) : args;
    const daftar = bacaEmoji(sisa);

    if (!daftar.length) {
        return message.channel.send(susun(WARNA.UTAMA, bantuan())).catch(() => null);
    }

    const target = await ambilPesan(message, sasaran);
    if (!target) {
        return balas(message, WARNA.PERINGATAN,
            `## Pesan Tidak Ditemukan`,
            `Pastikan tautan atau id pesannya benar, dan bot bisa melihat channel tempat pesan itu berada.\n\n` +
            `Cara lain yang lebih mudah, balas langsung pesannya lalu ketik \`${PREFIX}react\` diikuti emojinya.`);
    }

    // periksa izin sebelum mulai, agar tidak gagal satu per satu
    const izin = target.channel.permissionsFor?.(message.guild.members.me);
    if (izin && !izin.has(PermissionsBitField.Flags.AddReactions)) {
        return balas(message, WARNA.PERINGATAN,
            `## Izin Kurang`,
            `Bot tidak punya izin **Add Reactions** di ${target.channel}.`);
    }

    const sudahAda = target.reactions?.cache?.size || 0;
    const ruang = Math.max(0, BATAS_REAKSI - sudahAda);

    if (ruang === 0) {
        return balas(message, WARNA.PERINGATAN,
            `## Sudah Penuh`,
            `Pesan tersebut sudah memiliki ${BATAS_REAKSI} jenis reaksi, yaitu batas dari Discord.`);
    }

    const dipakai = daftar.slice(0, ruang);
    const terpotong = daftar.length - dipakai.length;

    const hasil = await pasangReaksi(target, dipakai);

    let isi = `${EMOJI_ARROW} Berhasil: ${hasil.berhasil.length} dari ${dipakai.length}`;
    if (hasil.berhasil.length) isi += `\n${EMOJI_ARROW} ${hasil.berhasil.join(' ')}`;

    const bagian = [`## Reaksi Dipasang`, isi];

    if (hasil.gagal.length) {
        bagian.push(
            `**Gagal Dipasang**\n` +
            hasil.gagal.map(g => `${EMOJI_ARROW} ${g.emoji} ${String.fromCharCode(0x2022)} ${g.alasan}`).join('\n')
        );
    }

    if (terpotong > 0) {
        bagian.push(
            `**Tidak Muat**\n` +
            `${EMOJI_ARROW} ${terpotong} emoji dilewati karena pesan hanya menampung ${BATAS_REAKSI} jenis reaksi`
        );
    }

    await balas(message, hasil.gagal.length ? WARNA.UTAMA : WARNA.SUKSES, ...bagian);

    console.log(`[REACT] ${hasil.berhasil.length} reaksi dipasang oleh ${message.author.tag} pada pesan ${target.id}`);
}

// ============================================================
//  COMMAND: g!unreact
// ============================================================

async function cmdUnreact(message, args) {
    const sasaran = bacaSasaran(args[0]);
    const target = await ambilPesan(message, sasaran);

    if (!target) {
        return balas(message, WARNA.PERINGATAN,
            `## Cara Pakai`,
            `\`${PREFIX}unreact <pesan>\`\n\n` +
            `Menghapus seluruh reaksi yang dipasang bot. Bisa juga dengan membalas pesannya langsung.`);
    }

    const botId = message.client.user.id;
    let dihapus = 0;

    for (const reaksi of target.reactions.cache.values()) {
        try {
            const pengguna = await reaksi.users.fetch().catch(() => null);
            if (pengguna && pengguna.has(botId)) {
                await reaksi.users.remove(botId);
                dihapus += 1;
                await tidur(JEDA);
            }
        } catch { /* lanjutkan ke reaksi berikutnya */ }
    }

    await balas(message, WARNA.SUKSES,
        `## Reaksi Dihapus`,
        `${EMOJI_ARROW} ${dihapus} reaksi bot dihapus dari pesan tersebut`);
}

// ============================================================
//  PENYALUR
// ============================================================

async function handleMessage(message) {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();

        if (!['react', 'reaksi', 'unreact', 'unreaksi'].includes(command)) return;

        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

        if (command === 'react' || command === 'reaksi') return cmdReact(message, args);
        return cmdUnreact(message, args);
    } catch (err) {
        console.error('[REACT] galat:', err);
        balas(message, WARNA.PERINGATAN, `Terjadi kesalahan: ${err.message}`);
    }
}

module.exports = { handleMessage, bacaEmoji, bacaSasaran };
