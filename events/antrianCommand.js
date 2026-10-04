// events/antrianCommand.js
// Command antrian tampil (g!antrian).
// Logika utamanya ada di ../utils/antrianSystem.js

const { handleMessage } = require('../utils/antrianSystem');

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        return handleMessage(message);
    },
};
