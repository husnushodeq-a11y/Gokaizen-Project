const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const path = require('path');
const D = require('./altDetectionData');
const { banMember, unbanMember } = require('./altEnforcement');

let config = {};
try {
    config = require(path.join(__dirname, '../config.json'));
} catch {
    config = {};
}

const PREFIX = 'g!';
const AUDIT_MODE = 'audit';
const COLOR_INFO = 0x5865F2;
const COLOR_WARN = 0xFEE75C;
const COLOR_ERROR = 0xED4245;

// Default ID bawaan sistem
const DEFAULT_MODLOG_CHANNEL_ID = '1478743405537267793';
const DEFAULT_SUPERADMIN_ROLE_ID = '1386874017105051759';
const BANIP_LOG_CHANNEL_ID = '1425864807739035698';
const BAN_PHOTO_LOG_CHANNEL_ID = '1552271167006441533';

function reply(message, title, description, color = COLOR_INFO) {
    return message.reply({
        embeds: [new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp()],
    }).catch(() => null);
}

function resolveTargetId(message, args) {
    const mentioned = message.mentions.users.first();
    if (mentioned) return mentioned.id;
    const raw = args.find(value => /^\d{17,20}$/.test(value.replace(/[<@!>]/g, '')));
    return raw ? raw.replace(/[<@!>]/g, '') : null;
}

function configuredSuperadminRole(guildId) {
    return D.guildConfig(guildId)?.superadminRoleId || config.ALT_SUPERADMIN_ROLE_ID || process.env.ALT_SUPERADMIN_ROLE_ID || DEFAULT_SUPERADMIN_ROLE_ID;
}

function isSuperadmin(message) {
    const roleId = configuredSuperadminRole(message.guildId);
    return Boolean(roleId && message.member?.roles?.cache?.has(roleId));
}

function getModlogChannelId(guildId) {
    return D.guildConfig(guildId)?.modlogChannelId || config.ALT_MODLOG_CHANNEL_ID || process.env.ALT_MODLOG_CHANNEL_ID || DEFAULT_MODLOG_CHANNEL_ID;
}

function getImageAttachment(message) {
    return message.attachments?.find(attachment =>
        attachment.contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(attachment.name || attachment.url || '')
    ) || null;
}

async function logToModlog(message, embed) {
    const channelId = getModlogChannelId(message.guildId);
    if (!channelId) return false;
    const channel = await message.client.channels.fetch(channelId).catch(() => null);
    if (!channel) return false;
    await channel.send({ embeds: [embed] }).catch(() => null);
    return true;
}

async function logBanAction(message, embed) {
    const channel = await message.client.channels.fetch(BANIP_LOG_CHANNEL_ID).catch(() => null);
    if (!channel?.send) return false;
    await channel.send({ embeds: [embed] }).catch(() => null);
    return true;
}

function formatTarget(targetId, member) {
    return member ? `${member} (${targetId})` : `<@${targetId}> (${targetId})`;
}

function calculateRiskScore(guildId, record) {
    if (!record) return { score: 0, decision: 'NO_DATA', linked: [], blacklist: { ip: [], fingerprint: [], any: [] } };
    const blacklist = D.matches(guildId, record);
    const linked = D.linkedRecords(guildId, record);
    let score = 0;
    if (blacklist.ip.length) score = 100;
    const decision = score >= 100 ? 'AUTO-BAN' : score >= 50 ? 'FLAGGED' : 'VERIFIED';
    return { score, decision, linked, blacklist };
}

async function resolveMember(message, targetId) {
    if (!targetId) return null;
    return message.guild.members.fetch(targetId).catch(() => null);
}

