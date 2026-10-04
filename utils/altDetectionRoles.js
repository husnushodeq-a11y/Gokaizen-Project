const D = require('./altDetectionData');

const UNVERIFIED_NAME = 'unverified-akun';
const VERIFIED_NAME = 'verified-akun';

function getRoleId(role) {
    if (!role) return null;
    if (typeof role === 'string') return role;
    return role.id || null;
}

function findCachedRole(cache, name) {
    if (!cache) return null;
    if (typeof cache.find === 'function') {
        return cache.find(role => role && role.name === name) || null;
    }
    if (typeof cache.values === 'function') {
        for (const role of cache.values()) {
            if (role && role.name === name) return role;
        }
    }
    return null;
}

async function ensureRole(guild, name, color, reason) {
    const cache = guild?.roles?.cache;
    const existing = findCachedRole(cache, name);
    if (existing) return existing;
    if (guild?.roles?.create) {
        return guild.roles.create({ name, color, reason });
    }
    return null;
}

async function ensureVerificationRoles(guild) {
    const unverified = await ensureRole(
        guild,
        UNVERIFIED_NAME,
        0xED4245,
        'Alt detection verification gate'
    );
    const verified = await ensureRole(
        guild,
        VERIFIED_NAME,
        0x57F287,
        'Alt detection verification gate'
    );

    if (unverified && verified) {
        D.setGuildConfig(guild.id, {
            unverifiedRoleId: unverified.id,
            verifiedRoleId: verified.id,
        });
    }

    return { unverified, verified };
}

async function markUnverified(member) {
    const roles = await ensureVerificationRoles(member.guild);
    const unverifiedRoleId = getRoleId(roles.unverified);
    if (!unverifiedRoleId) return roles;

    const hasUnverified = member?.roles?.cache && typeof member.roles.cache.has === 'function'
        ? member.roles.cache.has(unverifiedRoleId)
        : false;

    if (!hasUnverified) {
        await member.roles.add(roles.unverified, 'Menunggu verifikasi akun');
    }
    return roles;
}

async function markVerified(client, guildId, discordId) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return { ok: false, reason: 'guild tidak ditemukan' };

    const roles = await ensureVerificationRoles(guild);
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return { ok: false, reason: 'member tidak ditemukan' };

    const gokaifriendsRoleId = process.env.ROLE_GOKAIFRIENDS_ID || require('../config.json').GOKAIFRIENDS_ROLE_ID;

    const removalTargets = [roles.unverified, roles.verified].filter(Boolean);
    for (const role of removalTargets) {
        const roleId = getRoleId(role);
        if (!roleId) continue;
        const hasRole = member.roles?.cache && typeof member.roles.cache.has === 'function'
            ? member.roles.cache.has(roleId)
            : false;
        if (hasRole) {
            await member.roles.remove(roleId, 'Verifikasi akun selesai');
        }
    }

    if (roles.verified) {
        const verifiedRoleId = getRoleId(roles.verified);
        if (verifiedRoleId) {
            await member.roles.add(verifiedRoleId, 'Verifikasi akun selesai');
        }
    }

    if (gokaifriendsRoleId) {
        await member.roles.add(gokaifriendsRoleId, 'Verifikasi IP/URL berhasil');
    }

    return { ok: true, addedRoles: [gokaifriendsRoleId, getRoleId(roles.verified)].filter(Boolean) };
}

module.exports = {
    ensureVerificationRoles,
    markUnverified,
    markVerified,
};
