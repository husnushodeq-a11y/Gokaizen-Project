// events/donasiCommands.js
// Command donasi (g!donasi, g!donasitest, g!topdonatur, g!donatur).
// Logika utamanya ada di ../utils/donasiSystem.js

const { handleMessage } = require('../utils/donasiSystem');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        return handleMessage(message);
    },
};
