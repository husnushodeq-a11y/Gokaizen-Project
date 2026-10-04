const crypto = require('crypto');
const express = require('express');
const D = require('./altDetectionData');
const { markVerified } = require('./altDetectionRoles');
const { banMember } = require('./altEnforcement');
const { calculateRiskScore } = require('./altDetectionSystem');
const {
    createPendingVerification,
    getVerificationSession,
    markVerificationStatus,
    getVerificationUrl,
} = require('./verifySessions');

const STATE_TTL_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000;
const usedStates = new Set();
const pendingVerifications = new Map();

function required(name) {
    const value = process.env[name];
    if (!value) throw new Error(`[ALT_WEB] environment ${name} belum diatur`);
    return value;
}

function baseUrl() {
    return process.env.VERIFY_BASE_URL || 'https://verify.cantikkulaven.my.id';
}

function sign(value) {
    return crypto.createHmac('sha256', required('HMAC_SECRET')).update(value).digest('base64url');
}

function encodeState(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${sign(body)}`;
}

function decodeState(state) {
    if (typeof state !== 'string') return null;
    const [body, signature] = state.split('.');
    if (!body || !signature) return null;
    const expected = Buffer.from(sign(body));
    const received = Buffer.from(signature);
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.userId || !payload.guildId || !payload.expiresAt || Date.now() > payload.expiresAt) return null;
    return payload;
}

function createVerificationUrl(guildId, userId) {
    return `${baseUrl()}/auth?state=${encodeURIComponent(encodeState({
        guildId,
        userId,
        expiresAt: Date.now() + STATE_TTL_MS,
    }))}`;
}

function hash(value, secretName) {
    return crypto.createHmac('sha256', required(secretName)).update(String(value)).digest('hex');
}

function requestIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (process.env.TRUST_PROXY === '1' && forwarded) return String(forwarded).split(',')[0].trim();
    return req.socket.remoteAddress || '';
}

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[char]));
}

function fingerprintPage(token) {
    return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Verifikasi</title></head><body>
<h1>Verifikasi akun</h1><p>Tekan tombol untuk menyelesaikan verifikasi perangkat.</p>
<button id="verify">Lanjutkan</button><p><a href="/privacy">Kebijakan privasi</a></p>
<script>
const token = ${JSON.stringify(token)};
const button = document.getElementById('verify');
button.addEventListener('click', async () => {
  button.disabled = true;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.textBaseline = 'top';
  context.font = '14px Arial';
  context.fillText('verification', 2, 2);
  const canvasData = canvas.toDataURL();
  const payload = {
    token,
    canvas: canvasData,
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
    platform: navigator.platform,
  };
  const response = await fetch('/auth/submit', {
    method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(payload)
  });
  document.body.innerHTML = await response.text();
});
</script></body></html>`;
}

