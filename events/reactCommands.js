// events/reactCommands.js
// Command pemasangan reaksi (g!react dan g!unreact).
// Logika utamanya ada di ../utils/reactSystem.js

const { handleMessage } = require('../utils/reactSystem');

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        return handleMessage(message);
    },
};
