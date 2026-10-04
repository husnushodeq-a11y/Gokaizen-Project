const { extractServerTag } = require('../utils/taglineRoleSync');
const { enqueueTaglineRoleSync } = require('../utils/taglineRoleQueue');

module.exports = {
    name: 'userUpdate',
    once: false,
    async execute(oldUser, newUser, client) {
        const oldTag = extractServerTag(oldUser) ?? '';
        const newTag = extractServerTag(newUser) ?? '';

        if (oldTag === newTag) return;

        if (process.env.DEBUG_TAGLINE_ROLE === '1') {
            console.log('[TAGLINE_ROLE] userUpdate fired', {
                userId: newUser.id,
                oldTag: oldTag || 'unknown',
                newTag: newTag || 'unknown',
            });
        }

        for (const guild of client.guilds.cache.values()) {
            const member = await guild.members.fetch(newUser.id).catch(() => null);
            if (!member) continue;

            enqueueTaglineRoleSync(member, client).catch(error => {
                console.error('[TAGLINE_ROLE] gagal sinkronisasi dari userUpdate:', error.message);
            });
        }
    },
};
