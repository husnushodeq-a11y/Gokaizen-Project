const { Events, ActivityType } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    logger.info(`✅ Bot online sebagai ${client.user.tag}`);
    logger.info(`📡 Melayani ${client.guilds.cache.size} server`);

    // Set activity/status bot
    client.user.setActivity('discord server', {
      type: ActivityType.Watching,
    });
  },
};
