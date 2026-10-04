// events/honeypotCommands.js
// Menyambungkan perintah honeypot (g!honeypot setup, status, dll)
// ke loader event gokaizen. Logika utamanya ada di ../utils/honeypotSystem.js

const { handleCommand } = require('../utils/honeypotSystem');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        return handleCommand(message);
    },
};