async function cmdBanAccount(message, args) {
    const memberPermissions = message.member?.permissions;
    if (!memberPermissions?.has(PermissionsBitField.Flags.Administrator) &&
        !memberPermissions?.has(PermissionsBitField.Flags.BanMembers)) {
        return reply(message, 'Permission Ditolak', 'Kamu memerlukan permission Ban Members atau Administrator.', COLOR_ERROR);
    }
    if (!message.guild.members.me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
        return reply(message, 'Permission Bot Kurang', 'Bot memerlukan permission Ban Members.', COLOR_ERROR);
    }

    const targetId = resolveTargetId(message, args);
    if (!targetId) return reply(message, 'Target Tidak Ditemukan', 'Mention user atau masukkan user ID.', COLOR_WARN);

    if (targetId === message.author.id || targetId === message.guild.ownerId || targetId === message.client.user?.id) {
        return reply(message, 'Aksi Ditolak', 'Target tidak dapat diban oleh command ini.', COLOR_ERROR);
    }

    const target = await resolveMember(message, targetId);
    if (target) {
        const botRolePosition = message.guild.members.me.roles.highest.position;
        const targetRolePosition = target.roles.highest.position;
        const moderatorRolePosition = message.member.roles.highest.position;
        if (botRolePosition <= targetRolePosition ||
            (targetRolePosition >= moderatorRolePosition && message.author.id !== message.guild.ownerId)) {
            return reply(message, 'Hierarki Role Tidak Cukup', 'Role kamu dan bot harus berada di atas role target.', COLOR_ERROR);
        }
    }

    const banCheck = await message.guild.bans.fetch(targetId).catch(() => null);
    if (banCheck) return reply(message, 'Sudah Dibanned', 'Akun ini sudah dibanned di server.', COLOR_WARN);

    const photo = getImageAttachment(message);
    const outputChannelId = photo ? BAN_PHOTO_LOG_CHANNEL_ID : BANIP_LOG_CHANNEL_ID;
    const outputChannel = await message.client.channels.fetch(outputChannelId).catch(() => null);
    if (!outputChannel?.send) {
        return reply(message, 'Channel Log Tidak Bisa Diakses', 'Channel output ban tidak ditemukan atau bot tidak punya izin kirim pesan.', COLOR_ERROR);
    }

    const remainingArgs = args.filter(value => value !== targetId && !/^<@!?\d{17,20}>$/.test(value));
    let deleteDays = 0;
    if (/^\d+$/.test(remainingArgs[0] || '') && Number(remainingArgs[0]) <= 7) {
        deleteDays = Number(remainingArgs.shift());
    }
    const reason = remainingArgs.join(' ').trim() || 'Tidak ada alasan';
    const banResult = await banMember({
        guild: message.guild,
        member: target,
        targetId,
        moderatorId: message.author.id,
        action: 'BAN_ACCOUNT',
        reason,
        deleteMessageSeconds: deleteDays * 86400,
    });

    const embed = new EmbedBuilder()
        .setTitle('BAN AKUN')
        .setColor(banResult.ok ? COLOR_ERROR : COLOR_WARN)
        .addFields(
            { name: 'Executor', value: `${message.author} (${message.author.id})` },
            { name: 'Target', value: formatTarget(targetId, target) },
            { name: 'Alasan', value: reason.slice(0, 1024) },
            { name: 'Pesan dihapus', value: deleteDays ? `${deleteDays} hari terakhir` : 'Tidak ada', inline: true },
            { name: 'Aksi aktual', value: banResult.ok ? 'Akun berhasil diban' : `Ban gagal: ${banResult.error}` },
        )
        .setTimestamp();
    if (photo) embed.setImage(photo.url);

    await outputChannel.send({ embeds: [embed] }).catch(() => null);
    return message.reply({ embeds: [embed] }).catch(() => null);
}

async function cmdVerifyConfig(message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return reply(message, 'Permission Ditolak', 'Command ini hanya dapat digunakan Administrator.', COLOR_ERROR);
    }

    let unverifiedRoleId = null;
    let verifiedRoleId = null;
    let flaggedRoleId = null;
    let modlogChannelId = DEFAULT_MODLOG_CHANNEL_ID;
    let superadminRoleId = DEFAULT_SUPERADMIN_ROLE_ID;

    // Jika admin memasukkan argumen manual
    if (args.length >= 5) {
        [unverifiedRoleId, verifiedRoleId, flaggedRoleId, modlogChannelId, superadminRoleId] = args;
    } else if (args.length >= 1) {
        modlogChannelId = args[0] || DEFAULT_MODLOG_CHANNEL_ID;
        superadminRoleId = args[1] || configuredSuperadminRole(message.guildId);
    }

    const saved = D.setGuildConfig(message.guildId, {
        unverifiedRoleId,
        verifiedRoleId,
        flaggedRoleId,
        modlogChannelId,
        superadminRoleId,
        mode: AUDIT_MODE,
    });

    return reply(message, 'Konfigurasi Tersimpan',
        `Mode: **AUDIT**\n` +
        `Role verifikasi: ${saved.unverifiedRoleId ? 'dikonfigurasi' : 'tidak digunakan pada audit mode'}\n` +
        `Mod-log: <#${saved.modlogChannelId}>\n` +
        `Superadmin: <@&${saved.superadminRoleId}>\n\n` +
        `Belum ada ban, kick, atau perubahan role otomatis.`, COLOR_INFO);
}

