const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const path = require('path');
const gbm = require('../../gbm');

const { ADMIN_ROLE_ID } = require(path.join(__dirname, '../../config.json'));

function isAdmin(member) {
  if (!member) return false;
  return Array.isArray(ADMIN_ROLE_ID)
    ? ADMIN_ROLE_ID.some(id => member.roles.cache.has(id))
    : member.roles.cache.has(ADMIN_ROLE_ID);
}

async function runSetup(interaction) {
  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const result = await gbm.setupPanel(interaction.guild, channel);

  if (!result.ok) {
    return { title: `${gbm.getEmoji('error')}Setup Gagal`, body: result.reason };
  }

  return {
    title: `${gbm.getEmoji('success')}Panel Berhasil Dipasang`,
    body: `Panel Get Bot Music aktif di ${channel} dan akan diperbarui secara otomatis.`
  };
}

async function runRefresh(interaction) {
  const result = await gbm.refreshPanel(interaction.guild);

  if (!result.ok) {
    return { title: `${gbm.getEmoji('error')}Panel Belum Dipasang`, body: result.reason };
  }

  return {
    title: `${gbm.getEmoji('success')}Panel Diperbarui`,
    body: 'Data bot musik telah disinkronkan ulang.'
  };
}

async function runOwner(interaction, sub) {
  if (sub === 'add') {
    const bot = interaction.options.getUser('bot', true);
    const owner = interaction.options.getUser('owner', true);
    const result = await gbm.setOwner(interaction.guild, bot.id, owner.id, interaction.user.id);

    if (!result.ok) {
      return { title: `${gbm.getEmoji('error')}Pendaftaran Gagal`, body: result.reason };
    }

    return {
      title: `${gbm.getEmoji('success')}Owner Terdaftar`,
      body: `Bot **${result.botName}** terdaftar sebagai bot premium milik ${owner}.`
    };
  }

  if (sub === 'remove') {
    const bot = interaction.options.getUser('bot', true);
    const result = await gbm.removeOwner(interaction.guild, bot.id);

    if (!result.ok) {
      return { title: `${gbm.getEmoji('error')}Data Tidak Ditemukan`, body: result.reason };
    }

    return {
      title: `${gbm.getEmoji('success')}Data Dihapus`,
      body: `Bot ${bot} dikembalikan ke daftar bot musik publik.`
    };
  }

  const list = gbm.ownerListText();
  return {
    title: `${gbm.getEmoji('premium')}Daftar Bot Premium`,
    body: list || 'Belum ada bot premium yang terdaftar.'
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adminaja')
    .setDescription('Pengaturan panel Get Bot Music')
    .addSubcommand(sub => sub
      .setName('setup')
      .setDescription('Memasang panel Get Bot Music pada channel tujuan')
      .addChannelOption(option => option
        .setName('channel')
        .setDescription('Channel tujuan panel, kosongkan untuk channel saat ini')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand(sub => sub
      .setName('refresh')
      .setDescription('Menyinkronkan ulang data dan memperbarui panel'))
    .addSubcommandGroup(group => group
      .setName('owner')
      .setDescription('Kelola owner bot musik premium')
      .addSubcommand(sub => sub
        .setName('add')
        .setDescription('Mendaftarkan bot premium beserta pemiliknya')
        .addUserOption(option => option
          .setName('bot')
          .setDescription('Akun bot musik premium')
          .setRequired(true))
        .addUserOption(option => option
          .setName('owner')
          .setDescription('Member pemilik bot')
          .setRequired(true)))
      .addSubcommand(sub => sub
        .setName('remove')
        .setDescription('Menghapus bot dari daftar premium')
        .addUserOption(option => option
          .setName('bot')
          .setDescription('Akun bot musik premium')
          .setRequired(true)))
      .addSubcommand(sub => sub
        .setName('list')
        .setDescription('Menampilkan seluruh bot premium yang terdaftar'))),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply(gbm.buildNotice(
        `${gbm.getEmoji('error')}Akses Ditolak`,
        'Command ini hanya dapat digunakan oleh admin.',
        true
      ));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    let result;
    try {
      if (group === 'owner') result = await runOwner(interaction, sub);
      else if (sub === 'setup') result = await runSetup(interaction);
      else result = await runRefresh(interaction);
    } catch (err) {
      console.error('[GBM] Command gagal:', err.message);
      result = {
        title: `${gbm.getEmoji('error')}Terjadi Kesalahan`,
        body: 'Perintah tidak dapat diproses. Silakan coba beberapa saat lagi.'
      };
    }

    return interaction.editReply(gbm.buildNotice(result.title, result.body));
  }
};
