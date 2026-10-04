// events/warnCommands.js
// Menyambungkan sistem peringatan (g!warn, g!warns, g!delwarn, g!clearwarns)
// ke loader event gokaizen. Logika utamanya ada di ../utils/warnSystem.js

const { handleMessage } = require('../utils/warnSystem');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        return handleMessage(message);
    },
};
