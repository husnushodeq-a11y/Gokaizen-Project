const dbStore = require('./dbStore');

const KEY = 'alt_detection';

function kosong() {
    return {
        verifications: [],
        bans: [],
        flagLogs: [],
        guildConfig: {},
        blacklistedSignals: [],
    };
}

function baca() {
    const data = dbStore.get(KEY);
    if (!data || typeof data !== 'object') return kosong();
    return {
        ...kosong(),
        ...data,
        verifications: Array.isArray(data.verifications) ? data.verifications : [],
        bans: Array.isArray(data.bans) ? data.bans : [],
        flagLogs: Array.isArray(data.flagLogs) ? data.flagLogs : [],
        guildConfig: data.guildConfig && typeof data.guildConfig === 'object' ? data.guildConfig : {},
        blacklistedSignals: Array.isArray(data.blacklistedSignals) ? data.blacklistedSignals : [],
    };
}

function simpan(data) {
    dbStore.set(KEY, data);
    return data;
}

function guildConfig(guildId) {
    return baca().guildConfig[guildId] || null;
}

function setGuildConfig(guildId, config) {
    const data = baca();
    data.guildConfig[guildId] = {
        ...(data.guildConfig[guildId] || {}),
        ...config,
        updatedAt: Date.now(),
    };
    simpan(data);
    return data.guildConfig[guildId];
}

function latestVerification(guildId, discordId) {
    return baca().verifications
        .filter(item => item.guildId === guildId && item.discordId === discordId)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
}

function addVerification(record) {
    const data = baca();
    data.verifications.push({
        ...record,
        createdAt: record.createdAt || Date.now(),
    });
    simpan(data);
    return data.verifications[data.verifications.length - 1];
}

function addBlacklistSignal(record) {
    const data = baca();
    if (!record.ipHash && !record.fingerprintHash) return { entry: null, baru: false };
    const existing = data.blacklistedSignals.find(item =>
        item.guildId === record.guildId &&
        item.sourceDiscordId === record.sourceDiscordId &&
        (record.ipHash ? item.ipHash === record.ipHash : item.fingerprintHash === record.fingerprintHash)
    );

    if (existing) {
        existing.updatedAt = Date.now();
        existing.reason = record.reason || existing.reason;
        existing.active = true;
        simpan(data);
        return { entry: existing, baru: false };
    }

    const entry = {
        ...record,
        createdAt: record.createdAt || Date.now(),
        active: true,
    };
    data.blacklistedSignals.push(entry);
    simpan(data);
    return { entry, baru: true };
}

function matches(guildId, record) {
    if (!record) return { ip: [], fingerprint: [], any: [] };
    const data = baca();
    const aktif = data.blacklistedSignals.filter(item => item.guildId === guildId && item.active !== false);
    const ip = record.ipHash ? aktif.filter(item => item.ipHash === record.ipHash) : [];
    const fingerprint = record.fingerprintHash
        ? aktif.filter(item => item.fingerprintHash === record.fingerprintHash)
        : [];
    const paired = record.ipHash && record.fingerprintHash
        ? aktif.filter(item => item.ipHash === record.ipHash && item.fingerprintHash === record.fingerprintHash)
        : [];
    return {
        ip,
        fingerprint,
        paired,
        any: [...new Map([...ip, ...fingerprint].map(item => [
            `${item.createdAt}:${item.sourceDiscordId}`,
            item,
        ])).values()],
    };
}

function linkedRecords(guildId, record) {
    if (!record?.ipHash || !record?.fingerprintHash) return [];
    const latestByDiscordId = new Map();
    for (const item of baca().verifications) {
        if (item.guildId !== guildId || !item.discordId || item.discordId === record.discordId) continue;
        const current = latestByDiscordId.get(item.discordId);
        if (!current || (item.createdAt || 0) > (current.createdAt || 0)) {
            latestByDiscordId.set(item.discordId, item);
        }
    }
    return [...latestByDiscordId.values()].filter(item =>
        item.ipHash === record.ipHash && item.fingerprintHash === record.fingerprintHash
    );
}

function addFlagLog(entry) {
    const data = baca();
    data.flagLogs.push({ ...entry, createdAt: entry.createdAt || Date.now() });
    simpan(data);
}

function addAuditLog(entry) {
    return addFlagLog({ ...entry, audit: true });
}

function removeBlacklistSignals(record) {
    const data = baca();
    let removed = 0;
    data.blacklistedSignals.forEach(signal => {
        const sameGuild = signal.guildId === record.guildId;
        const sameIp = record.ipHash && signal.ipHash === record.ipHash;
        if (sameGuild && sameIp && signal.active !== false) {
            signal.active = false;
            signal.updatedAt = Date.now();
            removed += 1;
        }
    });
    if (removed) simpan(data);
    return removed;
}

