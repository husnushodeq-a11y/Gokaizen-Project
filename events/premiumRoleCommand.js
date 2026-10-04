// events/premiumRoleCommand.js
// Command .premiumrole untuk memasang panel Premium Role.

const { handleCommand } = require('../utils/premiumRole');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        return handleCommand(message);
    },
};