function resultPage(result) {
    return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Hasil Verifikasi</title></head><body>
<h1>Verifikasi selesai</h1><p>Status audit: <strong>${escapeHtml(result.decision)}</strong></p>
<p>Risk score: <strong>${result.score}
</body></html>`;
}

function cleanup() {
    const now = Date.now();
    for (const [token, item] of pendingVerifications) {
        if (item.expiresAt <= now) pendingVerifications.delete(token);
    }
}

function startAltDetectionWebServer(client) {
    const app = express();
    const host = process.env.WEB_HOST || '127.0.0.1';
    const port = Number(process.env.WEB_PORT || 3000);
    app.use(express.json({ limit: '32kb' }));

    app.get('/', (req, res) => res.send('Alt detection web server aktif'));
    app.get('/privacy', (req, res) => res.type('html').send('<h1>Kebijakan Privasi</h1><p>Sistem memproses identitas Discord, hash IP, hash fingerprint, dan user-agent untuk audit akun alternatif. IP mentah tidak disimpan.</p>'));
    app.get('/verify', (req, res) => {
        const token = String(req.query.token || '');
        const session = getVerificationSession(token);
        if (!session) {
            return res.status(400).type('html').send('<h1>Link verifikasi tidak valid</h1><p>Token sudah kedaluwarsa atau telah dipakai.</p>');
        }

        const statusMessage = `Token valid untuk <strong>${escapeHtml(session.userId)}</strong> di guild <strong>${escapeHtml(session.guildId)}</strong>.`;
        return res.type('html').send(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Verifikasi GO KAIZEN</title></head><body>
            <h1>Verifikasi akun GO KAIZEN</h1>
            <p>${statusMessage}</p>
            <p>Silakan lanjutkan ke proses verifikasi yang disediakan oleh backend IP checker. Link ini berlaku selama 15 menit.</p>
            <p><a href="${escapeHtml(getVerificationUrl(token))}">Buka link verifikasi</a></p>
        </body></html>`);
    });

    app.post('/api/verify/callback', async (req, res) => {
        try {
            const token = String(req.body?.token || '');
            const session = getVerificationSession(token);
            if (!session) {
                return res.status(400).json({ ok: false, error: 'token tidak valid atau kedaluwarsa' });
            }

            const guildId = session.guildId;
            const userId = session.userId;
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) {
                return res.status(404).json({ ok: false, error: 'guild tidak ditemukan' });
            }

            const roleId = process.env.ROLE_GOKAIFRIENDS_ID || require('../config.json').GOKAIFRIENDS_ROLE_ID;
            if (!roleId) {
                return res.status(400).json({ ok: false, error: 'ROLE_GOKAIFRIENDS_ID belum diatur' });
            }

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) {
                return res.status(404).json({ ok: false, error: 'member tidak ditemukan di guild' });
            }

            await member.roles.add(roleId, 'Verifikasi IP/URL berhasil');
            markVerificationStatus(token, 'verified', {
                verifiedAt: Date.now(),
                roleId,
                verifiedBy: 'web-callback',
            });

            try {
                const channelId = process.env.MOD_LOG_CHANNEL_ID || require('../config.json').MOD_LOG_CHANNEL_ID || require('../config.json').LOG_CHANNEL_ID;
                if (channelId) {
                    const channel = await client.channels.fetch(channelId).catch(() => null);
                    if (channel && channel.isTextBased()) {
                        await channel.send({
                            content: `✅ <@${userId}> berhasil diverifikasi via callback.
Role Gokaifriends otomatis ditambahkan.
Token: \`${token.slice(0, 12)}...\``,
                        });
                    }
                }
            } catch (logErr) {
                console.warn('[VERIFY_CALLBACK] gagal kirim log audit:', logErr.message);
            }

            try {
                const user = await client.users.fetch(userId);
                await user.send('🎉 Akunmu berhasil diverifikasi! Role **Gokaifriends** sudah aktif dan seluruh channel server GO KAIZEN kini sudah terbuka.');
            } catch (dmErr) {
                console.warn('[VERIFY_CALLBACK] gagal kirim DM konfirmasi:', dmErr.message);
            }

            return res.json({
                ok: true,
                status: 'verified',
                guildId,
                userId,
                roleId,
            });
        } catch (err) {
            console.error('[VERIFY_CALLBACK] gagal memproses callback:', err);
            return res.status(500).json({ ok: false, error: 'verifikasi gagal diproses' });
        }
    });

    app.get('/auth', (req, res) => {
        try {
            const payload = decodeState(req.query.state);
            if (!payload || usedStates.has(req.query.state)) return res.status(400).send('Link verifikasi tidak valid atau sudah kedaluwarsa.');
            const clientId = required('DISCORD_CLIENT_ID');
            const redirectUri = process.env.DISCORD_REDIRECT_URI || `${baseUrl()}/auth/callback`;
            const params = new URLSearchParams({
                client_id: clientId,
                response_type: 'code',
                redirect_uri: redirectUri,
                scope: 'identify',
                state: req.query.state,
            });
            res.redirect(`https://discord.com/oauth2/authorize?${params}`);
        } catch (err) {
            res.status(500).send('Konfigurasi verifikasi belum lengkap.');
        }
    });

    app.get('/auth/callback', async (req, res) => {
        try {
            const state = String(req.query.state || '');
            const payload = decodeState(state);
            if (!payload || usedStates.has(state)) return res.status(400).send('State tidak valid, sudah dipakai, atau kedaluwarsa.');
            if (!req.query.code) return res.status(400).send('OAuth code tidak ditemukan.');
            usedStates.add(state);

            const redirectUri = process.env.DISCORD_REDIRECT_URI || `${baseUrl()}/auth/callback`;
            const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: required('DISCORD_CLIENT_ID'),
                    client_secret: required('DISCORD_CLIENT_SECRET'),
                    grant_type: 'authorization_code',
                    code: String(req.query.code),
                    redirect_uri: redirectUri,
                }),
            });
            if (!tokenResponse.ok) return res.status(502).send('Gagal menukar OAuth code.');
            const token = await tokenResponse.json();
            const userResponse = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${token.access_token}` } });
            if (!userResponse.ok) return res.status(502).send('Gagal mengambil profil Discord.');
            const user = await userResponse.json();
            if (user.id !== payload.userId) return res.status(403).send('Akun Discord tidak sesuai dengan link verifikasi.');

            const pendingToken = crypto.randomBytes(32).toString('hex');
            const rawIp = requestIp(req);
            if (process.env.ALT_DEBUG_RAW_IP === '1') {
                console.warn(`[ALT_DEBUG] raw verification IP for ${user.id}: ${rawIp}`);
            }

            pendingVerifications.set(pendingToken, {
                guildId: payload.guildId,
                discordId: user.id,
                discordCreatedAt: Number(user.id) ? (Number((BigInt(user.id) >> 22n) + 1420070400000n)) : 0,
                ipHash: hash(rawIp, 'IP_HASH_SECRET'),
                userAgent: String(req.get('user-agent') || '').slice(0, 512),
                expiresAt: Date.now() + PENDING_TTL_MS,
            });
            res.type('html').send(fingerprintPage(pendingToken));
        } catch (err) {
            console.error('[ALT_WEB] callback error:', err.message);
            res.status(500).send('Verifikasi gagal diproses.');
        }
    });

    app.post('/auth/submit', async (req, res) => {
        cleanup();
        const pending = pendingVerifications.get(req.body?.token);
        if (!pending) return res.status(400).send('Sesi verifikasi tidak valid atau sudah kedaluwarsa.');
        pendingVerifications.delete(req.body.token);
        const fingerprintSource = {
            canvas: req.body.canvas,
            userAgent: req.body.userAgent,
            language: req.body.language,
            timezone: req.body.timezone,
            screen: req.body.screen,
            platform: req.body.platform,
        };
        const fingerprintHash = hash(JSON.stringify(fingerprintSource), 'FINGERPRINT_HASH_SECRET');
        const record = D.addVerification({ ...pending, fingerprintHash, status: 'pending' });
        const result = calculateRiskScore(record.guildId, record);
        D.addFlagLog({
            guildId: record.guildId,
            discordId: record.discordId,
            matchedDiscordIds: result.linked.map(item => item.discordId),
            riskScore: result.score,
            outcome: `audit-verification-${result.decision.toLowerCase()}`,
        });
        if (result.decision === 'AUTO-BAN') {
            const guild = await client.guilds.fetch(record.guildId).catch(() => null);
            const member = await guild?.members.fetch(record.discordId).catch(() => null);
            const banResult = await banMember({
                guild,
                member,
                targetId: record.discordId,
                ipHash: record.ipHash,
                action: 'BAN_IP',
                reason: 'AUTO-BAN dari hasil verifikasi ALT',
            });
            if (banResult.ok) {
                D.addBan({
                    guildId: record.guildId,
                    discordId: record.discordId,
                    ipHash: record.ipHash,
                    fingerprintHash: record.fingerprintHash,
                    riskScore: result.score,
                    reason: 'AUTO-BAN dari hasil verifikasi ALT',
                    source: 'verification',
                });
            }
        }
        if (result.decision !== 'AUTO-BAN' && process.env.ALT_VERIFY_GATE === '1' && process.env.ALT_ENFORCEMENT_MODE === 'audit') {
            await markVerified(client, record.guildId, record.discordId).catch(err => {
                console.error('[ALT_WEB] gagal memberi role verified:', err.message);
            });
        }
        res.type('html').send(resultPage(result));
    });

    const server = app.listen(port, host, () => console.log(`[ALT_WEB] aktif di http://${host}:${port}`));
    return { app, server, createVerificationUrl };
}

module.exports = { startAltDetectionWebServer, createVerificationUrl };
