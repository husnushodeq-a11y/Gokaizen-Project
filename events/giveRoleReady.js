// events/giveRoleReady.js
// Starts the timed role scheduler when the bot is ready, so expired roles are
// removed automatically. Main logic is in ../utils/giveRoleSystem.js

const { startScheduler } = require('../utils/giveRoleSystem');

module.exports = {
    name: 'ready',
    once: true,
    async execute(...args) {
        const client = args[args.length - 1] || args[0];
        startScheduler(client);
    },
};
