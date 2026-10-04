// Timeout moderation command (g!to).
// Pilihan durasi sengaja dibatasi agar moderator tidak perlu mengetik angka bebas.

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const PREFIX = 'g!';
const TIMEOUT_LOG_CHANNEL_ID = '1425864807739035698';
// Hanya member yang memiliki salah satu role ini yang dapat memakai g!to.
const ALLOWED_ROLE_IDS = new Set([
    '1488646728226967563',
    '1462085261893701642',
    '1367316783832502282',
    '1376416212724088932',
    '1386874017105051759',
]);
const DURATIONS = new Map([
    ['1', { ms: 60_000, label: '1 menit', key: '1m' }],
    ['1m', { ms: 60_000, label: '1 menit', key: '1m' }],
    ['1min', { ms: 60_000, label: '1 menit', key: '1m' }],
    ['2', { ms: 5 * 60_000, label: '5 menit', key: '5m' }],
    ['5m', { ms: 5 * 60_000, label: '5 menit', key: '5m' }],
    ['5min', { ms: 5 * 60_000, label: '5 menit', key: '5m' }],
    ['3', { ms: 10 * 60_000, label: '10 menit', key: '10m' }],
    ['10m', { ms: 10 * 60_000, label: '10 menit', key: '10m' }],
    ['10min', { ms: 10 * 60_000, label: '10 menit', key: '10m' }],
    ['4', { ms: 60 * 60_000, label: '1 jam', key: '1h' }],
    ['1h', { ms: 60 * 60_000, label: '1 jam', key: '1h' }],
    ['1jam', { ms: 60 * 60_000, label: '1 jam', key: '1h' }],
    ['5', { ms: 3 * 24 * 60 * 60_000, label: '3 hari', key: '3d' }],
    ['3d', { ms: 3 * 24 * 60 * 60_000, label: '3 hari', key: '3d' }],
    ['3hari', { ms: 3 * 24 * 60 * 60_000, label: '3 hari', key: '3d' }],
    ['6', { ms: 7 * 24 * 60 * 60_000, label: '1 minggu', key: '1w' }],
    ['1w', { ms: 7 * 24 * 60 * 60_000, label: '1 minggu', key: '1w' }],
    ['1minggu', { ms: 7 * 24 * 60 * 60_000, label: '1 minggu', key: '1w' }],
    
]);

function embed(title, description, color = 0x2B2D31) {
    return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
}

function usage(message) {
    return message.reply({
        embeds: [embed(
            'Cara Pakai Timeout',
            `\`${PREFIX}to @user <kategori> [alasan]\`\n\n` +
            '**Kategori timeout:**\n' +
            '`1` atau `1m` — 1 menit\n' +
            '`2` atau `5m` — 5 menit\n' +
            '`3` atau `10m` — 10 menit\n' +
            '`4` atau `1h` — 1 jam\n' +
            '`5` atau `3d` — 3 hari\n\n' +
            '`6` atau `1w` — 1 minggu\n\n' +
            
            `Contoh: \`${PREFIX}to @user 10m spam chat\``
        )],
        allowedMentions: { repliedUser: false },
    });
}

function memberId(token) {
    const match = String(token || '').match(/^(?:<@!?)?(\d{17,20})>?$/);
    return match?.[1] || null;
}

async function replyError(message, text) {
    return message.reply({
        embeds: [embed('Timeout Gagal', text, 0xED4245)],
        allowedMentions: { repliedUser: false },
    });
}

async function cmdTimeout(message, args) {
    const hasAllowedRole = message.member.roles.cache.some(role => ALLOWED_ROLE_IDS.has(role.id));
    if (!hasAllowedRole) return;

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return replyError(message, 'Bot membutuhkan permission **Moderate Members** untuk memberi timeout.');
    }

    const targetId = memberId(args[0]);
    const duration = DURATIONS.get(String(args[1] || '').toLowerCase());
    if (!targetId || !duration) return usage(message);

    if (targetId === message.author.id) {
        return replyError(message, 'Kamu tidak dapat memberi timeout pada diri sendiri.');
    }
    if (targetId === message.guild.ownerId) {
        return replyError(message, 'Kamu tidak dapat memberi timeout pada pemilik server.');
    }

    const target = await message.guild.members.fetch(targetId).catch(() => null);
    if (!target) return replyError(message, 'Member tidak ditemukan di server ini.');
    if (target.user.bot) return replyError(message, 'Bot tidak dapat diberi timeout.');
    if (!target.moderatable) {
        return replyError(message, 'Timeout tidak dapat dilakukan. Periksa hierarki role bot dan moderator.');
    }

    const moderatorIsOwner = message.author.id === message.guild.ownerId;
    if (!moderatorIsOwner && target.roles.highest.position >= message.member.roles.highest.position) {
        return replyError(message, 'Kamu hanya dapat memberi timeout pada member dengan role di bawah role tertinggimu.');
    }

    const reason = args.slice(2).join(' ').trim() || 'Tidak ada alasan diberikan';
    const auditReason = `${reason} — oleh ${message.author.tag}`;

    try {
        await target.timeout(duration.ms, auditReason);
        const until = Math.floor((Date.now() + duration.ms) / 1000);
        const resultPayload = {
            embeds: [embed(
                'Member Diberi Timeout',
                `**Member:** ${target}\n**Durasi:** ${duration.label} (${duration.key})\n` +
                `**Berakhir:** <t:${until}:R>\n**Moderator:** ${message.author}\n**Alasan:** ${reason}`,
                0xFEE75C
            )],
            allowedMentions: { users: [target.id, message.author.id], repliedUser: false },
        };

        const logChannel = await message.client.channels.fetch(TIMEOUT_LOG_CHANNEL_ID).catch(() => null);
        if (!logChannel || !logChannel.isTextBased()) {
            return replyError(message, `Timeout berhasil diberikan, tetapi channel log <#${TIMEOUT_LOG_CHANNEL_ID}> tidak dapat diakses.`);
        }

        try {
            await logChannel.send(resultPayload);
        } catch (err) {
            console.error('[TIMEOUT] gagal mengirim log:', err);
            return replyError(message, `Timeout berhasil diberikan, tetapi bot gagal mengirim hasil ke <#${TIMEOUT_LOG_CHANNEL_ID}>.`);
        }
    } catch (err) {
        console.error('[TIMEOUT] gagal memberi timeout:', err);
        return replyError(message, `Gagal memberi timeout: ${err.message}`);
    }
}

async function handleMessage(message) {
    if (!message.inGuild() || message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();
    if (command !== 'to' && command !== 'timeout') return;

    await cmdTimeout(message, args);
}

module.exports = { handleMessage, DURATIONS, ALLOWED_ROLE_IDS };
