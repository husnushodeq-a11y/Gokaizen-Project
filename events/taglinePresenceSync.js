module.exports = {
    name: 'presenceUpdate',
    once: false,
    async execute() {
        if (process.env.DEBUG_TAGLINE_ROLE === '1') {
            console.log('[TAGLINE_ROLE] presenceUpdate ignored; server-tag changes are handled by guildMemberUpdate');
        }
    },
};