async function cmdBanIp(message, args) {
    if (!isSuperadmin(message)) {
        return reply(message, 'Permission Ditolak', 'Kamu tidak memiliki role superadmin yang dikonfigurasi.', COLOR_ERROR);
    }

    const photo = getImageAttachment(message);
    const outputChannelId = photo ? BAN_PHOTO_LOG_CHANNEL_ID : BANIP_LOG_CHANNEL_ID;
    const outputChannel = await message.client.channels.fetch(outputChannelId).catch(() => null);
    if (!outputChannel?.send) {
        return reply(message, 'Channel Log Tidak Bisa Diakses', 'Channel output ban/unban tidak ditemukan atau bot tidak punya izin kirim pesan.', COLOR_ERROR);
    }

    const targetId = resolveTargetId(message, args);
    if (!targetId) return reply(message, 'Target Tidak Ditemukan', 'Mention user atau masukkan user ID.', COLOR_WARN);

    const target = await resolveMember(message, targetId);
    const reason = args.filter(value => value !== targetId && !/^<@!?\d{17,20}>$/.test(value)).join(' ').trim() || 'Tidak ada alasan';
    const record = D.latestVerification(message.guildId, targetId);

    if (!record?.ipHash) {
        D.addAuditLog({
            guildId: message.guildId,
            discordId: targetId,
            moderatorId: message.author.id,
            action: 'BAN_IP',
            status: 'FAILED',
            reason,
            error: 'IP verification record tidak tersedia',
        });
        return reply(message, 'BAN IP Gagal', 'Target belum memiliki IP hasil verifikasi yang tersimpan. Tidak ada blacklist atau ban yang dilakukan.', COLOR_WARN);
    }

    const embed = new EmbedBuilder()
        .setTitle('ALT DETECTION TEST - BANIP')
        .setColor(COLOR_WARN)
        .addFields(
            { name: 'Executor', value: `${message.author} (${message.author.id})` },
            { name: 'Target', value: formatTarget(targetId, target) },
            { name: 'Alasan', value: reason.slice(0, 1024) },
            { name: 'Data verifikasi', value: record ? 'Tersedia' : 'Belum tersedia' },
            { name: 'IP hash', value: record?.ipHash ? 'Tersedia' : 'Tidak tersedia', inline: true },
            { name: 'Fingerprint hash', value: record?.fingerprintHash ? 'Tersedia' : 'Tidak tersedia', inline: true },
            { name: 'Mode', value: 'REAL BAN', inline: true },
        )
        .setTimestamp();
    if (photo) embed.setImage(photo.url);

    if (record) {
        const result = calculateRiskScore(message.guildId, record);
        const signals = [D.addBlacklistSignal({
            guildId: message.guildId,
            ipHash: record.ipHash,
            sourceDiscordId: targetId,
            reason,
        })];

        const relatedIds = D.verifiedDiscordIdsBySignals(message.guildId, record.ipHash, record.fingerprintHash)
            .filter(discordId => discordId !== targetId);
        const banIds = [...new Set([targetId, ...relatedIds])];
        const banResults = [];
        for (const relatedId of banIds) {
            const relatedMember = relatedId === targetId ? target : await resolveMember(message, relatedId);
            const relatedResult = await banMember({
                guild: message.guild,
                member: relatedMember,
                targetId: relatedId,
                ipHash: record.ipHash,
                moderatorId: message.author.id,
                action: 'BAN_IP',
                reason: relatedId === targetId ? reason : `IP terkait ${targetId}: ${reason}`,
            });
            banResults.push({ discordId: relatedId, ...relatedResult });
            if (relatedResult.ok) {
                D.addBan({
                    guildId: message.guildId,
                    discordId: relatedId,
                    ipHash: record.ipHash,
                    fingerprintHash: relatedId === targetId ? record.fingerprintHash : D.latestVerification(message.guildId, relatedId)?.fingerprintHash,
                    riskScore: result.score,
                    reason: relatedId === targetId ? reason : `IP terkait ${targetId}: ${reason}`,
                    bannedBy: message.author.id,
                    source: relatedId === targetId ? 'banip' : 'banip-shared-ip',
                });
            }
        }
        const banResult = banResults.find(item => item.discordId === targetId) || { ok: false, error: 'target-not-processed' };
        const successfulRelatedBans = banResults.filter(item => item.ok && item.discordId !== targetId).length;

        embed.addFields(
            { name: 'Blacklist signal', value: `${signals.filter(item => item.baru).length} signal baru ditambahkan` },
            { name: 'Risk score saat ini', value: `${result.score} (${result.decision})`, inline: true },
            { name: 'Aksi aktual', value: banResult.ok ? `REAL BAN BERHASIL (${successfulRelatedBans} akun terkait)` : `REAL BAN GAGAL: ${banResult.error}`, inline: true },
            { name: 'Akun terkait (IP + fingerprint cocok)', value: relatedIds.length ? relatedIds.join(', ').slice(0, 1024) : 'Tidak ada akun dengan kedua hash yang sama' },
        );

        D.addFlagLog({
            guildId: message.guildId,
            discordId: targetId,
            matchedDiscordIds: result.linked.map(item => item.discordId),
            riskScore: result.score,
            action: 'BAN_IP',
            outcome: banResult.ok ? 'ban-ip-success' : 'ban-ip-failed',
            executedBy: message.author.id,
            reason,
        });
    } else {
        embed.addFields({ name: 'Hasil', value: 'Target belum verifikasi. Tidak ada signal yang ditambahkan.' });
    }

    await outputChannel.send({ embeds: [embed] }).catch(() => null);
    return message.reply({ embeds: [embed] }).catch(() => null);
}

