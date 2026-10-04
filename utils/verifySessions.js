const crypto = require('crypto');
const dbStore = require('./dbStore');

const KEY = 'verify_sessions';
const DEFAULT_TTL_MS = 15 * 60 * 1000;

function readSessions() {
  const data = dbStore.get(KEY) || {};
  return data && typeof data === 'object' ? data : {};
}

function writeSessions(data) {
  dbStore.set(KEY, data);
}

function createPendingVerification({ userId, guildId, expiresInMs = DEFAULT_TTL_MS } = {}) {
  if (!userId || !guildId) {
    throw new Error('userId dan guildId wajib diisi untuk sesi verifikasi.');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session = {
    token,
    userId,
    guildId,
    status: 'pending',
    createdAt: now,
    expiresAt: now + expiresInMs,
    updatedAt: now,
  };

  const sessions = readSessions();
  sessions[token] = session;
  writeSessions(sessions);

  return session;
}

function getVerificationSession(token) {
  if (!token) return null;

  const sessions = readSessions();
  const session = sessions[token];
  if (!session) return null;

  if (Number(session.expiresAt) <= Date.now()) {
    delete sessions[token];
    writeSessions(sessions);
    return null;
  }

  if (session.status !== 'pending') {
    return null;
  }

  return session;
}

function markVerificationStatus(token, status, extra = {}) {
  if (!token) return null;

  const sessions = readSessions();
  const session = sessions[token];
  if (!session) return null;

  const updated = {
    ...session,
    status,
    updatedAt: Date.now(),
    ...extra,
  };

  sessions[token] = updated;
  writeSessions(sessions);

  return updated;
}

function getVerificationUrl(token) {
  const baseUrl = (process.env.VERIFY_BASE_URL || 'https://verify.cantikkulaven.my.id').replace(/\/$/, '');
  return `${baseUrl}/verify?token=${encodeURIComponent(token)}`;
}

module.exports = {
  createPendingVerification,
  getVerificationSession,
  markVerificationStatus,
  getVerificationUrl,
};
