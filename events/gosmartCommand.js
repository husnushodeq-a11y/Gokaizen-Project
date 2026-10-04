// events/gosmartCommand.js
// Command lomba GO SMART (g!gosmart).
// Logika utamanya ada di ../utils/gosmartCommands.js

const { handleMessage } = require('../utils/gosmartCommands');

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        return handleMessage(message);
    },
};
