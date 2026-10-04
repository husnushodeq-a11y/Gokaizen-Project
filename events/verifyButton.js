const { Events } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'start_verification') return;

    if (!interaction.guild || !interaction.member) {
      return interaction.reply({
        content: '⚠️ Tombol verifikasi hanya bisa dipakai di server.',
        ephemeral: true,
      });
    }

    await interaction.reply({
      content: 'ℹ️ Flow verifikasi sekarang menggunakan command `!verif` di channel verifikasi.',
      ephemeral: true,
    });
  },
};
