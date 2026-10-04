// utils/wargaPoints.js
//
// BERKAS PENGGANTI.
//
// Sistem poin lama sudah digantikan oleh motmData, motmBoard, dan motmScheduler.
// Berkas ini sengaja dibiarkan ada karena index.js masih memanggilnya, sehingga
// bot tetap bisa menyala tanpa perlu menyunting index.js terlebih dahulu.
//
// Seluruh fungsi di sini tidak melakukan apa pun. Yang penting, berkas ini
// TIDAK menulis ke warga_data.json dan TIDAK menjalankan interval apa pun,
// sehingga tidak bertabrakan dengan sistem baru.
//
// Langkah bersih berikutnya adalah menghapus pemanggilan wargaPoints dari
// index.js, lalu berkas ini boleh ikut dihapus.

const D = require('./motmData');

let sudahMemberitahu = false;

function beritahuSekali() {
    if (sudahMemberitahu) return;
    sudahMemberitahu = true;
    console.warn(
        '[WARGA] utils/wargaPoints.js hanya berkas pengganti. ' +
        'Pencatatan poin kini ditangani sistem Member of the Month. ' +
        'Hapus pemanggilannya dari index.js bila sudah sempat.'
    );
}

// Pengaturan lama, disediakan agar pembacaan properti tidak menimbulkan galat
const CONFIG = {
    GENERAL_CHANNEL_ID: '',
    VOICE_POINTS_PER_5MIN: 0,
    CHAT_POINTS_PER_MESSAGE: 0,
    CHAT_DAILY_LIMIT_POINTS: 0,
    LIVE_UPDATE_INTERVAL: 0,
};

// Kunci waktu diteruskan ke sistem baru agar tetap konsisten bila dipakai
const getDayKey = (...a) => D.kunciHari(...a);
const getMonthKey = (...a) => D.kunciBulan(...a);
const getYearKey = (...a) => D.kunciTahun(...a);

const getUser = userId => D.ambilUser(userId);

function getUserTotalPoints(userId) {
    const voice = D.bacaPoin(userId, 'bulanan', 'voice');
    const chat = D.bacaPoin(userId, 'bulanan', 'chat');
    return voice + chat;
}

// Tidak melakukan penulisan. Penyimpanan diatur oleh motmData.
function saveData() {
    beritahuSekali();
}

// Pencatatan poin kini ditangani events/wargaMessage.js dan events/wargaVoice.js
function handleWargaMessage() {
    beritahuSekali();
}

function handleWargaVoiceState() {
    beritahuSekali();
}

// Papan peringkat kini dipasang oleh motmScheduler, bukan dari sini
function initWargaPoints() {
    beritahuSekali();
}

function buildTopEmbed() {
    beritahuSekali();
    return null;
}

function buildLiveEmbed() {
    beritahuSekali();
    return null;
}

module.exports = {
    CONFIG,
    db: D.db,
    saveData,
    getUser,
    getMonthKey,
    getYearKey,
    getDayKey,
    getUserTotalPoints,
    buildTopEmbed,
    buildLiveEmbed,
    initWargaPoints,
    handleWargaVoiceState,
    handleWargaMessage,
};
