const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const { ADMIN_ROLE_ID } = require(path.join(__dirname, '../../config.json'));
const db = require('../../utils/dbStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recovervoicetime')
    .setDescription('Memulihkan timer voice dari pesan embed lama (Admin only)')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Text channel tempat pesan embed lama berada')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('message_id')
        .setDescription('ID pesan (Message ID) dari embed lama tersebut')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('add_hours')
        .setDescription('Tambahan jam untuk kompensasi selisih hari (opsional)')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      return interaction.reply({ content: '❌ Admin only', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    const messageId = interaction.options.getString('message_id');
    const addHours = interaction.options.getInteger('add_hours') || 0;

    await interaction.deferReply({ ephemeral: true });

    try {
      const message = await channel.messages.fetch(messageId);
      if (!message || !message.embeds || message.embeds.length === 0) {
        return interaction.editReply('❌ Pesan tidak ditemukan atau tidak memiliki embed.');
      }

      const embed = message.embeds[0];
      let recoveredCount = 0;
      const data = db.get('voiceTime') || {};

      // Parse semua teks dari description dan fields
      const allText = [
        embed.description || '',
        ...embed.fields.map(f => f.name + '\n' + f.value)
      ].join('\n\n');

      // Regex untuk menangkap pola: <#ID> ... ⏱ HH:MM:SS atau ⏱️ HH:MM:SS
      const regex = /<#(\d+)>.*?⏱[^\d]*(\d+):(\d+):(\d+)/gs;
      
      let match;
      while ((match = regex.exec(allText)) !== null) {
        const vcId = match[1];
        const h = parseInt(match[2], 10);
        const m = parseInt(match[3], 10);
        const s = parseInt(match[4], 10);

        const recoveredMs = (h * 3600 + m * 60 + s) * 1000;
        const compensationMs = addHours * 3600 * 1000;
        const totalMs = recoveredMs + compensationMs;

        if (!data[vcId]) {
          data[vcId] = {
            totalMs: 0,
            activeSince: null,
            memberCount: 0
          };
        }

        if (data[vcId].activeSince) {
          const currentActiveDuration = Date.now() - data[vcId].activeSince;
          data[vcId].totalMs = Math.max(0, totalMs - currentActiveDuration);
        } else {
          data[vcId].totalMs = totalMs;
        }

        recoveredCount++;
      }

      if (recoveredCount > 0) {
        db.set('voiceTime', data);
        return interaction.editReply(`✅ Berhasil memulihkan waktu untuk **${recoveredCount} Voice Channel** dari embed lama.\n(Kompensasi ditambahkan: +${addHours} jam). Tunggu update embed berikutnya.`);
      } else {
        return interaction.editReply('❌ Tidak ditemukan data waktu (format: ⏱ HH:MM:SS) pada pesan tersebut.');
      }

    } catch (err) {
      console.error(err);
      return interaction.editReply('❌ Terjadi kesalahan saat membaca pesan. Pastikan ID benar dan bot memiliki akses ke channel tersebut.');
    }
  }
};
