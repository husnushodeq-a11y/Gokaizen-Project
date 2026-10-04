// events/motmButton.js
// Menangani tombol peringkat lanjutan pada papan.

const { handleTombol } = require('../utils/motmBoard');

module.exports = {
    name: 'interactionCreate',
    once: false,
    async execute(interaction) {
        return handleTombol(interaction);
    },
};
