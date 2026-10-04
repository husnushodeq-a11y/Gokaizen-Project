// utils/warnSystem.js
// Warning system. No automatic punishment, no log channel.
// All replies use Components V2 (no colored embed, no symbols) with user mentions.
// Used by events/warnCommands.js

const fs = require('fs');
const path = require('path');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    PermissionsBitField,
} = require('discord.js');

// ============================================================
//  CONFIG
// ============================================================

const PREFIX = 'g!';

// How many days a warning still counts as active. 0 = never expires.
const WARN_EXPIRY_DAYS = 0;

// Warnings shown per page in g!warns
const LIST_PER_PAGE = 8;

// Max users shown per group in g!warnlist
const LIST_MAX_PER_GROUP = 40;

// Permissions that mark a member as "Staff" in g!warnlist
const STAFF_PERMS = [
    PermissionsBitField.Flags.Administrator,
    PermissionsBitField.Flags.ModerateMembers,
    PermissionsBitField.Flags.KickMembers,
    PermissionsBitField.Flags.BanMembers,
    PermissionsBitField.Flags.ManageMessages,
    PermissionsBitField.Flags.ManageRoles,
];

// ============================================================
//  STORAGE
// ============================================================

const DATA_FILE = path.join(__dirname, '..', 'data', 'warnData.json');

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return {};
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        console.error('[WARN] failed to read warnData.json:', err.message);
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
        console.error('[WARN] failed to save warnData.json:', err.message);
    }
}

function getUserWarns(guildId, userId) {
    return db[guildId]?.[userId] || [];
}

function setUserWarns(guildId, userId, list) {
    if (!db[guildId]) db[guildId] = {};
    if (list.length) db[guildId][userId] = list;
    else delete db[guildId][userId];
    saveData();
}

function activeWarns(list) {
    if (!WARN_EXPIRY_DAYS) return list;
    const cutoff = Date.now() - WARN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    return list.filter(w => w.at >= cutoff);
}

function generateId(guildId) {
    const used = new Set(Object.values(db[guildId] || {}).flat().map(w => w.id));
    let id;
    do {
        id = Math.random().toString(36).slice(2, 8).toUpperCase();
    } while (used.has(id));
    return id;
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
    if (SUPPORTS_V2) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
        return user.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }
    return user.send({ content: text }).catch(() => null);
};

const timeRelative = ts => `<t:${Math.floor(ts / 1000)}:R>`;
const timeFull = ts => `<t:${Math.floor(ts / 1000)}:f>`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function resolveTargetId(message, args) {
    const mention = message.mentions.users.first();
    if (mention) return mention.id;
    const candidate = args.find(a => /^\d{17,20}$/.test(a.replace(/[<@!>]/g, '')));
    return candidate ? candidate.replace(/[<@!>]/g, '') : null;
}

// Fetch multiple guild members in batches of 100 (efficient for large guilds)
async function fetchMembers(guild, ids) {
    const map = new Map();
    for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const fetched = await guild.members.fetch({ user: chunk }).catch(() => null);
        if (fetched) for (const [id, m] of fetched) map.set(id, m);
    }
    return map;
}

const isStaff = member => STAFF_PERMS.some(p => member.permissions.has(p));

// ============================================================
//  COMMAND: g!warn
// ============================================================

