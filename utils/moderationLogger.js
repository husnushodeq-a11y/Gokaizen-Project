const COLORS = {
    reset: '\x1b[0m',
    gray: '\x1b[90m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
};

const MODERATION_LOGS_ENABLED = process.env.MODERATION_LOGS === '1';

function timestamp() {
    return new Date().toISOString();
}

function formatMeta(meta = {}) {
    return Object.entries(meta)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
        .join(' ');
}

function write(level, color, message, meta) {
    if (!MODERATION_LOGS_ENABLED) return;

    const suffix = formatMeta(meta);
    const line = `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${color}[AUTOMOD/${level}]${COLORS.reset} ${message}` +
        (suffix ? ` ${COLORS.gray}${suffix}${COLORS.reset}` : '');

    if (level === 'ERROR') console.error(line);
    else console.log(line);
}

module.exports = {
    received: (meta) => write('RECEIVED', COLORS.cyan, 'Konten diterima', meta),
    regex: (message, meta) => write('REGEX', COLORS.yellow, message, meta),
    request: (meta) => write('GEMINI', COLORS.cyan, 'Request dikirim ke Gemini Pro', meta),
    result: (result, meta) => write(
        result.isViolation ? 'VIOLATION' : 'SAFE',
        result.isViolation ? COLORS.red : COLORS.green,
        result.isViolation ? 'Pelanggaran terdeteksi' : 'Konten aman',
        { category: result.category, reason: result.reason, ...meta },
    ),
    action: (message, meta) => write('ACTION', COLORS.yellow, message, meta),
    error: (message, error, meta) => write('ERROR', COLORS.red, message, {
        error: error?.message || String(error),
        ...meta,
    }),
};
