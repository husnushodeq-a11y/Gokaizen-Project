const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Auto-load semua event files dari folder src/events/
 * Setiap file harus export: { name, once?, execute }
 */
function loadEvents(client) {
  const eventsPath = path.join(__dirname, '..', 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);

    if (!event.name || !event.execute) {
      logger.warn(`Event file ${file} tidak punya 'name' atau 'execute', skip.`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }

    logger.info(`Event loaded: ${event.name}`);
  }

  logger.info(`Total ${eventFiles.length} events loaded.`);
}

module.exports = loadEvents;
