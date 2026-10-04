// events/motmReady.js
// Menyalakan penjadwal papan Member of the Month.

const { mulai } = require('../utils/motmScheduler');

module.exports = {
    name: 'ready',
    once: true,
    async execute(...args) {
        const client = args[args.length - 1] || args[0];
        await mulai(client);
    },
};
