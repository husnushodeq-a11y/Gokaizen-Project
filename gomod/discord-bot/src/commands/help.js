const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Tampilkan daftar semua command yang tersedia'),

  async execute(interaction) {
    const commands = interaction.client.commands;

    const commandList = commands.map(
      (cmd) => `\`/${cmd.data.name}\` — ${cmd.data.description}`
    ).join('\n');

    const embed = createEmbed({
      title: '📋 Daftar Commands',
      description: commandList || 'Tidak ada command yang terdaftar.',
      footer: `Total: ${commands.size} commands`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
