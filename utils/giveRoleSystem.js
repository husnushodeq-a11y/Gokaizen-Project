// utils/giveRoleSystem.js
// Timed role grants. A moderator can give a role to a member with an optional
// duration. When the duration ends, the role is removed automatically, the user
// is notified by DM, and the action is logged. A reminder is sent before expiry.
//
// The schedule is kept on disk and swept periodically, so a role still expires
// correctly even if the bot restarts (a plain in memory timer would be lost).
//
// Used by:
//   events/giveRoleCommands.js  -> handleMessage
//   events/giveRoleReady.js     -> startScheduler

const fs = require('fs');
const path = require('path');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    PermissionsBitField,
} = require('discord.js');

let botConfig = {};
try {
    botConfig = require('../config.json');
} catch {
    botConfig = {};
}

// ============================================================
//  CONFIG
// ============================================================

const PREFIX = 'g!';

// Channel where grant, reminder, and expiry actions are logged.
// Set ROLE_LOG_CHANNEL_ID in config.json, or fill the value here.
const LOG_CHANNEL_ID = botConfig.ROLE_LOG_CHANNEL_ID || '';

// Send a DM to the member on grant, reminder, and expiry.
const SEND_DM = true;

// How long before expiry the reminder is sent. Grants shorter than this get no
// reminder (they are already short). Default 24 hours.
const REMINDER_BEFORE_MS = 24 * 60 * 60 * 1000;

// How often the schedule is swept.
const CHECK_INTERVAL_MS = 60 * 1000;

// Max grants shown per page / group in listings.
const LIST_LIMIT = 20;

// ============================================================
//  STORAGE
// ============================================================

const DATA_FILE = path.join(__dirname, '..', 'data', 'timedRoles.json');

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return {};
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        console.error('[GIVEROLE] failed to read timedRoles.json:', err.message);
        return {};
    }
}

let db = loadData();

function saveData() {
    try {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (err) {
        console.error('[GIVEROLE] failed to save timedRoles.json:', err.message);
    }
}

const grantKey = (userId, roleId) => `${userId}:${roleId}`;

function setGrant(guildId, record) {
    if (!db[guildId]) db[guildId] = {};
    db[guildId][grantKey(record.userId, record.roleId)] = record;
    saveData();
}

function removeGrant(guildId, userId, roleId) {
    if (db[guildId]) {
        delete db[guildId][grantKey(userId, roleId)];
        if (!Object.keys(db[guildId]).length) delete db[guildId];
        saveData();
    }
}

function getGrant(guildId, userId, roleId) {
    return db[guildId]?.[grantKey(userId, roleId)] || null;
}

// ============================================================
//  DISPLAY (Components V2, no color, no symbols)
// ============================================================

const SUPPORTS_V2 =
    typeof ContainerBuilder === 'function' &&
    typeof TextDisplayBuilder === 'function' &&
    MessageFlags && MessageFlags.IsComponentsV2 !== undefined;

function payload(text) {
    if (SUPPORTS_V2) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
        return {
            components: [container],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [], repliedUser: false },
        };
    }
    return { content: text, allowedMentions: { parse: [], repliedUser: false } };
}

const reply = (message, text) => message.reply(payload(text)).catch(() => null);

const sendDM = (user, text) => {
    if (!SEND_DM) return Promise.resolve();
    if (SUPPORTS_V2) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
        return user.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }
    return user.send({ content: text }).catch(() => null);
};

async function logTo(client, text) {
    if (!LOG_CHANNEL_ID) return;
    try {
        const ch = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (ch) await ch.send(payload(text)).catch(() => null);
    } catch { /* logging must never break the main action */ }
}

const timeRelative = ts => `<t:${Math.floor(ts / 1000)}:R>`;
const timeFull = ts => `<t:${Math.floor(ts / 1000)}:f>`;

// ============================================================
//  DURATION
// ============================================================

