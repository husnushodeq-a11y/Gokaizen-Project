// events/premiumRoleSelect.js
// Menangani pilihan pada select menu Premium Role.
// Logika utamanya ada di ../utils/premiumRole.js

const { handleInteraction } = require('../utils/premiumRole');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        return handleInteraction(interaction);
    },
};
