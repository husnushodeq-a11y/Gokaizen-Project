const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = (client) => {
  client.on('ready', async () => {
    const channel = await client.channels.fetch(config.statusChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🟢 Bot Online')
      .setDescription('```Bot sekarang sudah online!```')
      .setColor('Green')
      .setTimestamp();

    channel.send({ embeds: [embed] });
  });

  client.on('shardDisconnect', async () => {
    const channel = await client.channels.fetch(config.statusChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🔴 Bot Offline')
      .setDescription('```Bot mengalami disconnect dari shard.```')
      .setColor('Red')
      .setTimestamp();

    channel.send({ embeds: [embed] });
  });

  const sendOfflineStatus = async () => {
    const channel = await client.channels.fetch(config.statusChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🔴 Bot Offline')
      .setDescription('```Bot offline (exit process).```')
      .setColor('Red')
      .setTimestamp();

    try {
      await channel.send({ embeds: [embed] });

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      console.error('Gagal mengirim status OFFLINE:', err);
    }
  };

  process.on('exit', sendOfflineStatus);
  process.on('SIGINT', async () => {
    await sendOfflineStatus();
    process.exit();
  });
  process.on('SIGTERM', async () => {
    await sendOfflineStatus();
    process.exit();
  });
};