const UNIT_MS = { w: 604800000, d: 86400000, h: 3600000, m: 60000, s: 1000 };

function parseDuration(input) {
    if (!input) return null;
    const clean = input.replace(/\s+/g, '').toLowerCase();
    if (!/^(\d+[wdhms])+$/.test(clean)) return null;

    let total = 0;
    const re = /(\d+)([wdhms])/g;
    let m;
    while ((m = re.exec(clean)) !== null) {
        total += parseInt(m[1], 10) * UNIT_MS[m[2]];
    }
    return total > 0 ? total : null;
}

function formatDuration(ms) {
    if (!ms || ms <= 0) return '0 seconds';

    // Weeks are only used for durations of 14 days or more, so a value typed as
    // "7d" shows as "7 days" rather than "1 week".
    const units = ms >= 14 * UNIT_MS.d
        ? [['week', UNIT_MS.w], ['day', UNIT_MS.d], ['hour', UNIT_MS.h], ['minute', UNIT_MS.m], ['second', UNIT_MS.s]]
        : [['day', UNIT_MS.d], ['hour', UNIT_MS.h], ['minute', UNIT_MS.m], ['second', UNIT_MS.s]];

    const parts = [];
    let rem = ms;
    for (const [name, size] of units) {
        const v = Math.floor(rem / size);
        if (v > 0) {
            parts.push(`${v} ${name}${v === 1 ? '' : 's'}`);
            rem -= v * size;
        }
        if (parts.length === 2) break;
    }
    return parts.join(' ') || '0 seconds';
}

// ============================================================
//  ARGUMENT PARSING
// ============================================================

function resolveTargetId(message, rest) {
    const um = message.mentions.users.first();
    if (um) return { targetId: um.id, rest: rest.filter(a => a.replace(/[<@!>]/g, '') !== um.id) };
    const i = rest.findIndex(a => /^\d{17,20}$/.test(a));
    if (i !== -1) {
        const id = rest[i];
        const copy = [...rest];
        copy.splice(i, 1);
        return { targetId: id, rest: copy };
    }
    return { targetId: null, rest };
}

// Extract user, role, and optional duration from the argument list.
function extract(message, rawArgs, allowDuration) {
    let { targetId, rest } = resolveTargetId(message, [...rawArgs]);

    let durationMs = null;
    let durationStr = null;
    if (allowDuration && rest.length) {
        const last = rest[rest.length - 1];
        const parsed = parseDuration(last);
        if (parsed) {
            durationMs = parsed;
            durationStr = last;
            rest = rest.slice(0, -1);
        }
    }

    let role = message.mentions.roles.first() || null;
    if (role) {
        rest = rest.filter(a => a.replace(/[<@&>]/g, '') !== role.id);
    } else {
        const i = rest.findIndex(a => /^\d{17,20}$/.test(a.replace(/[<@&>]/g, '')));
        if (i !== -1) {
            const rid = rest[i].replace(/[<@&>]/g, '');
            const found = message.guild.roles.cache.get(rid);
            if (found) { role = found; rest.splice(i, 1); }
        }
        if (!role && rest.length) {
            const name = rest.join(' ').trim().toLowerCase();
            role = message.guild.roles.cache.find(r => r.name.toLowerCase() === name)
                || message.guild.roles.cache.find(r => r.name.toLowerCase().includes(name))
                || null;
        }
    }

    return { targetId, role, durationMs, durationStr };
}

// Shared validation for assigning a role.
function checkRole(message, role) {
    if (role.id === message.guild.id) return 'You cannot assign the everyone role.';
    if (role.managed) return 'That role is managed by an integration and cannot be assigned manually.';

    const me = message.guild.members.me;
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles))
        return 'The bot needs the **Manage Roles** permission.';
    if (role.position >= me.roles.highest.position)
        return `The bot's role must be higher than **${role.name}**. Move the bot's role up in the role list.`;

    if (role.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId)
        return `You cannot assign **${role.name}** because it is equal to or above your highest role.`;

    return null;
}

