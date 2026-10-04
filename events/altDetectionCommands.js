const { handleMessage } = require('../utils/altDetectionSystem');

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        return handleMessage(message);
    },
};
