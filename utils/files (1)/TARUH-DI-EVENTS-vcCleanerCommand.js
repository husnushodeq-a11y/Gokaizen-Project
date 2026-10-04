// events/vcCleanerCommand.js
// Command pembersih voice (g!vcclean).
// Logika utamanya ada di ../utils/vcCleaner.js

const { handleMessage } = require('../utils/vcCleaner');

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        return handleMessage(message);
    },
};