async function cmdWarn(message, args) {
    const targetId = resolveTargetId(message, args);
    const reason = args
        .filter(a => a.replace(/[<@!>]/g, '') !== targetId)
        .join(' ')
        .trim();

    if (!targetId) {
        return reply(message,
            `**Warn Command Usage**\n\n` +
            `\`${PREFIX}warn <user> <reason>\` issue a warning to a member\n` +
            `\`${PREFIX}warns <user>\` view a member's warning history\n` +
            `\`${PREFIX}warnlist\` list all warned users\n` +
            `\`${PREFIX}delwarn <ID>\` remove a single warning (Administrator)\n` +
            `\`${PREFIX}clearwarns <user>\` clear all warnings (Administrator)`
        );
    }

    if (!reason) {
        return reply(message, `**Reason Required**\n\nA reason is required. Example: \`${PREFIX}warn @user spamming in general\``);
    }

    if (targetId === message.author.id)
        return reply(message, 'You cannot warn yourself.');
    if (targetId === message.client.user.id)
        return reply(message, 'You cannot warn a bot.');
    if (targetId === message.guild.ownerId)
        return reply(message, 'You cannot warn the server owner.');

    const target = await message.guild.members.fetch(targetId).catch(() => null);
    if (!target)
        return reply(message, 'That member is not in this server.');
    if (target.user.bot)
        return reply(message, 'You cannot warn a bot.');

    if (
        target.roles.highest.position >= message.member.roles.highest.position &&
        message.author.id !== message.guild.ownerId
    ) {
        return reply(message, 'You cannot warn a member whose highest role is equal to or above yours.');
    }

    const warn = {
        id: generateId(message.guild.id),
        modId: message.author.id,
        modTag: message.author.tag,
        reason,
        at: Date.now(),
    };

    const all = getUserWarns(message.guild.id, targetId);
    all.push(warn);
    setUserWarns(message.guild.id, targetId, all);

    const count = activeWarns(all).length;

    await sendDM(target.user,
        `**Warning**\n\n` +
        `You have received a warning in ${message.guild.name}.\n\n` +
        `**Reason:** ${reason}\n` +
        `**Total Warnings:** ${count}\n` +
        `**ID:** \`${warn.id}\``
    );

    await reply(message,
        `**Warning Issued**\n\n` +
        `**Member:** <@${targetId}>\n` +
        `**Moderator:** <@${message.author.id}>\n` +
        `**Total Warnings:** ${count}\n` +
        `**ID:** \`${warn.id}\`\n` +
        `**Reason:** ${reason}`
    );

    console.log(`[WARN] +1 ${target.user.tag} (total ${count}) by ${message.author.tag}`);
}

// ============================================================
//  COMMAND: g!warns
// ============================================================

async function cmdWarns(message, args) {
    const targetId = resolveTargetId(message, args) || message.author.id;
    const pageArg = args.find(a => /^\d{1,3}$/.test(a) && a.replace(/[<@!>]/g, '') !== targetId);
    let page = Math.max(1, parseInt(pageArg, 10) || 1);

    const all = getUserWarns(message.guild.id, targetId);
    if (!all.length) {
        return reply(message, `**Warning History**\n<@${targetId}>\n\nThis user has no warning history.`);
    }

    const active = activeWarns(all);
    const sorted = [...all].sort((a, b) => b.at - a.at);

    const totalPages = Math.max(1, Math.ceil(sorted.length / LIST_PER_PAGE));
    if (page > totalPages) page = totalPages;
    const start = (page - 1) * LIST_PER_PAGE;
    const slice = sorted.slice(start, start + LIST_PER_PAGE);

    const entries = slice.map((w, idx) => {
        const number = start + idx + 1;
        const tag = WARN_EXPIRY_DAYS && !active.some(a => a.id === w.id) ? ' (expired)' : '';
        return `**${number}.** ID \`${w.id}\`${tag}\n` +
            `Reason: ${w.reason}\n` +
            `Moderator: ${w.modId ? `<@${w.modId}>` : w.modTag}\n` +
            `Date: ${timeFull(w.at)} (${timeRelative(w.at)})`;
    }).join('\n\n');

    let text =
        `**Warning History**\n<@${targetId}>\n\n` +
        `**Total:** ${all.length}` +
        (WARN_EXPIRY_DAYS ? ` (active ${active.length})` : '') +
        `\n\n${entries}`;

    if (totalPages > 1) {
        const next = page + 1 > totalPages ? 1 : page + 1;
        const ref = targetId === message.author.id ? '' : '@user ';
        text += `\n\nPage ${page} of ${totalPages}. Type \`${PREFIX}warns ${ref}${next}\` to view another page.`;
    } else {
        text += `\n\nRemove a warning with \`${PREFIX}delwarn <ID>\``;
    }

    await reply(message, text);
}

// ============================================================
//  COMMAND: g!warnlist
// ============================================================

