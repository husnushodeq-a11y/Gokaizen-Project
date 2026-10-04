const { PermissionFlagsBits } = require("discord.js");

async function applyVoiceSettings(vc, entry) {
  if (!vc || !entry) return;

  try {
    // NAME
    if (entry.name)
      await vc.setName(entry.name).catch(() => {});

    // LIMIT
    await vc.setUserLimit(entry.limit || 0).catch(() => {});

    // BITRATE
    await vc.setBitrate(entry.bitrate || 64000).catch(() => {});

    // REGION
    if (entry.region && entry.region !== "auto") {
      await vc.setRTCRegion(entry.region).catch(() => {});
    }

    // NSFW
    await vc.edit({
      nsfw: entry.nsfw || false
    }).catch(() => {});

    // LOCK
    if (entry.locked) {
      await vc.permissionOverwrites.edit(
        vc.guild.roles.everyone,
        {
          Connect: false
        }
      ).catch(() => {});
    }

    // GHOST
    if (entry.ghost) {
      await vc.permissionOverwrites.edit(
        vc.guild.roles.everyone,
        {
          ViewChannel: false
        }
      ).catch(() => {});
    }

    // BLOCKED USERS
    if (Array.isArray(entry.blocked)) {
      for (const userId of entry.blocked) {
        await vc.permissionOverwrites.edit(userId, {
          ViewChannel: false,
          Connect: false
        }).catch(() => {});
      }
    }

    // TRUSTED USERS
    if (Array.isArray(entry.trusted)) {
      for (const userId of entry.trusted) {
        await vc.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          Connect: true
        }).catch(() => {});
      }
    }

  } catch (err) {
    console.error("[applyVoiceSettings]", err);
  }
}

module.exports = applyVoiceSettings;