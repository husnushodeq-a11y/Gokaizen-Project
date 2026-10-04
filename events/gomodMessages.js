// events/gomodMessages.js
// Menyambungkan fitur GOMOD (radar anti-scam, command prefix g!, auto-responder,
// gosmed/goline) ke loader event gokaizen. Logika aslinya ada di ../gomod/core.js.
// Coexist dengan messageCreate lain milik gokaizen (masing-masing cek prefix sendiri).

const { handleMessage } = require('../gomod/core');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        return handleMessage(message);
    },
};