async function cmdWarnList(message) {
    const guildData = db[message.guild.id] || {};
    const ids = Object.keys(guildData).filter(id => (guildData[id] || []).length > 0);

    if (!ids.length) {
        return reply(message, `**Warned Users**\n\nNo users currently have warnings.`);
    }

    const members = await fetchMembers(message.guild, ids);

    const staff = [];
    const regular = [];

    for (const id of ids) {
        const count = activeWarns(guildData[id]).length || guildData[id].length;
        const entry = { id, count };
        const member = members.get(id);
        if (member && isStaff(member)) staff.push(entry);
        else regular.push(entry);
    }

    staff.sort((a, b) => b.count - a.count);
    regular.sort((a, b) => b.count - a.count);

    const renderGroup = (title, list) => {
        if (!list.length) return `**${title} (0)**\nNone`;
        const shown = list.slice(0, LIST_MAX_PER_GROUP);
        const lines = shown.map((e, i) => `${i + 1}. <@${e.id}> (${plural(e.count, 'warning')})`);
        let out = `**${title} (${list.length})**\n` + lines.join('\n');
        if (list.length > LIST_MAX_PER_GROUP) {
            out += `\n...and ${list.length - LIST_MAX_PER_GROUP} more`;
        }
        return out;
    };

    const totalWarnings = ids.reduce((sum, id) => sum + guildData[id].length, 0);

    const text =
        `**Warned Users**\n\n` +
        renderGroup('Staff', staff) + `\n\n` +
        renderGroup('Members', regular) + `\n\n` +
        `Total: ${plural(ids.length, 'user')} with ${plural(totalWarnings, 'warning')}`;

    await reply(message, text);
}

// ============================================================
//  COMMAND: g!delwarn  (Administrator)
// ============================================================

async function cmdDelWarn(message, args) {
    const id = (args[0] || '').toUpperCase();
    if (!id) {
        return reply(message,
            `**Usage**\n\nRemove a single warning by its ID.\n` +
            `Example: \`${PREFIX}delwarn A1B2C3\`\n` +
            `View IDs with \`${PREFIX}warns @user\`.`
        );
    }

    const guildData = db[message.guild.id] || {};
    let ownerId = null;
    let target = null;

    for (const [userId, list] of Object.entries(guildData)) {
        const found = list.find(w => w.id === id);
        if (found) { ownerId = userId; target = found; break; }
    }

    if (!target) {
        return reply(message, `No warning found with ID \`${id}\`.`);
    }

    const remaining = guildData[ownerId].filter(w => w.id !== id);
    setUserWarns(message.guild.id, ownerId, remaining);

    await reply(message,
        `**Warning Removed**\n\n` +
        `**Member:** <@${ownerId}>\n` +
        `**Moderator:** <@${message.author.id}>\n` +
        `**Remaining Warnings:** ${remaining.length}\n` +
        `**Original Reason:** ${target.reason}`
    );
}

// ============================================================
//  COMMAND: g!clearwarns  (Administrator)
// ============================================================

async function cmdClearWarns(message, args) {
    const targetId = resolveTargetId(message, args);
    if (!targetId) {
        return reply(message,
            `**Usage**\n\nClear all warnings for a member.\n` +
            `Example: \`${PREFIX}clearwarns @user\``
        );
    }

    const all = getUserWarns(message.guild.id, targetId);
    if (!all.length) {
        return reply(message, 'This member has no warnings.');
    }

    setUserWarns(message.guild.id, targetId, []);

    await reply(message,
        `**All Warnings Cleared**\n\n` +
        `**Member:** <@${targetId}>\n` +
        `**Moderator:** <@${message.author.id}>\n` +
        `**Warnings Removed:** ${all.length}`
    );
}

// ============================================================
//  DISPATCHER
// ============================================================

const COMMANDS = {
    warn: cmdWarn,
    warns: cmdWarns,
    warnlist: cmdWarnList,
    delwarn: cmdDelWarn,
    unwarn: cmdDelWarn,
    clearwarns: cmdClearWarns,
};

// Restricted to the Administrator permission.
// warn, warns, and warnlist remain available to moderators (Moderate Members).
const ADMIN_ONLY = new Set(['delwarn', 'unwarn', 'clearwarns']);

async function handleMessage(message) {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();

        const handler = COMMANDS[command];
        if (!handler) return;

        // Every warn command requires at least Moderate Members. Below that: stay silent.
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

        // delwarn and clearwarns require Administrator
        if (ADMIN_ONLY.has(command) && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return reply(message, 'This command is restricted to roles with the **Administrator** permission.');
        }

        await handler(message, args);
    } catch (err) {
        console.error('[WARN] error:', err);
        reply(message, `An error occurred: ${err.message}`);
    }
}

module.exports = { handleMessage };
