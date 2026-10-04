// events/antrianInteraction.js
// Tombol dan isian judul pada panel antrian.
// Logika utamanya ada di ../utils/antrianSystem.js

const { handleInteraction } = require('../utils/antrianSystem');

module.exports = {
    name: 'interactionCreate',
    once: false,
    async execute(interaction) {
        return handleInteraction(interaction);
    },
};
