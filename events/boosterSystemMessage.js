// events/boosterSystemMessage.js
// Memantau pesan sistem boost dari Discord, yang dikirim pada setiap boost
// termasuk boost kedua dan seterusnya.
// Logika utamanya ada di ../utils/boosterSystem.js

const { handleSystemMessage } = require('../utils/boosterSystem');

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        return handleSystemMessage(message);
    },
};
