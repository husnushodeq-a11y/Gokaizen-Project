const fs = require('fs');
const path = require('path');
const log = require('./moderationLogger');

// Gunakan gemini-2.5-flash agar stabil, cepat, dan tidak kena limit: 0
const MODEL = 'gemini-3.6-flash';
const WARNING_LIMIT = 3;
const TIMEOUT_MS = 15 * 60 * 1000;
const TEMP_WARNING_MS = 5_500;
const GEMINI_TIMEOUT_MS = 10_000;
const MAX_STICKER_BYTES = 8 * 1024 * 1024;
const WARNING_CHANNEL_ID = '1368014664113459230';
const WARNINGS_FILE = path.join(__dirname, '..', 'data', 'autoModerationWarnings.json');


// Kategori SARA (Agama, Etnis, Ras)
const SARA_PATTERNS = [
    'islam', 'kristen', 'katolik', 'hindu', 'buddha', 'konghucu', 'yahudi',
    'cina', 'china', 'chindo', 'pribumi', 'papua'
];

// Kategori TOXIC & HARASSMENT (Kata Kasar, Frasa Hinaan, Ejekan Fisik, Singkatan)
const TOXIC_PATTERNS = [
    // --- Dari screenshot (Daerah & Vulgar) ---
    'tempik', 'kanjut', 'telaso', 'genjor', 'kongkong', 'suntili',

    // --- English / US Slang & Makian Umum ---
    'fuck', 'fucking', 'fucker', 'fuk', 'motherfucker', 'mf',
    'suck', 'sucks', 'sucker', 'dickhead', // <-- ditambahkan di sini
    'shit', 'bullshit', 'bitch', 'bitches', 'bastard', 'asshole', 'ass', 'arsehole',
    'dick', 'cock', 'pussy', 'cunt', 'slut', 'whore', 'hoe',
    'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded',

    // --- Variasi Leetspeak / Bypass English ---
    'fvck', 'f*ck', 'sh1t', 'b1tch', 'b!tch', 'a$$', 'd1ck', 'c0ck', 'p*ssy', 'n1gga', 'n1gger',
    'suk', 'sux', 's*ck', // <-- variasi leetspeak kata suck

    // --- Singkatan & Frasa Toxic English / Internet Slang ---
    'stfu', 'gtfo', 'kys', 'fk', 'fck', 'fkn', 'sob',

    // --- Variasi Leetspeak / Bypass English ---
    'fvck', 'f*ck', 'sh1t', 'b1tch', 'b!tch', 'a$$', 'd1ck', 'c0ck', 'p*ssy', 'n1gga', 'n1gger',

    // --- Frasa penghinaan / keluarga lokal ---
    'anak haram', 'anak har4m', 'gendut jorok', 'lonte', 'perek',

    // --- Anatomi / Seksual Lokal ---
    'puki', 'kontol', 'memek', 'jembut', 'itil', 'pantek', 'peler', 'pepek', 'titit', 'tetek',
    'ngentot', 'ngewe', 'ewe', 'colmek', 'coli', 'pantat',

    // --- Hinaan Mental / Ejekan Lokal ---
    'dongo', 'dngo', 'tolol', 'tlol', 'tll', 'goblok', 'gblk', 'idiot', 'bego', 'bodoh', 'bdh',

    // --- Hewan / Bahasa Daerah Lainnya ---
    'anjing', 'ajg', 'anj', 'babi', 'asu', 'asw', 'monyet', 'mnyt', 'monyed', 'kirek', 'segawoj',
    'jancok', 'jnck', 'kampang', 'sundala', 'cuki', 'henceut', 'pendo', 'congek', 'pmai',

    // --- Singkatan konsonan lokal ---
    'jmbt', 'kntl', 'mmk', 'pler', 'clbr', 'ngw', 'ngntt', 'bgst',

    // --- Anatomi / Seksual Lokal & Plesetan ---
    'puki', 'kontol', 'memek', 'jembut', 'jembot', 'jumbot', 'itil', 'pantek', 'peler', 'pepek', 'titit', 'tetek',
    'ngentot', 'ngewe', 'ewe', 'colmek', 'coli', 'pantat', 'apantat', 'buyang', 'bajingan', 'bajing', 'bajng', 'bajngan', 'bajingan', 'bajingan', 'bajingan', 'bajingan', 'bajingan'
];

