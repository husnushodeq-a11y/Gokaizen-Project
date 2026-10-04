// events/honeypotInteraction.js
// Handler interaksi button honeypot

const { handleInteraction } = require('../utils/honeypotSystem');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        return handleInteraction(interaction);
    },
};
