const D = require('./altDetectionData');
const processedJoins = new Set();

async function banMember({ guild, member, targetId, reason, action, moderatorId, ipHash, deleteMessageSeconds = 0 }) {
  const id = targetId || member?.id;
  if (!guild || !id) return { ok: false, error: 'target-not-found' };

  try {
    if (member?.ban) {
      await member.ban({ deleteMessageSeconds, reason });
    } else if (guild.members?.ban) {
      await guild.members.ban(id, { deleteMessageSeconds, reason });
    } else {
      return { ok: false, error: 'ban-method-unavailable' };
    }
  } catch (error) {
    D.addAuditLog({
      guildId: guild.id,
      discordId: id,
      ipHash,
      moderatorId,
      action,
      status: 'FAILED',
      reason,
      error: error.message,
    });
    return { ok: false, error: error.message };
  }

  D.addAuditLog({
    guildId: guild.id,
    discordId: id,
    ipHash,
    moderatorId,
    action,
    status: 'SUCCESS',
    reason,
  });
  return { ok: true };
}

async function unbanMember({ guild, targetId, reason }) {
  if (!guild?.bans?.remove || !targetId) return { ok: false, error: 'unban-method-unavailable' };

  try {
    const existingBan = await guild.bans.fetch(targetId).catch(() => null);
    if (!existingBan) return { ok: true, alreadyUnbanned: true };
    await guild.bans.remove(targetId, reason);
    return { ok: true, alreadyUnbanned: false };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function enforceBlacklistedIpJoin(member) {
  if (!member?.guild || member.user?.bot) return { checked: false, banned: false };

  const record = D.latestVerification(member.guild.id, member.id);
  if (!record?.ipHash) return { checked: true, banned: false };

  const matches = D.matches(member.guild.id, record).ip;
  if (!matches.length) return { checked: true, banned: false };

  const key = `${member.guild.id}:${member.id}`;
  if (processedJoins.has(key)) return { checked: true, banned: false, duplicate: true };
  processedJoins.add(key);
  setTimeout(() => processedJoins.delete(key), 60_000).unref?.();

  const result = await banMember({
    guild: member.guild,
    member,
    targetId: member.id,
    ipHash: record.ipHash,
    action: 'JOIN_BLACKLISTED_IP',
    reason: 'IP akun cocok dengan blacklist aktif',
  });
  if (result.ok) {
    D.addBan({
      guildId: member.guild.id,
      discordId: member.id,
      ipHash: record.ipHash,
      fingerprintHash: record.fingerprintHash,
      reason: 'JOIN_BLACKLISTED_IP',
      source: 'join-enforcement',
    });
  }
  return { checked: true, banned: result.ok, error: result.error };
}

module.exports = { banMember, unbanMember, enforceBlacklistedIpJoin };