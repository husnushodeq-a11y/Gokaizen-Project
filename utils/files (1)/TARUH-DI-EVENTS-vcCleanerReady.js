// events/vcCleanerReady.js
// Menyalakan pembersih voice otomatis.
// Logika utamanya ada di ../utils/vcCleaner.js

const { mulai } = require('../utils/vcCleaner');

module.exports = {
    name: 'ready',
    once: true,
    async execute(...args) {
        const client = args[args.length - 1] || args[0];
        mulai(client);
    },
};
