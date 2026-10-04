const { SlashCommandBuilder, ChannelType, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const path = require('path');
const { ADMIN_ROLE_ID } = require(path.join(__dirname, '../../config.json'));
const db = require('../../utils/dbStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('topvoice')
    .setDescription('TOP 50 Voice berdasarkan waktu (Admin only)')
    .addStringOption(option =>
      option.setName('category_ids')
        .setDescription('5 ID kategori dipisah koma')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('sync_channel')
        .setDescription('Channel yang ingin disinkronkan timernya (Opsional)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('sync_time')
        .setDescription('Waktu di timer hijau (Format HH:MM:SS) (Opsional)')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
      return interaction.reply({ content: '❌ Admin only', ephemeral: true });
    }

    const input = interaction.options.getString('category_ids');

    // MENGAKALI CACHE DISCORD: Pakai input category_ids sebagai perintah sync sementara
    // Format: sync|nama_channel|waktu
    if (input.toLowerCase().startsWith('sync|')) {
      const parts = input.split('|');
      if (parts.length !== 3) {
        return interaction.reply({ content: '❌ Format salah! Gunakan: sync|nama_channel|HH:MM:SS', ephemeral: true });
      }

      const target = parts[1].toLowerCase().trim();
      const timeStr = parts[2].trim();

      // Cari channel berdasarkan nama
      await interaction.guild.channels.fetch().catch(() => null);
      const vc = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && c.name.toLowerCase() === target);

      if (!vc) {
        return interaction.reply({ content: `❌ Channel '${target}' tidak ditemukan.`, ephemeral: true });
      }

      const match = timeStr.match(/(\d+):(\d+):(\d+)/);
      if (!match) {
        return interaction.reply({ content: '❌ Format waktu salah! (contoh: 3690:17:14)', ephemeral: true });
      }

      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const s = parseInt(match[3], 10);
      
      const actualMs = (h * 3600 + m * 60 + s) * 1000;
      const createdElapsed = Date.now() - vc.createdTimestamp;
      const offset = createdElapsed - actualMs;

      const offsets = db.get('voiceOffsets') || {};
      offsets[vc.id] = offset;
      db.set('voiceOffsets', offsets);

      return interaction.reply({ content: `✅ Offset untuk channel **${vc.name}** berhasil disimpan!\nSilakan jalankan ulang /topvoice dengan memasukkan ID kategori seperti biasa.`, ephemeral: true });
    }

    const categoryIds = input.split(',').map(x => x.trim());

    if (categoryIds.length !== 5) {
      return interaction.reply({ content: '❌ Harus 5 kategori', ephemeral: true });
    }

    await interaction.reply({ content: '✅ Top Voice sedang dikirim ke channel...', ephemeral: true });

    // Ensure all channels are loaded into cache
    await interaction.guild.channels.fetch().catch(() => null);

    const payload = buildTop10VoiceEmbed(interaction.guild, categoryIds);
    
    const msg = await interaction.channel.send(payload);

    db.set('topvoice10from4cat', {
      guildId: interaction.guild.id,
      channelId: msg.channel.id,
      messageId: msg.id,
      categoryIds
    });
  }
};

// === HELPER FUNCTIONS ===

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0')
  ].join(':');
}

function textBlock(content) {
  return new TextDisplayBuilder().setContent(content);
}

function divider() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function v2Payload(container) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

// === MAIN BUILD FUNCTION ===
// Mengambil waktu LANGSUNG dari createdTimestamp voice channel (realtime bawaan Discord)

function buildTop10VoiceEmbed(guild, categoryIds) {
  const result = [];
  const now = Date.now();
  const offsets = db.get('voiceOffsets') || {};

  for (const catId of categoryIds) {
    const category = guild.channels.cache.get(catId);
    if (!category || category.type !== ChannelType.GuildCategory) continue;

    guild.channels.cache
      .filter(ch => ch.parentId === catId && ch.type === ChannelType.GuildVoice)
      .forEach(vc => {
        // Hitung waktu dari createdTimestamp, kurangi offset jika ada
        const offset = offsets[vc.id] || 0;
        const elapsedMs = (now - vc.createdTimestamp) - offset;

        if (elapsedMs > 0 && vc.members.size > 0) {
          result.push({
            id: vc.id,
            parent: category.name,
            members: vc.members.size,
            totalMs: elapsedMs,
            time: formatDuration(elapsedMs)
          });
        }
      });
  }

  const top = result
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 50);

  const container = new ContainerBuilder()
    .setAccentColor(0x2B2D31);

  const header = `# 🏆 TOP 50 Voice Channels dari 7 Lounge`;
  container.addTextDisplayComponents(textBlock(header));
  container.addSeparatorComponents(divider());

  if (!top.length) {
    container.addTextDisplayComponents(textBlock('❌ Tidak ada voice channel yang aktif saat ini.'));
    return v2Payload(container);
  }

  // Format menjadi 2 section
  let section1 = '## 🏅 Top 1-25\n\n';
  let section2 = '## 🏅 Top 26-50\n\n';

  top.forEach((v, i) => {
    const rank = i + 1;
    const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**${rank}.**`;
    const line = `${rankEmoji} <#${v.id}>\n-# 👥 \`${v.members}\` Member  •  ⏱️ \`${v.time}\``;
    
    if (i < 25) {
      section1 += line + '\n\n';
    } else {
      section2 += line + '\n\n';
    }
  });

  if (top.length > 0) {
    container.addTextDisplayComponents(textBlock(section1.trim()));
  }
  
  if (top.length > 25) {
    container.addSeparatorComponents(divider());
    container.addTextDisplayComponents(textBlock(section2.trim()));
  }

  // Footer: terakhir diperbarui
  const updateTime = Math.floor(Date.now() / 1000);
  const footerText = `-# 🔄 Terakhir diperbarui: <t:${updateTime}:R>`;
  container.addSeparatorComponents(divider());
  container.addTextDisplayComponents(textBlock(footerText));

  return v2Payload(container);
}

module.exports.buildTop10VoiceEmbed = buildTop10VoiceEmbed;
