// events/gosmartInteraction.js
// Tombol pendaftaran dan tombol jawaban pada lomba GO SMART.
// Logika utamanya ada di ../utils/gosmartCommands.js

const { handleInteraction } = require('../utils/gosmartCommands');

module.exports = {
    name: 'interactionCreate',
    once: false,
    async execute(interaction) {
        return handleInteraction(interaction);
    },
};
