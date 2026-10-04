const { ADMIN_ROLE_ID } = require('../config.json');
const { buildDummyListEmbeds } = require('../utils/dummyListEmbeds');

const PREFIX = 'g!';
const CHANNEL_IDS = {
  toList: '1552241199228919901',
  untoList: '1552241384042274866',
  unbanList: '1552241451188879401',
  catatanPelanggaran: '1552241698728579133',
  rules: '1348899202473787444'
};

module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message) {
    const command = message.content.trim().toLowerCase();
    if (message.author.bot || ![`${PREFIX}contoh`, `${PREFIX}rules`].includes(command)) return;
    if (!message.member?.roles.cache.has(ADMIN_ROLE_ID)) return;

    const embeds = buildDummyListEmbeds();
    const failedChannels = [];
    const embedNames = command === `${PREFIX}rules`
      ? ['rules']
      : Object.keys(CHANNEL_IDS).filter(embedName => embedName !== 'rules');

    for (const embedName of embedNames) {
      const channelId = CHANNEL_IDS[embedName];
      if (!channelId) {
        failedChannels.push(`${embedName} belum memiliki ID channel`);
        continue;
      }

      const channel = await message.client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        failedChannels.push(`${embedName} (${channelId}) tidak ditemukan`);
        continue;
      }

      if (embedName === 'rules') {
        for (const content of embeds.rules) {
          await channel.send({ content });
        }
      } else {
        await channel.send({ embeds: [embeds[embedName]] });
      }
    }

    if (failedChannels.length) {
      return message.reply(`⚠️ Sebagian embed belum dikirim:\n${failedChannels.map(item => `- ${item}`).join('\n')}`);
    }

    await message.react('✅').catch(() => null);
  }
};