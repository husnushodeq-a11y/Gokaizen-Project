// events/counting.js
// Permainan hitung angka. Ditulis sebagai modul event, bukan bot berdiri sendiri.

const fs = require('fs');
const path = require('path');

const COUNTING_CHANNEL_ID = '1385361061590335609';

// File yang sama dengan versi sebelumnya, jadi hitungan lama tidak hilang.
const DATA_FILE = path.join(__dirname, '..', 'data.json');

// Batas panjang ekspresi, supaya tidak ada perhitungan yang membebani proses.
const MAX_EXPR = 60;

let data = { lastNumber: 0, lastUserId: null };

try {
    if (fs.existsSync(DATA_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        if (typeof parsed.lastNumber === 'number') {
            data = { lastNumber: parsed.lastNumber, lastUserId: parsed.lastUserId ?? null };
        }
    }
} catch (err) {
    console.error('[COUNTING] gagal membaca data.json:', err.message);
}

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('[COUNTING] gagal menyimpan data.json:', err.message);
    }
}

// Menerima angka biasa maupun ekspresi seperti 12+3, 5x4, atau 20:2
function evaluateMath(expression) {
    try {
        if (!expression || expression.length > MAX_EXPR) return NaN;

        const clean = expression
            .replace(/\s+/g, '')
            .replace(/[`]+/g, '')
            .replace(/[^0-9+\-*/x:.()]/gi, '')
            .replace(/x/gi, '*')
            .replace(/:/g, '/');

        if (!clean) return NaN;
        if (!/^[0-9+\-*/().]+$/.test(clean)) return NaN;

        // Pangkat ditolak karena bentuk seperti 9**9**9 bisa membekukan proses.
        if (clean.includes('**')) return NaN;

        const hasil = Function('"use strict"; return (' + clean + ')')();
        return Number.isFinite(hasil) && hasil > 0 ? Math.floor(hasil) : NaN;
    } catch {
        return NaN;
    }
}

async function tolak(message) {
    await message.react('❌').catch(() => {});
    return message.delete().catch(() => {});
}

async function proses(message) {
    const hasil = evaluateMath(message.content.trim());

    if (isNaN(hasil)) return tolak(message);

    // tidak boleh menghitung dua kali berturut-turut
    if (message.author.id === data.lastUserId) return tolak(message);

    if (hasil !== data.lastNumber + 1) return tolak(message);

    data.lastNumber = hasil;
    data.lastUserId = message.author.id;
    saveData();

    await message.react('✅').catch(() => {});
}

// Pesan diproses satu per satu. Tanpa ini, dua orang yang mengirim angka
// bersamaan sama-sama membaca hitungan lama, lalu dua-duanya diterima.
let antrean = Promise.resolve();

module.exports = {
    name: 'messageCreate',

    execute(message) {
        if (!message.guild || message.author.bot) return;
        if (message.channel.id !== COUNTING_CHANNEL_ID) return;

        antrean = antrean
            .catch(() => {})
            .then(() => proses(message))
            .catch(err => console.error('[COUNTING] error:', err.message));

        return antrean;
    },
};
