// events/Sambungkata.js
// Permainan sambung kata.
//
// Versi sebelumnya adalah skrip bot berdiri sendiri: membuat Client baru,
// memakai token yang ditulis langsung di file, lalu login sendiri. File itu
// tidak pernah terdaftar di loader event, jadi fiturnya memang tidak pernah
// jalan lewat gokaizen. Sekarang bentuknya modul event yang benar.

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const db = require('../db/database.js');
const dbStore = require('../utils/dbStore');

let botConfig = {};
try {
    botConfig = require('../config.json');
} catch {
    botConfig = {};
}

// ============================================================
//  KONFIGURASI
// ============================================================

const CHANNEL_ID = botConfig.SAMBUNGKATA_CHANNEL_ID || '1352377050182320128';
const MAX_CHAR = 4096;
const STORE_KEY = 'sambungkataEmbed';

// Kata "reset" mengosongkan seluruh kalimat. Dibatasi ke pengurus supaya
// tidak ada yang menghapus kalimat panjang secara iseng.
const RESET_REQUIRES_PERMISSION = true;

// Panjang kata yang diterima
const MIN_HURUF = 3;
const MAX_HURUF = 15;

// ============================================================
//  POLA
// ============================================================

// Penting: tanpa penanda g. Pola bertanda g menyimpan posisi terakhir di
// dalam dirinya, sehingga pemanggilan test yang berulang pada masukan sama
// bisa bergantian benar dan salah. Itu membuat pesan terhapus secara acak.
const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
const customEmojiRegex = /<a?:\w+:\d+>/;
const validWordRegex = new RegExp(`^[a-z]{${MIN_HURUF},${MAX_HURUF}}$`);

// ============================================================
//  UTILITAS
// ============================================================

const getSentence = () => new Promise(resolve => {
    try {
        db.getSentence(resolve);
    } catch (err) {
        console.error('[SAMBUNGKATA] gagal baca kalimat:', err.message);
        resolve('');
    }
});

// Salinan kalimat di memori.
//
// db.saveSentence menulis file tanpa memberi tahu kapan selesai, sedangkan
// db.getSentence membaca file itu lagi. Kalau hanya bersandar pada file, kata
// yang baru disimpan bisa belum mendarat saat kata berikutnya dibaca, sehingga
// ada kata yang hilang. Memori dipakai sebagai acuan, file tetap ditulis supaya
// kalimat tidak hilang ketika bot dimatikan.
let kalimatCache = null;

async function muatKalimat() {
    if (kalimatCache === null) kalimatCache = await getSentence();
    return kalimatCache;
}

function simpanKalimat(nilai) {
    kalimatCache = nilai;
    db.saveSentence(nilai);
}

function resetKalimat() {
    kalimatCache = '';
    db.resetSentence();
}

// Disimpan supaya embed lama tetap bisa dihapus walau bot sempat restart.
// Versi lama menyimpannya hanya di memori, jadi embed menumpuk tiap restart.
function simpanEmbedId(id) {
    try {
        dbStore.set(STORE_KEY, id);
    } catch { /* penyimpanan gagal tidak boleh menghentikan permainan */ }
}

function ambilEmbedId() {
    try {
        return dbStore.get(STORE_KEY) || null;
    } catch {
        return null;
    }
}

async function hapusEmbedLama(channel) {
    const id = ambilEmbedId();
    if (!id) return;

    const pesan = await channel.messages.fetch(id).catch(() => null);
    if (pesan) await pesan.delete().catch(() => null);

    simpanEmbedId(null);
}

async function kirimEmbed(channel, embed) {
    const pesan = await channel.send({ embeds: [embed] }).catch(() => null);
    if (pesan) simpanEmbedId(pesan.id);
    return pesan;
}

// ============================================================
//  ANTREAN
// ============================================================

// Dua kata yang dikirim hampir bersamaan bisa membaca kalimat lama yang sama,
// lalu saling menimpa sehingga satu kata hilang. Antrean mencegahnya.
let antrean = Promise.resolve();

function enqueue(task) {
    const jalan = antrean.catch(() => {}).then(task);
    antrean = jalan;
    return jalan;
}

// ============================================================
//  HANDLER
// ============================================================

module.exports = {
    name: 'messageCreate',

    async execute(message) {
        if (!message.guild || message.author.bot) return;
        if (message.channel.id !== CHANNEL_ID) return;

        const isi = message.content || '';

        // Saringan cepat, tidak perlu masuk antrean
        if (
            message.mentions.users.size > 0 ||
            message.mentions.everyone ||
            message.stickers.size > 0 ||
            message.attachments.size > 0 ||
            customEmojiRegex.test(isi) ||
            emojiRegex.test(isi)
        ) {
            return message.delete().catch(() => null);
        }

        const kata = isi.trim().split(/\s+/).filter(Boolean);
        if (kata.length !== 1) {
            return message.delete().catch(() => null);
        }

        const bersih = kata[0].toLowerCase();
        if (!validWordRegex.test(bersih)) {
            return message.delete().catch(() => null);
        }

        // Perintah reset
        if (bersih === 'reset') {
            const boleh = !RESET_REQUIRES_PERMISSION ||
                message.member.permissions.has(PermissionsBitField.Flags.ManageMessages);

            if (!boleh) return message.delete().catch(() => null);

            return enqueue(async () => {
                try {
                    resetKalimat();
                    await hapusEmbedLama(message.channel);
                    console.log(`[SAMBUNGKATA] kalimat direset oleh ${message.author.tag}`);
                } catch (err) {
                    console.error('[SAMBUNGKATA] gagal reset:', err.message);
                }
            });
        }

        return enqueue(async () => {
            try {
                const kalimatLama = await muatKalimat();
                const kalimatBaru = kalimatLama ? `${kalimatLama} ${bersih}` : bersih;

                // Kalimat melewati batas panjang embed
                if (kalimatBaru.length > MAX_CHAR) {
                    resetKalimat();
                    await hapusEmbedLama(message.channel);

                    await kirimEmbed(message.channel, new EmbedBuilder()
                        .setColor('Red')
                        .setTitle('❗ Kalimat Terlalu Panjang')
                        .setDescription(`Kalimat melebihi **${MAX_CHAR}** karakter dan telah direset.`));

                    return;
                }

                simpanKalimat(kalimatBaru);

                const totalKata = kalimatBaru.split(' ').length;

                await hapusEmbedLama(message.channel);

                await kirimEmbed(message.channel, new EmbedBuilder()
                    .setColor('Blue')
                    .setTitle('🧩 Sambung Kata')
                    .setDescription(`**${kalimatBaru}**`)
                    .setFooter({
                        text: `Ditambahkan oleh ${message.author.username} • Total kata: ${totalKata}`,
                    }));
            } catch (err) {
                console.error('[SAMBUNGKATA] error:', err.message);
            }
        });
    },
};
