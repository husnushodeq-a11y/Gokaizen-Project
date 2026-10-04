const { extractServerTag } = require('../utils/taglineRoleSync');
const { enqueueTaglineRoleSync } = require('../utils/taglineRoleQueue');

module.exports = {
    name: 'guildMemberUpdate',
    once: false,
    async execute(oldMember, newMember, client) {
        if (!newMember?.guild || !newMember?.id) return;

        const oldTag = extractServerTag(oldMember) ?? '';
        const newTag = extractServerTag(newMember) ?? '';

        if (oldTag === newTag) return;

        if (process.env.DEBUG_TAGLINE_ROLE === '1') {
            console.log('[TAGLINE_ROLE] guildMemberUpdate fired', {
                guildId: newMember.guild.id,
                userId: newMember.id,
                tag: newTag || 'unknown',
                oldTag: oldTag || 'unknown'
            });
        }

        let member = newMember;
        if (!member.presence && member.guild?.members?.cache?.has(member.id)) {
            member = member.guild.members.cache.get(member.id);
        }

        enqueueTaglineRoleSync(member, client).catch(err => {
            console.error('[TAGLINE_ROLE] gagal sinkronisasi setelah guildMemberUpdate:', err.message);
        });
    },
};
