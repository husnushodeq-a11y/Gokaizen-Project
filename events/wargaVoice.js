// events/wargaVoice.js
// Mencatat nama tampilan ketika anggota masuk voice.
//
// Penghitungan poin suara TIDAK lagi dilakukan di sini. Pemberian poin
// ditangani utils/motmVoiceTicker.js yang memeriksa keadaan setiap beberapa
// menit, sehingga waktu tidak hilang saat bot dimatikan dan keadaan seperti
// sendirian di channel ikut diperhitungkan.

const D = require('../utils/motmData');

module.exports = {
    name: 'voiceStateUpdate',
    once: false,
    async execute(oldState, newState) {
        try {
            const member = newState.member || oldState.member;
            if (!member || member.user.bot) return;
            if (!newState.channelId) return;

            D.setNama(member.id, member.displayName);
        } catch (err) {
            console.error('[MOTM] galat pencatatan nama suara:', err.message);
        }
    },
};
