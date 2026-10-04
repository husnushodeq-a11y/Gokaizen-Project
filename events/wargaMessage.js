// events/wargaMessage.js
// Mencatat poin obrolan di channel general.
//
// Dua pengaman dipakai agar poin mencerminkan percakapan, bukan pengiriman
// pesan beruntun: pesan terlalu pendek diabaikan, dan ada jeda antar pesan
// yang dihitung.

const { CHANNEL, POIN } = require('../utils/motmConfig');
const D = require('../utils/motmData');

// userId -> waktu pesan terakhir yang dihitung
const jedaTerakhir = new Map();

// Membersihkan catatan jeda yang sudah lama agar tidak menumpuk di memori
setInterval(() => {
    const batas = Date.now() - 60 * 60 * 1000;
    for (const [id, waktu] of jedaTerakhir) {
        if (waktu < batas) jedaTerakhir.delete(id);
    }
}, 30 * 60 * 1000).unref?.();

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        try {
            if (!message.guild || message.author.bot) return;
            if (message.channelId !== CHANNEL.GENERAL) return;

            // pesan terlalu pendek tidak dihitung
            const isi = (message.content || '').trim();
            if (isi.length < POIN.CHAT_MIN_HURUF) return;

            // jeda antar pesan yang dihitung
            if (POIN.CHAT_JEDA_DETIK > 0) {
                const terakhir = jedaTerakhir.get(message.author.id) || 0;
                if (Date.now() - terakhir < POIN.CHAT_JEDA_DETIK * 1000) return;
                jedaTerakhir.set(message.author.id, Date.now());
            }

            D.tambahChat(
                message.author.id,
                message.member?.displayName || message.author.displayName || message.author.username
            );
        } catch (err) {
            console.error('[MOTM] galat pencatatan obrolan:', err.message);
        }
    },
};