function latestBan(guildId, discordId) {
    const data = baca();
    const storedBan = data.bans
        .filter(item => item.guildId === guildId && item.discordId === discordId && item.status !== 'unbanned')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
    if (storedBan) return storedBan;

    const legacyBan = data.flagLogs
        .filter(item => item.guildId === guildId && item.discordId === discordId &&
            (item.outcome === 'audit-verification-auto-ban' || item.outcome === 'audit-banip-auto-ban'))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    return legacyBan ? {
        ...legacyBan,
        status: 'banned',
        source: 'legacy-flag-log',
    } : null;
}

function latestBanHistory(guildId, discordId) {
    return baca().bans
        .filter(item => item.guildId === guildId && item.discordId === discordId)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
}

function discordIdsByIp(guildId, ipHash) {
    if (!ipHash) return [];
    const data = baca();
    return [...new Set([
        ...data.verifications
            .filter(item => item.guildId === guildId && item.ipHash === ipHash)
            .map(item => item.discordId),
        ...data.bans
            .filter(item => item.guildId === guildId && item.ipHash === ipHash)
            .map(item => item.discordId),
        ...data.flagLogs
            .filter(item => item.guildId === guildId && item.ipHash === ipHash)
            .map(item => item.discordId),
    ])];
}

function verifiedDiscordIdsBySignals(guildId, ipHash, fingerprintHash) {
    if (!ipHash || !fingerprintHash) return [];
    const latestByDiscordId = new Map();
    for (const record of baca().verifications) {
        if (record.guildId !== guildId || !record.discordId) continue;
        const current = latestByDiscordId.get(record.discordId);
        if (!current || (record.createdAt || 0) > (current.createdAt || 0)) {
            latestByDiscordId.set(record.discordId, record);
        }
    }
    return [...latestByDiscordId.values()]
        .filter(record => record.ipHash === ipHash && record.fingerprintHash === fingerprintHash)
        .map(record => record.discordId);
}

function bannedDiscordIdsBySignals(guildId, ipHash, fingerprintHash) {
    if (!ipHash || !fingerprintHash) return [];
    const latestByDiscordId = new Map();
    for (const ban of baca().bans) {
        if (ban.guildId !== guildId || !ban.discordId) continue;
        const current = latestByDiscordId.get(ban.discordId);
        if (!current || (ban.createdAt || 0) > (current.createdAt || 0)) {
            latestByDiscordId.set(ban.discordId, ban);
        }
    }
    return [...latestByDiscordId.values()]
        .filter(ban => ban.status !== 'unbanned' && ban.ipHash === ipHash && ban.fingerprintHash === fingerprintHash)
        .map(ban => ban.discordId);
}

function addBan(entry) {
    const data = baca();
    const existing = data.bans
        .filter(item => item.guildId === entry.guildId && item.discordId === entry.discordId && item.status !== 'unbanned')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    if (existing) {
        Object.assign(existing, entry, { status: 'banned', updatedAt: Date.now() });
        simpan(data);
        return existing;
    }

    const ban = { ...entry, status: 'banned', createdAt: entry.createdAt || Date.now() };
    data.bans.push(ban);
    simpan(data);
    return ban;
}

function unban(discordId, guildId, unbannedBy, reason) {
    const data = baca();
    let ban = data.bans
        .filter(item => item.guildId === guildId && item.discordId === discordId)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    if (!ban) {
        const legacyBan = data.flagLogs
            .filter(item => item.guildId === guildId && item.discordId === discordId &&
                (item.outcome === 'audit-verification-auto-ban' || item.outcome === 'audit-banip-auto-ban'))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
        if (legacyBan) {
            ban = {
                ...legacyBan,
                status: 'banned',
                source: 'legacy-flag-log',
            };
            data.bans.push(ban);
        }
    }
    if (!ban) return null;

    ban.status = 'unbanned';
    ban.unbannedAt = Date.now();
    ban.unbannedBy = unbannedBy;
    ban.unbanReason = reason || 'Tidak ada alasan';
    data.blacklistedSignals.forEach(signal => {
        if (signal.guildId === guildId && ban.ipHash && signal.ipHash === ban.ipHash) {
            signal.active = false;
            signal.updatedAt = Date.now();
        }
    });
    data.flagLogs.push({
        guildId,
        discordId,
        action: 'UNBLACKLIST_IP',
        status: 'SUCCESS',
        executedBy: unbannedBy,
        reason: reason || 'Tidak ada alasan',
        createdAt: Date.now(),
    });
    simpan(data);
    return ban;
}

module.exports = {
    guildConfig,
    setGuildConfig,
    latestVerification,
    addVerification,
    addBlacklistSignal,
    matches,
    linkedRecords,
    addFlagLog,
    addAuditLog,
    removeBlacklistSignals,
    latestBan,
    latestBanHistory,
    discordIdsByIp,
    verifiedDiscordIdsBySignals,
    bannedDiscordIdsBySignals,
    addBan,
    unban,
};
