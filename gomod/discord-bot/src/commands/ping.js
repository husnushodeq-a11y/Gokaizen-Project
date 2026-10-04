const { SlashCommandBuilder } = require('discord.js');
const { createEmbed } = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Cek apakah bot masih hidup dan latency-nya'),

  async execute(interaction) {
    const sent = await interaction.reply({
      content: '🏓 Menghitung ping...',
      fetchReply: true,
    });

    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsping = interaction.client.ws.ping;

    const embed = createEmbed({
      title: '🏓 Pong!',
      fields: [
        { name: 'Roundtrip Latency', value: `${roundtrip}ms`, inline: true },
        { name: 'WebSocket Ping', value: `${wsping}ms`, inline: true },
      ],
    });

    await interaction.editReply({ content: null, embeds: [embed] });
  },
};
