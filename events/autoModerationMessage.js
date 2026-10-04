const { moderateMessage } = require('../utils/autoModeration');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        await moderateMessage(message);
    },
};
