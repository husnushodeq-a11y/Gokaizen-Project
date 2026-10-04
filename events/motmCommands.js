// events/motmCommands.js
// Command pengelolaan Member of the Month (g!motm).
// Logika utamanya ada di ../utils/motmCommands.js

const { handleMessage } = require('../utils/motmCommands');

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        return handleMessage(message);
    },
};