// Regex builder
const SARA_REGEX = new RegExp(`(^|[^\\p{L}\\p{N}])(${SARA_PATTERNS.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu');
const TOXIC_REGEX = new RegExp(`(^|[^\\p{L}\\p{N}])(${TOXIC_PATTERNS.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu');

const IGNORE_PATTERNS = [
    /^w[a-z0-9]+(\s.*)?$/i, // Command bot game (wh, wb, wcash, wweapon, wgive, dll)
    /^https?:\/\/\S+$/i,     // Link URL
    /^<@!?\d+>$/             // Mention murni
];

// Kata-kata yang LANGSUNG dihapus secara instan (menghemat limit 5 RPM)
const INSTANT_BLOCK_REGEX = /(^|[^\p{L}\p{N}])(suck|sucks|sucker|sux|tempik|kanjut|telaso|genjor|kongkong|suntili|fuck|fvck|shit|bitch|bastard|asshole|dick|cock|pussy|cunt|slut|whore|nigger|nigga|faggot|retard|kys|stfu|puki|kontol|memek|jembut|jembot|jumbot|itil|pantek|peler|pepek|tolol|tlol|goblok|gblk|anjing|ajg|babi|asu|monyet|mnyt|kirek|segawoj|jalang|kampret|ngentot|ngewe|jmbt|kntl|mmk|islam|kristen|yahudi)(?=$|[^\p{L}\p{N}])/iu;

const RESPONSE_SCHEMA = {
    type: 'object',
    properties: {
        isViolation: { 
            type: 'boolean',
            description: 'Wajib true jika ada unsur negatif sekecil apapun' 
        },
        category: { 
            type: 'string', 
            enum: ['SARA', 'TOXIC', 'HARASSMENT', 'NONE'] 
        },
        reason: { 
            type: 'string', 
            description: 'Kata atau maksud terlarang yang terdeteksi, maksimal 10 kata' 
        },
    },
    required: ['isViolation', 'category', 'reason'],
    additionalProperties: false,
};

let warnings = loadWarnings();
let geminiClient;

function loadWarnings() {
    try {
        if (!fs.existsSync(WARNINGS_FILE)) return {};
        return JSON.parse(fs.readFileSync(WARNINGS_FILE, 'utf8'));
    } catch (error) {
        log.error('Gagal membaca penyimpanan warning AutoMod', error);
        return {};
    }
}

function saveWarnings() {
    try {
        fs.mkdirSync(path.dirname(WARNINGS_FILE), { recursive: true });
        fs.writeFileSync(WARNINGS_FILE, JSON.stringify(warnings, null, 2));
    } catch (error) {
        log.error('Gagal menyimpan warning AutoMod', error);
    }
}

function getWarningCount(guildId, userId) {
    return warnings[guildId]?.[userId] || 0;
}

function addWarning(guildId, userId) {
    if (!warnings[guildId]) warnings[guildId] = {};
    warnings[guildId][userId] = Math.min(getWarningCount(guildId, userId) + 1, WARNING_LIMIT);
    saveWarnings();
    return warnings[guildId][userId];
}

function truncate(value, limit = 120) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function shouldIgnore(message) {
    return !message.inGuild() || message.author?.bot;
}

function getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY belum diatur di environment.');

    if (!geminiClient) {
        const { GoogleGenAI } = require('@google/genai');
        geminiClient = new GoogleGenAI({ apiKey });
    }
    return geminiClient;
}

function validateResult(payload) {
    const isViolation = payload?.isViolation === true;
    const category = ['SARA', 'TOXIC', 'HARASSMENT', 'NONE'].includes(payload?.category)
        ? payload.category
        : 'NONE';
    const reason = truncate(payload?.reason || (isViolation ? 'Pelanggaran terdeteksi' : 'Tidak ada pelanggaran'), 80)
        .split(/\s+/)
        .slice(0, 10)
        .join(' ');

    return { isViolation: isViolation && category !== 'NONE', category: isViolation ? category : 'NONE', reason };
}

async function withTimeout(promise, ms, label) {
    let timeout;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error(`${label} melebihi ${ms}ms`)), ms);
            }),
        ]);
    } finally {
        clearTimeout(timeout);
    }
}

