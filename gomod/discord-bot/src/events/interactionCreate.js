const { Events } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  name: Events.InteractionCreate,
  once: false,
  async execute(interaction) {
    // Hanya handle slash commands
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      logger.warn(`Command tidak ditemukan: ${interaction.commandName}`);
      return;
    }

    try {
      logger.info(`Command dijalankan: /${interaction.commandName} oleh ${interaction.user.tag}`);
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Error menjalankan /${interaction.commandName}:`);
      logger.error(error.message);

      const reply = {
        content: '❌ Terjadi error saat menjalankan command ini.',
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  },
};