async function cmdUnbanIp(message, args) {
    if (!isSuperadmin(message)) {
        return reply(message, 'Permission Ditolak', 'Kamu tidak memiliki role superadmin yang dikonfigurasi.', COLOR_ERROR);
    }

    const targetId = resolveTargetId(message, args);
    if (!targetId) return reply(message, 'Target Tidak Ditemukan', 'Mention user atau masukkan user ID.', COLOR_WARN);

    const existingBan = D.latestBanHistory(message.guildId, targetId) || D.latestBan(message.guildId, targetId);
    if (!existingBan) {
        return reply(message, 'UNBAN IP Ditolak', 'Target ini belum tercatat terkena AUTO-BAN dari `g!banip`, jadi tidak ada yang bisa di-unban.', COLOR_WARN);
    }

    const reason = args.filter(value => value !== targetId && !/^<@!?\d{17,20}>$/.test(value)).join(' ').trim() || 'Tidak ada alasan';
    const discordUnban = await unbanMember({
        guild: message.guild,
        targetId,
        reason: `UNBAN IP: ${reason}`,
    });
    if (!discordUnban.ok) {
        D.addAuditLog({
            guildId: message.guildId,
            discordId: targetId,
            moderatorId: message.author.id,
            action: 'UNBAN_IP',
            status: 'FAILED',
            reason,
            error: discordUnban.error,
        });
        return reply(message, 'UNBAN IP Gagal', `Discord ban belum dicabut: ${discordUnban.error}`, COLOR_ERROR);
    }
    const ban = D.unban(targetId, message.guildId, message.author.id, reason);
    if (!ban) return reply(message, 'UNBAN IP Gagal', 'Status ban target tidak ditemukan atau sudah di-unban.', COLOR_ERROR);

    const relatedIds = D.bannedDiscordIdsBySignals(message.guildId, ban.ipHash, ban.fingerprintHash)
        .filter(discordId => discordId !== targetId);
    const relatedUnbans = [];
    for (const relatedId of relatedIds) {
        const relatedResult = await unbanMember({
            guild: message.guild,
            targetId: relatedId,
            reason: `UNBAN IP terkait ${targetId}: ${reason}`,
        });
        if (relatedResult.ok) {
            const relatedBan = D.unban(relatedId, message.guildId, message.author.id, `IP terkait ${targetId}: ${reason}`);
            relatedUnbans.push({ discordId: relatedId, alreadyUnbanned: relatedResult.alreadyUnbanned, knownBan: Boolean(relatedBan) });
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('ALT DETECTION - UNBANIP')
        .setColor(COLOR_INFO)
        .addFields(
            { name: 'Executor', value: `${message.author} (${message.author.id})` },
            { name: 'Target', value: formatTarget(targetId, await resolveMember(message, targetId)) },
            { name: 'Status', value: discordUnban.alreadyUnbanned ? 'Blacklist dicabut, Discord ban sudah tidak ada' : 'AUTO-BAN dan Discord ban dicabut' },
            { name: 'Alasan', value: reason.slice(0, 1024) },
            { name: 'Aksi', value: `Blacklist IP/fingerprint dinonaktifkan; ${relatedUnbans.length} akun terkait diproses`, inline: true },
            { name: 'Akun terkait (IP + fingerprint cocok)', value: relatedUnbans.length ? relatedUnbans.map(item => item.discordId).join(', ').slice(0, 1024) : 'Tidak ada akun banned dengan kedua hash yang sama' },
            { name: 'Mode', value: 'REAL UNBAN', inline: true },
        )
        .setTimestamp();

    await logBanAction(message, embed);
    return message.reply({ embeds: [embed] }).catch(() => null);
}

async function cmdAltcheck(message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return reply(message, 'Permission Ditolak', 'Command ini hanya dapat digunakan moderator.', COLOR_ERROR);
    }

    const targetId = resolveTargetId(message, args);
    if (!targetId) return reply(message, 'Target Tidak Ditemukan', 'Mention user atau masukkan user ID.', COLOR_WARN);
    const record = D.latestVerification(message.guildId, targetId);
    if (!record) return reply(message, 'ALT CHECK', 'Belum ada data verifikasi untuk target ini.', COLOR_WARN);

    const result = calculateRiskScore(message.guildId, record);
    const relatedAccountIds = result.linked.map(item => item.discordId).join(', ')
        || 'Tidak ada akun lain dengan IP dan fingerprint hash yang sama';
    const relatedHashes = result.linked.length
        ? `IP hash: ${record.ipHash}\nFingerprint hash: ${record.fingerprintHash}`
        : 'Tidak ada pasangan hash yang cocok dengan akun lain';
    const embed = new EmbedBuilder()
        .setTitle('ALT DETECTION TEST - ALTCHECK')
        .setColor(result.score >= 100 ? COLOR_ERROR : result.score >= 50 ? COLOR_WARN : COLOR_INFO)
        .addFields(
            { name: 'Target', value: formatTarget(targetId, await resolveMember(message, targetId)) },
            { name: 'IP hash tersedia', value: record.ipHash ? 'Ya' : 'Tidak', inline: true },
            { name: 'Fingerprint tersedia', value: record.fingerprintHash ? 'Ya' : 'Tidak', inline: true },
            { name: 'IP blacklist cocok', value: result.blacklist.ip.length ? 'Ya' : 'Tidak', inline: true },
            { name: 'Fingerprint blacklist cocok', value: result.blacklist.fingerprint.length ? 'Ya' : 'Tidak', inline: true },
            { name: 'Akun terkait (IP + fingerprint cocok)', value: relatedAccountIds },
            { name: 'Hash yang cocok untuk akun terkait', value: relatedHashes },
            { name: 'Risk score', value: `${result.score}`, inline: true },
            { name: 'Simulasi keputusan', value: result.decision, inline: true },
            { name: 'Aksi aktual', value: 'TIDAK ADA - AUDIT MODE', inline: true },
        )
        .setTimestamp();

    await logToModlog(message, embed);
    return message.reply({ embeds: [embed] }).catch(() => null);
}

async function handleMessage(message) {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();
        if (!['ban', 'banip', 'ban_ip', 'unbanip', 'unban_ip', 'altcheck', 'verifyconfig'].includes(command)) return;

        if (command === 'ban') return cmdBanAccount(message, args);
        if (command === 'verifyconfig') return cmdVerifyConfig(message, args);
        if (command === 'banip' || command === 'ban_ip') return cmdBanIp(message, args);
        if (command === 'unbanip' || command === 'unban_ip') return cmdUnbanIp(message, args);
        return cmdAltcheck(message, args);
    } catch (err) {
        console.error('[ALT_DETECTION] galat command:', err);
        return reply(message, 'Alt Detection Error', `Terjadi kesalahan: ${err.message}`, COLOR_ERROR);
    }
}

module.exports = { handleMessage, calculateRiskScore };