// ============================================================
//  COMMAND: g!giverole
// ============================================================

async function cmdGiveRole(message, args) {
    const { targetId, role, durationMs, durationStr } = extract(message, args, true);

    if (!targetId || !role) {
        return reply(message,
            `**Give Role Usage**\n\n` +
            `\`${PREFIX}giverole <user> <role> [duration]\`\n\n` +
            `Duration is optional. Leave it empty for a permanent role.\n` +
            `Duration format: \`7d\`, \`12h\`, \`30m\`, \`1w\`, or combined like \`1d12h\`.\n\n` +
            `Examples:\n` +
            `\`${PREFIX}giverole @user VIP 7d\`\n` +
            `\`${PREFIX}giverole @user @Supporter 30d\`\n` +
            `\`${PREFIX}giverole @user Member\` (permanent)`
        );
    }

    const problem = checkRole(message, role);
    if (problem) return reply(message, problem);

    const member = await message.guild.members.fetch(targetId).catch(() => null);
    if (!member) return reply(message, 'That member is not in this server.');

    const now = Date.now();
    const expiresAt = durationMs ? now + durationMs : null;

    const alreadyHas = member.roles.cache.has(role.id);
    try {
        if (!alreadyHas) await member.roles.add(role.id, `Granted by ${message.author.tag}`);
    } catch (err) {
        return reply(message, `Failed to assign the role: ${err.message}`);
    }

    if (expiresAt) {
        setGrant(message.guild.id, {
            userId: targetId,
            roleId: role.id,
            grantedBy: message.author.id,
            grantedAt: now,
            expiresAt,
            durationMs,
            reminded: (expiresAt - now) <= REMINDER_BEFORE_MS,
        });
    } else {
        // permanent: drop any existing timed record so it will not be revoked
        removeGrant(message.guild.id, targetId, role.id);
    }

    // reply
    let text =
        `**Role Granted**\n\n` +
        `**Member:** <@${targetId}>\n` +
        `**Role:** <@&${role.id}>\n` +
        `**Duration:** ${expiresAt ? formatDuration(durationMs) : 'Permanent'}\n`;
    if (expiresAt) text += `**Expires:** ${timeFull(expiresAt)} (${timeRelative(expiresAt)})\n`;
    text += `**Granted by:** <@${message.author.id}>`;
    if (alreadyHas) text += `\n\nNote: the member already had this role. The expiry has been updated.`;
    await reply(message, text);

    // DM
    let dm = `**Role Granted**\n\nYou have been given the role **${role.name}** in ${message.guild.name}.`;
    if (expiresAt) dm += `\n\n**Duration:** ${formatDuration(durationMs)}\n**Expires:** ${timeRelative(expiresAt)}`;
    else dm += `\n\nThis role is permanent.`;
    await sendDM(member.user, dm);

    // log
    let log =
        `**Timed Role Granted**\n\n` +
        `**Member:** <@${targetId}>\n` +
        `**Role:** <@&${role.id}>\n` +
        `**Duration:** ${expiresAt ? formatDuration(durationMs) : 'Permanent'}\n`;
    if (expiresAt) log += `**Expires:** ${timeFull(expiresAt)} (${timeRelative(expiresAt)})\n`;
    log += `**Granted by:** <@${message.author.id}>`;
    await logTo(message.client, log);

    console.log(`[GIVEROLE] +${role.name} -> ${member.user.tag} (${expiresAt ? formatDuration(durationMs) : 'permanent'}) by ${message.author.tag}`);
}

// ============================================================
//  COMMAND: g!removerole
// ============================================================

