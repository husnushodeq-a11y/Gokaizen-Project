const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = (client) => {

  global.client = client;

  process.on('uncaughtException', async (err) => {
    const channel = await client.channels.fetch(config.statusChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('❌ Uncaught Exception')
      .setDescription(`\`\`\`js\n${err.message}\n\`\`\``)
      .setColor('Red')
      .setTimestamp();

    channel.send({ embeds: [embed] });
    console.error(err);
  });

  process.on('unhandledRejection', async (reason) => {
    const channel = await client.channels.fetch(config.statusChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Unhandled Promise Rejection')
      .setDescription(`\`\`\`js\n${reason}\n\`\`\``)
      .setColor('Red')
      .setTimestamp();

    channel.send({ embeds: [embed] });
    console.error(reason);
  });
};
