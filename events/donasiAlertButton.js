// events/donasiAlertButton.js
// Menangani tombol penanda donasi yang sudah dicatat.
// Logika utamanya ada di ../utils/donasiAlert.js

const { handleInteraction } = require('../utils/donasiAlert');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        return handleInteraction(interaction);
    },
};
