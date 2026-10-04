async function getVerificationChannel(guild) {
  const channelId = process.env.VERIFY_CHANNEL_ID || process.env.VERIFY_FALLBACK_CHANNEL_ID || guild?.systemChannelId;
  if (!channelId || !guild) return null;
  return guild.channels?.cache?.get(channelId)
    || await guild.channels?.fetch?.(channelId).catch(() => null);
}

async function sendVerificationPrompt(member) {
  if (!member || !member.user || !member.guild) {
    return { success: false, error: 'invalid-member' };
  }

  const fallbackChannel = await getVerificationChannel(member.guild);

  if (fallbackChannel) {
    try {
      await fallbackChannel.send({
        content: `Selamat datang <@${member.id}>! Ketik **!verif** di channel ini untuk menerima link verifikasi melalui DM. Jika terkendala dalam verif, bisa menghubungi staff melalui ticket <#1431026073495146696>.`,
      });
      console.log(`[ALT_WEB] instruksi verifikasi dikirim ke channel ${fallbackChannel.id} untuk ${member.id}`);
      return { sentTo: 'verify-channel', success: true };
    } catch (channelErr) {
      console.warn(`[ALT_WEB] gagal kirim notifikasi umum ke channel verifikasi ${fallbackChannel.id}: ${channelErr.message}`);
    }
  }

  return { sentTo: null, success: false, error: 'verification-channel-unavailable' };
}

async function sendVerificationLinkToUser(user, guildId, url) {
  if (!user || !url) return { sentTo: null, success: false, error: 'invalid-request' };

  try {
    await user.send(`Halo ${user.username}, silakan selesaikan verifikasi di:\n${url}`);
    console.log(`[ALT_WEB] link verifikasi dikirim via DM ke ${user.id}`);
    return { sentTo: 'dm', success: true };
  } catch (err) {
    console.warn(`[ALT_WEB] gagal kirim DM verifikasi ke ${user.id}: ${err.message}`);
    return { sentTo: null, success: false, error: err.message };
  }
}

async function sendVerificationLinkWithFallback(member, url) {
  if (!member || !member.user || !member.guild) {
    return { sentTo: null, success: false, error: 'invalid-member' };
  }

  const channelResult = await sendVerificationPrompt(member);
  try {
    await member.send(`Halo ${member.user.username}, silakan selesaikan verifikasi di:\n${url}`);
    return { sentTo: 'dm', success: true };
  } catch (err) {
    console.warn(`[ALT_WEB] gagal kirim DM verifikasi ke ${member.id}: ${err.message}`);
  }
  if (channelResult.success) return channelResult;
  return { sentTo: null, success: false, error: 'dm-failed' };
}

module.exports = {
  getVerificationChannel,
  sendVerificationPrompt,
  sendVerificationLinkToUser,
  sendVerificationLinkWithFallback,
};
