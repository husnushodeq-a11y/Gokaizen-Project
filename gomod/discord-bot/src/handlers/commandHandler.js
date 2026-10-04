const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('../../config');
const logger = require('../utils/logger');

/**
 * Auto-load semua command files dari folder src/commands/
 * Setiap file harus export: { data, execute }
 */
function loadCommands(client) {
  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  const commandsData = [];

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if (!command.data || !command.execute) {
      logger.warn(`Command file ${file} tidak punya 'data' atau 'execute', skip.`);
      continue;
    }

    // Simpan ke collection di client
    client.commands.set(command.data.name, command);
    commandsData.push(command.data.toJSON());

    logger.info(`Command loaded: /${command.data.name}`);
  }

  // Deploy slash commands ke Discord API
  deployCommands(commandsData);

  logger.info(`Total ${commandFiles.length} commands loaded.`);
}

/**
 * Deploy slash commands ke Discord API
 * Untuk development: deploy ke guild (instant)
 * Untuk production: deploy global (bisa delay 1 jam)
 */
async function deployCommands(commands) {
  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    logger.info('Mulai deploy slash commands...');

    if (config.guildId) {
      // Deploy ke guild tertentu (instant, bagus untuk dev)
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands },
      );
      logger.info(`Slash commands deployed ke guild ${config.guildId}`);
    } else {
      // Deploy global (delay up to 1 jam)
      await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands },
      );
      logger.info('Slash commands deployed secara global.');
    }
  } catch (error) {
    logger.error('Gagal deploy slash commands:');
    logger.error(error.message);
  }
}

module.exports = loadCommands;
