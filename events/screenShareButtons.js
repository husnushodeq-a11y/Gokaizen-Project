const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('../config.json');

function collectModeratorRoleIds() {
  return [
    '1376416212724088932',
    '1367316783832502282',
    '1386874017105051759',
    '1488646728226967563'
  ];
}

function hasModeratorAccess(member) {
  if (!member || !member.roles) return false;
  const ids = collectModeratorRoleIds();
  return ids.some((roleId) => member.roles.cache.has(roleId));
}

function getWarningEmbed(member) {
  return new EmbedBuilder()
    .setTitle('⚠️ Peringatan Restream Hak Cipta')
    .setDescription('Anda terdeteksi melakukan screen share / Go Live tanpa game resmi yang sedang berjalan. Restream siaran resmi yang dilindungi hak cipta tidak diizinkan di server ini.')
    .addFields(
      { name: 'Aturan Server', value: 'Stream gameplay resmi dengan game aktif diperbolehkan. Jika tidak ada game aktif, screen share/browser/media player dianggap mencurigakan dan dapat ditindak lanjuti.', inline: false },
      { name: 'Tindakan', value: 'Harap hentikan stream atau pindah ke gameplay dengan game resmi yang aktif.', inline: false }
    )
    .setColor(0xff0000)
    .setTimestamp();
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('screenshare_')) return;

    if (!interaction.member || !interaction.guild) {
      return;
    }

    if (!hasModeratorAccess(interaction.member)) {
      return interaction.reply({
        content: '❌ Hanya moderator/admin yang dapat memakai tombol ini.',
        ephemeral: true,
      });
    }

    const [action, memberId, guildId] = interaction.customId.split(':');
    if (!memberId || !guildId) return;

    const guild = interaction.guild;
    const member = guild.members.cache.get(memberId) || await guild.members.fetch(memberId).catch(() => null);

    if (!member) {
      return interaction.reply({
        content: '⚠️ Member tidak ditemukan atau sudah keluar dari server.',
        ephemeral: true,
      });
    }

    if (action === 'screenshare_warn') {
      try {
        await member.send({ embeds: [getWarningEmbed(member)] });
        return interaction.reply({
          content: `✅ Peringatan berhasil dikirim ke ${member.user.tag}.`,
          ephemeral: true,
        });
      } catch (error) {
        return interaction.reply({
          content: `⚠️ Gagal mengirim DM ke ${member.user.tag}. DM mungkin terkunci atau user memblokir bot. Silakan kirim peringatan manual.`,
          ephemeral: true,
        });
      }
    }

    if (action === 'screenshare_disconnect') {
      try {
        const voiceChannel = member.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({
            content: `⚠️ ${member.user.tag} saat ini tidak berada di voice channel.`,
            ephemeral: true,
          });
        }

        await member.voice.disconnect('Restream mencurigakan / hak cipta');
        return interaction.reply({
          content: `✅ ${member.user.tag} berhasil diputus dari ${voiceChannel.name}.`,
          ephemeral: true,
        });
      } catch (error) {
        return interaction.reply({
          content: `⚠️ Bot gagal memutus user dari VC. Periksa permission bot dan status voice user.`,
          ephemeral: true,
        });
      }
    }
  },
};
