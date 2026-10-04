// Menyambungkan command timeout (g!to) ke event loader utama.
const { handleMessage } = require('../utils/timeoutSystem');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        return handleMessage(message);
    },
};
