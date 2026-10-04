// events/donasiAlertMessage.js
// Mendeteksi notifikasi donasi dari webhook Sociabuzz.
// Logika utamanya ada di ../utils/donasiAlert.js

const { handleMessage } = require('../utils/donasiAlert');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        return handleMessage(message);
    },
};
