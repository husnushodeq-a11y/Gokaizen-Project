// utils/motmVoiceTicker.js
// Pemberian poin suara secara berkala.
//
// Cara lama menghitung selisih waktu masuk dan keluar. Cara itu punya dua
// kelemahan. Pertama, seluruh waktu hilang bila bot sempat dimatikan saat
// anggota masih berada di voice. Kedua, keadaan seperti sendirian di channel
// atau mematikan suara masuk tidak terpantau selama sesi berlangsung.
//
// Di sini keadaan diperiksa ulang setiap beberapa menit, lalu poin diberikan
// hanya kepada yang memang sedang ikut berkegiatan.

const { POIN } = require('./motmConfig');
const D = require('./motmData');

let timer = null;

// Memeriksa apakah seorang anggota layak menerima poin saat ini
function layakDapatPoin(member, channel, guild) {
    if (!member || member.user.bot) return false;

    // channel khusus menunggu tidak dihitung
    if (guild.afkChannelId && channel.id === guild.afkChannelId) return false;

    const suara = member.voice;
    if (!suara) return false;

    // dibisukan oleh moderator berarti sedang tidak ikut
    if (suara.serverDeaf) return false;

    if (POIN.VOICE_ABAIKAN_DEAFEN && suara.selfDeaf) return false;
    if (POIN.VOICE_ABAIKAN_MUTE && suara.selfMute) return false;

    return true;
}

// Satu putaran pemberian poin
function putaran(guild) {
    if (!guild) return { diberi: 0, poin: 0 };

    let diberi = 0;
    let totalPoin = 0;

    for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased?.()) continue;
        if (!channel.members || channel.members.size === 0) continue;

        // hanya manusia yang dihitung sebagai teman bicara
        const manusia = channel.members.filter(m => !m.user.bot);
        if (manusia.size < POIN.VOICE_MIN_ORANG) continue;

        for (const member of manusia.values()) {
            if (!layakDapatPoin(member, channel, guild)) continue;

            const dapat = D.tambahVoice(member.id, POIN.VOICE_PER_MENIT, member.displayName);
            if (dapat > 0) {
                diberi += 1;
                totalPoin += dapat;
            }
        }
    }

    return { diberi, poin: totalPoin };
}

function mulai(client, guild) {
    if (timer) return;

    const selang = POIN.VOICE_SETIAP_MENIT * 60 * 1000;

    timer = setInterval(() => {
        try {
            const g = guild || client.guilds.cache.first();
            const hasil = putaran(g);
            if (hasil.diberi > 0) {
                console.log(`[MOTM] poin suara diberikan kepada ${hasil.diberi} anggota`);
            }
        } catch (err) {
            console.error('[MOTM] galat pemberian poin suara:', err.message);
        }
    }, selang);

    if (typeof timer.unref === 'function') timer.unref();

    const syarat = [
        `minimal ${POIN.VOICE_MIN_ORANG} orang di channel`,
        POIN.VOICE_ABAIKAN_DEAFEN ? 'tidak mematikan suara masuk' : null,
        POIN.VOICE_ABAIKAN_MUTE ? 'tidak mematikan mikrofon' : null,
        POIN.VOICE_BATAS_HARIAN > 0 ? `batas ${POIN.VOICE_BATAS_HARIAN} poin per hari` : null,
    ].filter(Boolean).join(', ');

    console.log(`[MOTM] penghitung suara dimulai setiap ${POIN.VOICE_SETIAP_MENIT} menit. Syarat: ${syarat}`);
}

module.exports = { mulai, putaran, layakDapatPoin };
