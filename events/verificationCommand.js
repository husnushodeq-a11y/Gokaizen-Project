const { Events, PermissionFlagsBits } = require('discord.js');
const config = require('../config.json');
const { createVerificationUrl } = require('../utils/altDetectionWeb');
const { getVerificationChannel, sendVerificationLinkToUser } = require('../utils/altJoinVerification');

function asArray(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function hasVerificationStaffAccess(member) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.ModerateMembers)) return true;

  const roleIds = [
    ...asArray(config.staffRoleIds),
    ...asArray(config.ADMIN_ROLE_ID),
    ...asArray(config.allowedEOIds),
  ].map(String);

  return member.roles.cache.some(role =>
    roleIds.includes(role.id) || role.name?.toLowerCase() === 'warden'
  );
}

function resolveTargetId(message, argument) {
  const mentioned = message.mentions.users.first();
  if (mentioned) return mentioned.id;
  const raw = String(argument || '').replace(/[<@!>]/g, '');
  return /^\d{17,20}$/.test(raw) ? raw : null;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author.bot) return;
    const args = message.content.trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();
    if (!['!verif', 'g!verif'].includes(command)) return;

    if (args.length > 0) {
      if (!hasVerificationStaffAccess(message.member)) {
        await message.reply('⚠️ Command ini hanya dapat digunakan staff atau Warden.').catch(() => null);
        return;
      }

      const targetId = resolveTargetId(message, args[0]);
      if (!targetId) {
        await message.reply('⚠️ Gunakan format `g!verif @user` atau `g!verif USER_ID`.').catch(() => null);
        return;
      }

      const target = await message.guild.members.fetch(targetId).catch(() => null);
      if (!target) {
        await message.reply('⚠️ User tidak ditemukan di server ini.').catch(() => null);
        return;
      }

      try {
        const url = createVerificationUrl(message.guild.id, target.id);
        const result = await sendVerificationLinkToUser(target.user, message.guild.id, url);
        await message.reply(result.success
          ? `✅ Link verifikasi untuk <@${target.id}> sudah dikirim ke DM-nya.`
          : `⚠️ DM <@${target.id}> tertutup atau tidak bisa menerima pesan.`).catch(() => null);
      } catch (err) {
        console.error('[VERIFY_COMMAND] gagal mengirim verifikasi staff:', err);
        await message.reply('⚠️ Link verifikasi gagal dibuat.').catch(() => null);
      }
      return;
    }

    const verifyChannel = await getVerificationChannel(message.guild);
    if (!verifyChannel || message.channel.id !== verifyChannel.id) return;

    try {
      const url = createVerificationUrl(message.guild.id, message.author.id);
      const result = await sendVerificationLinkToUser(message.author, message.guild.id, url);

      if (result.success) {
        await message.reply('✅ Link verifikasi sudah dikirim ke DM kamu.').catch(() => null);
      } else {
        await message.reply('⚠️ DM kamu tertutup. Buka pengaturan DM server ini lalu ketik `!verif` lagi.').catch(() => null);
      }
    } catch (err) {
      console.error('[VERIFY_COMMAND] gagal memproses !verif:', err);
      await message.reply('⚠️ Link verifikasi gagal dibuat. Silakan coba lagi.').catch(() => null);
    }
  },
};