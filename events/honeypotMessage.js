// events/honeypotMessage.js
// Menangani pesan masuk di channel honeypot — deteksi gambar & hapus teks.
// Logika utamanya ada di ../utils/honeypotSystem.js

const { handleHoneypotMessage } = require('../utils/honeypotSystem');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        return handleHoneypotMessage(message);
    },
};
