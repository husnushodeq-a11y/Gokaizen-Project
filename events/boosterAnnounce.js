// events/boosterAnnounce.js
// Memantau anggota yang mulai melakukan boost.
// Logika utamanya ada di ../utils/boosterSystem.js

const { handleMemberUpdate } = require('../utils/boosterSystem');

module.exports = {
    name: 'guildMemberUpdate',
    once: false,
    async execute(oldMember, newMember) {
        return handleMemberUpdate(oldMember, newMember);
    },
};
