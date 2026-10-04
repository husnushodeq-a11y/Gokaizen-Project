const { syncGoKaizenTaglineRole, extractServerTag } = require('./taglineRoleSync');

const entries = new Map();
const DEFAULT_DEBOUNCE_MS = 750;

function getKey(member) {
    return `${member.guild.id}:${member.id}`;
}

function enqueueTaglineRoleSync(member, client, options = {}) {
    if (!member?.guild || !member.id) return Promise.resolve(null);

    const key = getKey(member);
    const debounceMs = Number(options.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    let entry = entries.get(key);

    if (!entry) {
        entry = { member, client, timer: null, running: false, resolve: null, reject: null };
        entry.promise = new Promise((resolve, reject) => {
            entry.resolve = resolve;
            entry.reject = reject;
        });
        entries.set(key, entry);
    } else {
        entry.member = member;
        entry.client = client;
    }

    if (entry.timer) clearTimeout(entry.timer);
    if (!entry.running) {
        entry.timer = setTimeout(() => processEntry(key), debounceMs);
    }

    return entry.promise;
}

async function fetchLatestMember(member) {
    return member.guild.members.fetch({ user: member.id, force: true }).catch(() => member);
}

async function processEntry(key) {
    const entry = entries.get(key);
    if (!entry || entry.running) return;

    entry.timer = null;
    entry.running = true;
    let result = null;

    try {
        do {
            const member = await fetchLatestMember(entry.member);
            const beforeTag = extractServerTag(member) || '';
            result = await syncGoKaizenTaglineRole(member, entry.client);
            const latestMember = await fetchLatestMember(member);
            const afterTag = extractServerTag(latestMember) || '';

            if (beforeTag !== afterTag) {
                entry.member = latestMember;
            } else {
                break;
            }
        } while (true);

        entry.resolve(result);
    } catch (error) {
        entry.reject(error);
    } finally {
        entries.delete(key);
    }

    return result;
}

module.exports = {
    enqueueTaglineRoleSync,
};