async function cmdRemoveRole(message, args) {
    const { targetId, role } = extract(message, args, false);

    if (!targetId || !role) {
        return reply(message,
            `**Remove Role Usage**\n\n` +
            `\`${PREFIX}removerole <user> <role>\`\n\n` +
            `Removes a role from a member and cancels any timed grant for it.\n` +
            `Example: \`${PREFIX}removerole @user VIP\``
        );
    }

    const problem = checkRole(message, role);
    if (problem) return reply(message, problem);

    const member = await message.guild.members.fetch(targetId).catch(() => null);
    if (!member) return reply(message, 'That member is not in this server.');

    const had = member.roles.cache.has(role.id);
    if (had) {
        try {
            await member.roles.remove(role.id, `Removed by ${message.author.tag}`);
        } catch (err) {
            return reply(message, `Failed to remove the role: ${err.message}`);
        }
    }

    const hadGrant = Boolean(getGrant(message.guild.id, targetId, role.id));
    removeGrant(message.guild.id, targetId, role.id);

    if (!had && !hadGrant) {
        return reply(message, `<@${targetId}> does not have the role <@&${role.id}>.`);
    }

    await reply(message,
        `**Role Removed**\n\n` +
        `**Member:** <@${targetId}>\n` +
        `**Role:** <@&${role.id}>\n` +
        `**Removed by:** <@${message.author.id}>`
    );

    await sendDM(member.user, `**Role Removed**\n\nYour role **${role.name}** in ${message.guild.name} has been removed.`);

    await logTo(message.client,
        `**Role Removed**\n\n` +
        `**Member:** <@${targetId}>\n` +
        `**Role:** <@&${role.id}>\n` +
        `**Removed by:** <@${message.author.id}>`
    );
}

// ============================================================
//  COMMAND: g!roles  (a member's active timed grants)
// ============================================================

async function cmdRoles(message, args) {
    const { targetId } = extract(message, args, false);
    const userId = targetId || message.author.id;

    const guildData = db[message.guild.id] || {};
    const grants = Object.values(guildData)
        .filter(g => g.userId === userId)
        .sort((a, b) => a.expiresAt - b.expiresAt);

    if (!grants.length) {
        return reply(message, `**Timed Roles**\n<@${userId}>\n\nThis user has no active timed roles.`);
    }

    const lines = grants.slice(0, LIST_LIMIT).map((g, i) =>
        `**${i + 1}.** <@&${g.roleId}>\n` +
        `Expires: ${timeFull(g.expiresAt)} (${timeRelative(g.expiresAt)})\n` +
        `Granted by: <@${g.grantedBy}>`
    ).join('\n\n');

    let text = `**Timed Roles**\n<@${userId}>\n\n${lines}`;
    if (grants.length > LIST_LIMIT) text += `\n\n...and ${grants.length - LIST_LIMIT} more`;

    await reply(message, text);
}

// ============================================================
//  COMMAND: g!temproles  (all active timed grants in the guild)
// ============================================================

async function cmdTempRoles(message) {
    const guildData = db[message.guild.id] || {};
    const grants = Object.values(guildData).sort((a, b) => a.expiresAt - b.expiresAt);

    if (!grants.length) {
        return reply(message, `**Active Timed Roles**\n\nThere are no active timed roles in this server.`);
    }

    const lines = grants.slice(0, LIST_LIMIT).map((g, i) =>
        `**${i + 1}.** <@${g.userId}> — <@&${g.roleId}>\n` +
        `Expires ${timeRelative(g.expiresAt)}`
    ).join('\n\n');

    let text = `**Active Timed Roles (${grants.length})**\n\n${lines}`;
    if (grants.length > LIST_LIMIT) text += `\n\n...and ${grants.length - LIST_LIMIT} more`;

    await reply(message, text);
}

// ============================================================
//  SCHEDULER
// ============================================================

let schedulerStarted = false;

function startScheduler(client) {
    if (schedulerStarted) return;
    schedulerStarted = true;

    // sweep shortly after startup to catch anything that expired during downtime
    setTimeout(() => sweep(client).catch(() => {}), 5000);
    setInterval(() => sweep(client).catch(e => console.error('[GIVEROLE] sweep error:', e.message)), CHECK_INTERVAL_MS);

    console.log('[GIVEROLE] scheduler started');
}

