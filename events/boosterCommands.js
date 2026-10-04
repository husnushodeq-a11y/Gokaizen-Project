// events/boosterCommands.js
// Command uji pengumuman booster (g!boostertest).
// Logika utamanya ada di ../utils/boosterSystem.js

const { handleMessage } = require('../utils/boosterSystem');

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        return handleMessage(message);
    },
};
