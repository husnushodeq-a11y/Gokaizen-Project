const { Client, GatewayIntentBits, Collection } = require('discord.js');
const config = require('./config');
const logger = require('./src/utils/logger');
const loadEvents = require('./src/handlers/eventHandler');
const loadCommands = require('./src/handlers/commandHandler');

// Buat client Discord dengan intents yang dibutuhkan
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Collection untuk menyimpan commands
client.commands = new Collection();

// Load semua event handlers dan commands
loadEvents(client);
loadCommands(client);

// Login ke Discord
client.login(config.token)
  .then(() => logger.info('Login berhasil!'))
  .catch((err) => {
    logger.error('Gagal login ke Discord:');
    logger.error(err.message);
    process.exit(1);
  });