async function sweep(client) {
    const now = Date.now();

    for (const [guildId, grants] of Object.entries(db)) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        for (const g of Object.values(grants)) {
            if (!g.expiresAt) continue;

            if (now >= g.expiresAt) {
                const status = await revoke(client, guild, g);
                if (status === 'done') removeGrant(guildId, g.userId, g.roleId);
            } else if (!g.reminded && (g.expiresAt - now) <= REMINDER_BEFORE_MS) {
                await remind(client, guild, g);
                g.reminded = true;
                saveData();
            }
        }
    }
}

// returns 'done' (remove from store) or 'retry' (keep and try again next sweep)
async function revoke(client, guild, g) {
    const role = guild.roles.cache.get(g.roleId);
    const member = await guild.members.fetch(g.userId).catch(() => null);

    if (!member) {
        await logTo(client, `**Timed Role Expired**\n\n**Member:** <@${g.userId}> (left the server)\n**Role:** <@&${g.roleId}>`);
        return 'done';
    }
    if (!role) {
        await logTo(client, `**Timed Role Expired**\n\n**Member:** <@${g.userId}>\n**Role:** \`${g.roleId}\` (role no longer exists)`);
        return 'done';
    }

    if (member.roles.cache.has(role.id)) {
        const me = guild.members.me;
        if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles) || role.position >= me.roles.highest.position) {
            console.error(`[GIVEROLE] cannot remove ${role.name} from ${member.user.tag}: missing permission or role position`);
            return 'retry';
        }
        try {
            await member.roles.remove(role.id, 'Timed role expired');
        } catch (err) {
            console.error('[GIVEROLE] failed to remove expired role:', err.message);
            return 'retry';
        }
    }

    await sendDM(member.user, `**Role Expired**\n\nYour role **${role.name}** in ${guild.name} has expired and has been removed.`);

    await logTo(client,
        `**Timed Role Expired**\n\n` +
        `**Member:** <@${g.userId}>\n` +
        `**Role:** <@&${g.roleId}>\n` +
        `**Granted by:** <@${g.grantedBy}>\n` +
        `**Duration:** ${g.durationMs ? formatDuration(g.durationMs) : 'unknown'}`
    );

    console.log(`[GIVEROLE] expired ${role.name} removed from ${member.user.tag}`);
    return 'done';
}

async function remind(client, guild, g) {
    const role = guild.roles.cache.get(g.roleId);
    const member = await guild.members.fetch(g.userId).catch(() => null);
    if (!member || !role) return; // if either is gone, the expiry sweep will clean up

    await sendDM(member.user,
        `**Role Expiring Soon**\n\n` +
        `Your role **${role.name}** in ${guild.name} will expire ${timeRelative(g.expiresAt)}.`
    );

    await logTo(client,
        `**Timed Role Expiring Soon**\n\n` +
        `**Member:** <@${g.userId}>\n` +
        `**Role:** <@&${g.roleId}>\n` +
        `**Expires:** ${timeFull(g.expiresAt)} (${timeRelative(g.expiresAt)})`
    );

    console.log(`[GIVEROLE] reminder sent for ${role.name} -> ${member.user.tag}`);
}

// ============================================================
//  DISPATCHER
// ============================================================

const COMMANDS = {
    giverole: cmdGiveRole,
    temprole: cmdGiveRole,
    removerole: cmdRemoveRole,
    takerole: cmdRemoveRole,
    roles: cmdRoles,
    temproles: cmdTempRoles,
    activeroles: cmdTempRoles,
};

async function handleMessage(message) {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();

        const handler = COMMANDS[command];
        if (!handler) return;

        // make sure the scheduler is running even if the ready event did not start it
        startScheduler(message.client);

        // requires Moderate Members. Below that: stay silent.
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

        await handler(message, args);
    } catch (err) {
        console.error('[GIVEROLE] error:', err);
        reply(message, `An error occurred: ${err.message}`);
    }
}