async function analyseWithGemini(contentsInput, source) {
    const ai = getGeminiClient();
    const started = Date.now();
    log.request({ source, model: MODEL });

    const response = await withTimeout(ai.models.generateContent({
        model: MODEL,
        contents: contentsInput,
        config: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0,
        },
    }), GEMINI_TIMEOUT_MS, 'Request Gemini');

    const latencyMs = Date.now() - started;
    const result = validateResult(JSON.parse(response.text || '{}'));
    log.result(result, { source, latencyMs });
    return result;
}

async function fetchStickerData(sticker) {
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 10_000);
    try {
        const response = await fetch(sticker.url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Unduh stiker gagal (HTTP ${response.status})`);

        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength > MAX_STICKER_BYTES) throw new Error('Ukuran stiker melebihi 8 MB');

        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > MAX_STICKER_BYTES) throw new Error('Ukuran stiker melebihi 8 MB');

        const mimeType = (response.headers.get('content-type') || 'image/png').split(';')[0].toLowerCase();
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) {
            throw new Error(`Format stiker tidak didukung: ${mimeType}`);
        }
        return { mimeType, data: bytes.toString('base64') };
    } finally {
        clearTimeout(abortTimer);
    }
}

// INI ADALAH OTAK DETEKSI FULL AI ULTRA STRICT
async function analyseText(content) {
    const prompt = `Kamu adalah bot moderasi chat Discord dengan aturan KEAMANAN TERTINGGI (ZERO TOLERANCE / ULTRA STRICT).
    Tugasmu adalah memeriksa apakah teks pengguna mencoba membobol aturan kesopanan, memicu keributan, atau toxic dalam Bahasa Indonesia, Bahasa Daerah, maupun English / US Slang.

    Teks pengguna: "${content}"

    INSTRUKSI DETEKSI AGAR TIDAK BISA DI-BYPASS OLEH PENGGUNA:
    1. DEKODE SEMUA CARA BYPASS & SLANG:
    - Penggantian huruf dengan angka / simbol (leetspeak), misal: "fvck", "sh1t", "b1tch", "m3m3k", "k0nt0l", "pvk1".
    - Singkatan toxic Bahasa Inggris (US Slang) dan Indonesia: "kys" (kill yourself), "stfu" (shut the fuck up), "gtfo", "sob", "jmbt", "kntl", "mmk", "pler", "tlol", "bgst", "mnyt".
    - Slang & Slur Bahasa Inggris: fuck, suck, sucker, shit, bitch, dick, pussy, cunt, slut, whore, nigga, nigger, faggot, retard.
    - Plesetan fonetik / variasi mirip huruf: "suk", "sux", "fuk", "shyt", "jumbot", "titid", "monyed".
    - Slang & Slur Bahasa Inggris: fuck, shit, bitch, dick, pussy, cunt, slut, whore, nigga, nigger, faggot, retard.
    - Kata kasar daerah Indonesia (Sulawesi/Makassar, Sunda, Jawa, Manado, Batak, dsb): tempik, kanjut, telaso, genjor, kongkong, suntili, sundala, cuki, henceut, pendo, segawoj.
    - Plesetan fonetik / variasi mirip huruf: "suk", "sux", "fuk", "shyt", "jembot", "jumbot", "titid", "monyed".

    2. ZERO TOLERANCE:
    - Jika teks HANYA TERDIRI DARI 1 KATA makian, singkatan toxic, kata kotor US/Indo, WAJIB tandai "isViolation": true.
    - Abaikan konteks! Mau itu bercanda dengan teman, gaming rage, atau sengaja mengetes bot, SEMUA TETAP PELANGGARAN.

    3. KATEGORISASI:
    - "SARA": Ujaran rasisme/slur (seperti n-word, antisemitisme, kata peyoratif rasial) atau penyerangan etnis/agama.
    - "TOXIC": Semua kata makian, umpatan US slang, kata kasar daerah, alat kelamin vulgar, atau singkatan penghinaan.
    - "HARASSMENT": Bentuk suruhan bunuh diri (seperti "kys"), ancaman fisik, atau pelecehan personal/seksual.
    - "NONE": HANYA jika kalimat percakapan normal, wajar, dan 100% bersih.

    Kembalikan format JSON sesuai schema.`;

        return analyseWithGemini(prompt, 'text');
}

async function analyseSticker(sticker) {
    const image = await fetchStickerData(sticker);
    return analyseWithGemini([
        { inlineData: image },
        { text: `Periksa stiker Discord ini secara ULTRA STRICT. Nama stiker: "${sticker.name}". Tandai isViolation: true jika nama atau visualnya mengandung unsur SARA, pornografi, kebencian, gestur vulgar, atau kata makian.` }
    ], 'sticker');
}

async function sendTemporaryWarning(message, count, result) {
    const warningChannel = message.guild.channels.cache.get(WARNING_CHANNEL_ID)
        || await message.guild.channels.fetch(WARNING_CHANNEL_ID).catch((error) => {
            log.error('Gagal mengambil channel warning AutoMod', error, { channelId: WARNING_CHANNEL_ID });
            return null;
        });

    if (!warningChannel) return;

    await warningChannel.send({
        content: `⚠️ <@${message.author.id}> (ID: ${message.author.id}), konten dihapus karena **${result.category}** (${result.reason}).`,
        allowedMentions: { users: [message.author.id], roles: [], repliedUser: false },
    }).catch((error) => {
        log.error('Gagal mengirim pesan warning', error, { messageId: message.id });
    });
}

async function applyViolation(message, result) {
    try {
        await message.delete();
        log.action('Pesan pelanggaran dihapus', {
            messageId: message.id,
            user: message.author.tag,
            category: result.category,
        });
    } catch (error) {
        log.error('Gagal menghapus pesan (periksa Manage Messages)', error, { messageId: message.id });
        return false;
    }

    const count = addWarning(message.guild.id, message.author.id);
    await sendTemporaryWarning(message, count, result);
    return true;
}

function cleanRepeatedChars(text) {
    return text.replace(/(.)\1{2,}/gi, '$1').replace(/(.)\1+/gi, '$1');
}

async function moderateMessage(message) {
    try {
        if (shouldIgnore(message)) return;

        const content = String(message.content || '').trim();

        // 1. Abaikan perintah bot musik/game & URL
        if (IGNORE_PATTERNS.some(pattern => pattern.test(content))) return;

        // Normalisasi teks untuk menangkap bypass huruf berulang
        const normalizedContent = cleanRepeatedChars(content.toLowerCase());

        const baseMeta = {
            user: message.author.tag,
            guild: message.guild.name,
            channel: message.channel.name || message.channel.id,
            messageId: message.id,
        };

        // 2. Filter Instan SARA (Cek content asli & normalized)
        const saraMatch = content.match(SARA_REGEX)?.[2] || normalizedContent.match(SARA_REGEX)?.[2];
        if (saraMatch) {
            log.action('Diblokir instan (SARA)', { ...baseMeta, match: saraMatch });
            await applyViolation(message, {
                isViolation: true,
                category: 'SARA',
                reason: `Isu SARA/Ras/Agama: ${saraMatch}`
            });
            return;
        }

        // 3. Filter Instan TOXIC & Frasa Hinaan (Cek content asli & normalized)
        const toxicMatch = content.match(TOXIC_REGEX)?.[2] || normalizedContent.match(TOXIC_REGEX)?.[2];
        if (toxicMatch) {
            log.action('Diblokir instan (TOXIC)', { ...baseMeta, match: toxicMatch });
            await applyViolation(message, {
                isViolation: true,
                category: 'TOXIC',
                reason: `Hinaan/Umpatan: ${toxicMatch}`
            });
            return;
        }

        // 4. Jika lolos filter instan, kirim teks yang sudah dinormalisasi ke Gemini
        if (content.length >= 3) {
            log.received({ ...baseMeta, type: 'text', content: truncate(content) });
            
            try {
                // Kirim normalizedContent agar AI langsung membaca kata intinya
                const result = await analyseText(normalizedContent);
                if (result.isViolation) {
                    await applyViolation(message, result);
                    return;
                }
            } catch (aiError) {
                // log.error('Gemini limit/gagal, dilewati', aiError.message);
            }
        }

        // 5. Moderasi Stiker
        for (const sticker of message.stickers.values()) {
            try {
                const result = await analyseSticker(sticker);
                if (result.isViolation) {
                    await applyViolation(message, result);
                    return;
                }
            } catch (err) {
                log.error('Gagal analisis stiker', err.message);
            }
        }
    } catch (error) {
        log.error('Moderasi gagal;', error, { messageId: message.id, user: message.author?.tag });
    }
}


module.exports = {
    moderateMessage,
    getWarningCount,
    WARNING_LIMIT,
    TIMEOUT_MS,
};