// events/gomodInteractions.js
// Menyambungkan fitur Custom Role GOMOD (tombol & modal ber-customId 'crole_')
// ke loader event gokaizen. Logika aslinya ada di ../gomod/core.js.
// Handler ini hanya bereaksi ke interaksi 'crole_' — slash command gokaizen tidak terganggu.

const { handleInteraction } = require('../gomod/core');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        return handleInteraction(interaction);
    },
};