// ============================================================
//  API UNTUK MODUL LAIN
// ============================================================

// Dipakai modul lain (misalnya sistem donasi) untuk memberi role bermasa berlaku
// tanpa menulis file jadwal secara langsung. Menulis file dari dua tempat berbeda
// akan saling menimpa, jadi semua perubahan harus lewat fungsi ini.
//
// extend = true  : durasi ditambahkan ke sisa masa berlaku yang sedang berjalan
// extend = false : masa berlaku diganti dengan yang baru
async function grantTimedRole(guild, userId, roleId, durationMs, grantedById, options = {}) {
    const extend = options.extend !== false;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { ok: false, reason: 'member tidak ditemukan' };

    const role = guild.roles.cache.get(roleId);
    if (!role) return { ok: false, reason: 'role tidak ditemukan' };

    const me = guild.members.me;
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles))
        return { ok: false, reason: 'bot tidak punya izin Manage Roles' };
    if (role.position >= me.roles.highest.position)
        return { ok: false, reason: `posisi role bot harus di atas ${role.name}` };

    if (!member.roles.cache.has(roleId)) {
        try {
            await member.roles.add(roleId, options.reason || 'Timed role');
        } catch (err) {
            return { ok: false, reason: err.message };
        }
    }

    const now = Date.now();
    const lama = getGrant(guild.id, userId, roleId);

    let expiresAt;
    if (durationMs) {
        const dasar = (extend && lama && lama.expiresAt > now) ? lama.expiresAt : now;
        expiresAt = dasar + durationMs;
    } else {
        expiresAt = null;
    }

    if (expiresAt) {
        setGrant(guild.id, {
            userId,
            roleId,
            grantedBy: grantedById || (me && me.id),
            grantedAt: lama ? lama.grantedAt : now,
            expiresAt,
            durationMs,
            reminded: (expiresAt - now) <= REMINDER_BEFORE_MS,
        });
    } else {
        removeGrant(guild.id, userId, roleId);
    }

    return { ok: true, roleName: role.name, expiresAt, diperpanjang: Boolean(lama && lama.expiresAt > now) };
}

// Mengambil seluruh masa berlaku role milik seorang member
function getUserGrants(guildId, userId) {
    const data = db[guildId] || {};
    return Object.values(data)
        .filter(g => g.userId === userId)
        .sort((a, b) => a.expiresAt - b.expiresAt);
}

// Mencabut satu role beserta jadwal kedaluwarsanya. Dipakai modul lain ketika
// benefit dibatalkan, misalnya saat catatan donatur dihapus.
async function revokeTimedRole(guild, userId, roleId, reason) {
    const adaJadwal = Boolean(getGrant(guild.id, userId, roleId));
    removeGrant(guild.id, userId, roleId);

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { ok: adaJadwal, dicabut: false, reason: 'member tidak ditemukan' };

    const role = guild.roles.cache.get(roleId);
    if (!role) return { ok: adaJadwal, dicabut: false, reason: 'role tidak ditemukan' };

    if (!member.roles.cache.has(roleId)) return { ok: true, dicabut: false, roleName: role.name };

    const me = guild.members.me;
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles) || role.position >= me.roles.highest.position) {
        return { ok: false, dicabut: false, roleName: role.name, reason: 'izin atau posisi role bot tidak mencukupi' };
    }

    try {
        await member.roles.remove(roleId, reason || 'Benefit dibatalkan');
        return { ok: true, dicabut: true, roleName: role.name };
    } catch (err) {
        return { ok: false, dicabut: false, roleName: role.name, reason: err.message };
    }
}

module.exports = { handleMessage, startScheduler, grantTimedRole, revokeTimedRole, getUserGrants, formatDuration };
