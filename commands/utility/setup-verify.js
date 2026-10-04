const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const config = require('../../config.json');

const DEFAULT_VERIFY_CHANNEL_ID = '1551964610586873926';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('Mengirim panel verifikasi member baru ke channel tujuan.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: '❌ Command ini hanya bisa dipakai di server Discord.',
        ephemeral: true,
      });
    }

    const verifyChannelId = process.env.VERIFY_CHANNEL_ID || config.VERIFY_CHANNEL_ID || DEFAULT_VERIFY_CHANNEL_ID;
    const targetChannel = interaction.guild.channels.cache.get(verifyChannelId)
      || await interaction.guild.channels.fetch(verifyChannelId).catch(() => null);

    if (!targetChannel || !targetChannel.isTextBased()) {
      return interaction.reply({
        content: `⚠️ Channel verifikasi dengan ID ${verifyChannelId} tidak ditemukan atau bukan channel teks.`,
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🔐 Verifikasi Member Baru GO KAIZEN')
      .setDescription('Halo, selamat datang di GO KAIZEN. Untuk memastikan akunmu valid dan membuka akses ke seluruh server, silakan lakukan verifikasi dengan mengikuti langkah di bawah ini.')
      .setColor(0x5865F2)
      .addFields(
        {
          name: '📌 Langkah verifikasi',
          value: '1. Ketik **!verif** di channel ini.\n2. Buka link yang dikirim ke DM kamu.\n3. Selesaikan proses verifikasi sesuai instruksi yang diberikan.',
        },
        {
          name: '👩‍🦰 Khusus member female',
          value: 'Untuk verifikasi female, tetap diarahkan ke voice channel khusus yang sudah disiapkan oleh staff.',
        }
      )
      .setFooter({ text: 'Proses verifikasi hanya berlaku dalam waktu 15 menit.' })
      .setTimestamp();

    await targetChannel.send({
      embeds: [embed],
    });

    await interaction.reply({
      content: `✅ Panel verifikasi berhasil dikirim ke <#${targetChannel.id}>.`,
      ephemeral: true,
    });
  },
};
