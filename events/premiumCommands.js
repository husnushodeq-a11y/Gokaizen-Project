// events/premiumCommands.js
// Command premium berprefiks d! dan pengelolaan whitelistnya (g!premiumwl).
// Logika utamanya ada di ../utils/premiumSystem.js

const { handleMessage } = require('../utils/premiumSystem');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        return handleMessage(message);
    },
};
