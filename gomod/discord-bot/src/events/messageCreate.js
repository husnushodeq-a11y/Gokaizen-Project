const { Events } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  name: Events.MessageCreate,
  once: false,
  execute(message) {
    // Abaikan pesan dari bot
    if (message.author.bot) return;

    // Log pesan masuk (opsional, bisa dihapus di production)
    logger.debug(`[${message.guild?.name || 'DM'}] ${message.author.tag}: ${message.content}`);
  },
};
