const { SlashCommandBuilder, ChannelType } = require('discord.js');
const path = require('path');
const { ADMIN_ROLE_ID } = require(path.join(__dirname, '../../config.json'));
const db = require('../../utils/dbStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setvoicetime')
    .setDescription('Sinkronkan timer voice channel dengan timer hijau Discord (Admin only)')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Voice channel yang ingin disinkronkan')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('hours')
        .setDescription('Jam yang tertera di timer hijau Discord')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('minutes')
        .setDescription('Menit yang tertera di timer hijau Discord')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('seconds')
        .setDescription('Detik yang tertera di timer hijau Discord')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      return interaction.reply({ content: '❌ Admin only', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    if (channel.type !== ChannelType.GuildVoice) {
      return interaction.reply({ content: '❌ Channel harus berupa Voice Channel.', ephemeral: true });
    }

    const hours = interaction.options.getInteger('hours');
    const minutes = interaction.options.getInteger('minutes');
    const seconds = interaction.options.getInteger('seconds') || 0;

    const now = Date.now();
    const actualMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
    const createdElapsed = now - channel.createdTimestamp;

    // offset = selisih antara createdTimestamp dan waktu sebenarnya
    const offset = createdElapsed - actualMs;

    const offsets = db.get('voiceOffsets') || {};
    offsets[channel.id] = offset;
    db.set('voiceOffsets', offsets);

    await interaction.reply({
      content: `✅ Timer untuk <#${channel.id}> berhasil disinkronkan!\n` +
        `**Timer hijau:** ${hours}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}\n` +
        `**Offset disimpan:** ${Math.round(offset / 3600000)} jam\n` +
        `Tunggu update embed berikutnya (maks 10 detik).`,
      ephemeral: true
    });
  }
};
