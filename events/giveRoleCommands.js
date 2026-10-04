// events/giveRoleCommands.js
// Timed role commands (g!giverole, g!removerole, g!roles, g!temproles).
// Main logic is in ../utils/giveRoleSystem.js

const { handleMessage } = require('../utils/giveRoleSystem');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        return handleMessage(message);
    },
};
