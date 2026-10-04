/**
 * Full Streak System v5.3 (SQLite Edition) - Revisi
 * - Generate banner langsung ke Buffer (tidak menulis file)
 * - safeLoadImage untuk fallback avatar/flame
 * - Tidak lagi menulis/cleanup file sementara
 * - ADMIN_ROLE_ID dicast ke string saat pengecekan
 * - Simpel refactor & perbaikan bug (simpan createdAt)
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const { kirimStreakLog } = require('./streakLogs');

//////////////////// Configuration ////////////////////
const ASSETS_DIR = path.join(__dirname, '../assets');
const DEFAULT_AVATAR = path.join(ASSETS_DIR, 'default-avatar.png');
const FLAME_FALLBACK = path.join(ASSETS_DIR, 'flame-fallback.png');

const { SPECIAL_ROLE_ID, ADMIN_ROLE_ID } = require(path.join(__dirname, '../config.json'));

const STREAK_CHANNEL_ID = '1439483096239177810';
const DB_PATH = path.join(__dirname, '../streakData.db');
const DEAD_STREAK_MS = 1000 * 60 * 60 * 24; // 24 jam sebelum padam
const RESTORE_COOLDOWN_MS = 1000 * 60 * 60 * 24; // 24 jam cooldown restore
const PER_PAGE = 10;
const INTERACTION_COOLDOWN_MS = 5_000; // 5 detik
//////////////////////////////////////////////////////

// Open (or create) DB
const db = new Database(DB_PATH);

// Create table if not exists (tambah createdAt)
db.prepare(`
  CREATE TABLE IF NOT EXISTS streaks (
    key TEXT PRIMARY KEY,
    user1 TEXT,
    user2 TEXT,
    active INTEGER,
    pendingFrom TEXT,
    days INTEGER,
    interactions INTEGER,
    lastUpdate INTEGER,
    lastApiUse INTEGER,
    lastApiDay TEXT,
    lastRestore INTEGER,
    apiPending TEXT,
    createdAt INTEGER
  )
`).run();

// Prepared statements (tambahkan createdAt)
const STMT_GET = db.prepare('SELECT * FROM streaks WHERE key = ?');
const STMT_INSERT_OR_REPLACE = db.prepare(`
  INSERT OR REPLACE INTO streaks
  (key, user1, user2, active, pendingFrom, days, interactions, lastUpdate, lastApiUse, lastApiDay, lastRestore, apiPending, createdAt)
  VALUES (@key, @user1, @user2, @active, @pendingFrom, @days, @interactions, @lastUpdate, @lastApiUse, @lastApiDay, @lastRestore, @apiPending, @createdAt)
`);
const STMT_DELETE = db.prepare('DELETE FROM streaks WHERE key = ?');
const STMT_ALL = db.prepare('SELECT * FROM streaks');

//////////////////// In-memory helpers ////////////////////
const lastInteractionMap = new Map();

//////////////////// Utility helpers ////////////////////
function pairKey(a, b) {
  return [String(a), String(b)].sort().join('-');
}

function streakEmoji(days) {
  if (days >= 200) return '<:api200:1431549305168330772>';
  if (days >= 100) return '<:api100:1431549262520389703>';
  if (days >= 30) return '<:api30:1431549197311807508>';
  if (days >= 10) return '<:api10:1431549094081335406>';
  return '<:api3:1431549052826292315>';
}

function apiEmojiWithNumber(days) {
  return `${days} ${streakEmoji(days)}`;
}

function emojiWithNumber(days, interactions = 0) {
  return `${days} ${streakEmoji(days)} (💭${interactions})`;
}

function makePaginationRow(page, totalPages) {
  const prev = new ButtonBuilder()
    .setCustomId('prev')
    .setLabel('◀️ Prev')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === 0);
  const next = new ButtonBuilder()
    .setCustomId('next')
    .setLabel('Next ▶️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages - 1);
  return new ActionRowBuilder().addComponents(prev, next);
}

function since(ts) {
  if (!ts) return 'baru saja';
  const diff = Date.now() - ts;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h <= 0 && m <= 0) return 'baru saja';
  return h > 0 ? `${h} jam ${m} menit lalu` : `${m} menit lalu`;
}

function countdown(ms) {
  if (ms <= 0) return '0 jam 0 menit 0 detik lagi';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h} jam ${m} menit ${s} detik lagi`;
}

// --- WIB helpers (robust) ---
function getTodayWIB(date = new Date()) {
  try {
    const parts = new Date(date).toLocaleString('en-CA', { timeZone: 'Asia/Jakarta' });
    const d = parts.split(',')[0].split(' ')[0];
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  } catch (e) {}
  const utc = date.getTime() + 7 * 3600000;
  const wib = new Date(utc);
  return wib.toISOString().slice(0, 10);
}

function msUntilMidnightWIB() {
  try {
    const nowJakarta = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' });
    const timeMatch = nowJakarta.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (!timeMatch) throw new Error('time parse fail');
    const HH = parseInt(timeMatch[1], 10);
    const MM = parseInt(timeMatch[2], 10);
    const SS = parseInt(timeMatch[3], 10);
    const elapsedMs = (HH * 3600 + MM * 60 + SS) * 1000;
    return 24 * 3600 * 1000 - elapsedMs;
  } catch (e) {
    const now = new Date();
    const current = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const nextMidnight = new Date(current);
    nextMidnight.setDate(current.getDate() + 1);
    nextMidnight.setHours(0, 0, 0, 0);
    return nextMidnight - current;
  }
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    key: row.key,
    users: [String(row.user1), String(row.user2)],
    user1: String(row.user1),
    user2: String(row.user2),
    active: !!row.active,
    pendingFrom: row.pendingFrom ?? null,
    days: typeof row.days === 'number' ? row.days : parseInt(row.days || 0, 10) || 0,
    interactions: typeof row.interactions === 'number' ? row.interactions : parseInt(row.interactions || 0, 10) || 0,
    lastUpdate: row.lastUpdate || 0,
    lastApiUse: row.lastApiUse || 0,
    lastApiDay: row.lastApiDay || '',
    lastRestore: row.lastRestore || 0,
    apiPending: (() => {
      try {
        return Array.isArray(row.apiPending) ? row.apiPending : JSON.parse(row.apiPending || '[]');
      } catch (e) {
        return [];
      }
    })(),
    createdAt: row.createdAt || 0
  };
}

// DB wrappers
function getPair(key) {
  const row = STMT_GET.get(key);
  return normalizeRow(row);
}

function savePair(pairObj) {
  const dbRow = {
    key: pairObj.key,
    user1: pairObj.user1,
    user2: pairObj.user2,
    active: pairObj.active ? 1 : 0,
    pendingFrom: pairObj.pendingFrom ?? null,
    days: pairObj.days ?? 0,
    interactions: pairObj.interactions ?? 0,
    lastUpdate: pairObj.lastUpdate ?? 0,
    lastApiUse: pairObj.lastApiUse ?? 0,
    lastApiDay: pairObj.lastApiDay ?? '',
    lastRestore: pairObj.lastRestore ?? 0,
    apiPending: Array.isArray(pairObj.apiPending) ? JSON.stringify(pairObj.apiPending) : (pairObj.apiPending ?? JSON.stringify([])),
    createdAt: pairObj.createdAt ?? Date.now()
  };
  STMT_INSERT_OR_REPLACE.run(dbRow);
}

function deletePair(key) {
  STMT_DELETE.run(key);
}

function getAllPairs() {
  return STMT_ALL.all().map(normalizeRow).filter(Boolean);
}

//////////////////// Image helpers ////////////////////
async function safeLoadImage(src, fallback = DEFAULT_AVATAR) {
  try {
    return await loadImage(src);
  } catch (e) {
    try {
      return await loadImage(fallback);
    } catch (e2) {
      // terakhir coba buat canvas kosong agar tidak throw
      const c = createCanvas(128, 128);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#444';
      ctx.fillRect(0, 0, 128, 128);
      return c;
    }
  }
}

function getFlameImage(streak) {
  if (streak >= 200) return 'flame5.png';
  if (streak >= 100) return 'flame4.png';
  if (streak >= 30) return 'flame3.png';
  if (streak >= 10) return 'flame2.png';
  return 'flame1.png';
}

/**
 * Generate banner and return Buffer (PNG) — tidak menulis file ke disk
 */
async function generateStreakBannerBuffer({ name1, avatar1, name2, avatar2, streak }) {
  const canvas = createCanvas(800, 300);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, '#0b0b0b');
  gradient.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Flame particles
  const bgFlameFile = getFlameImage(streak);
  const bgFlamePath = path.join(ASSETS_DIR, bgFlameFile);

  const flameParticle = fs.existsSync(bgFlamePath)
    ? await safeLoadImage(bgFlamePath, FLAME_FALLBACK)
    : (fs.existsSync(FLAME_FALLBACK) ? await safeLoadImage(FLAME_FALLBACK) : null);

  const flameCount = Math.min(80, Math.max(0, Math.floor(streak * 3)));

  for (let i = 0; i < flameCount; i++) {
    const size = Math.random() * 45 + 15;
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.globalAlpha = Math.random() * 0.3;

    if (flameParticle && flameParticle.width && flameParticle.height) {
      ctx.drawImage(flameParticle, x, y, size, size);
    } else {
      ctx.fillStyle = '#ff8a00';
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Load avatars (safe)
  const img1 = await safeLoadImage(avatar1, DEFAULT_AVATAR);
  const img2 = await safeLoadImage(avatar2, DEFAULT_AVATAR);

  function drawCircularImage(img, x, y, size) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(img, x, y, size, size);

    ctx.restore();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawCircularImage(img1, 110, 60, 120);
  drawCircularImage(img2, 570, 60, 120);

  // Names
  ctx.font = 'bold 24px Sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(name1, 170, 230);
  ctx.fillText(name2, 630, 230);

  // Main flame center
  const flameFile = getFlameImage(streak);
  const flamePath = path.join(ASSETS_DIR, flameFile);

  if (fs.existsSync(flamePath)) {
    const flame = await safeLoadImage(flamePath, FLAME_FALLBACK);
    const scale = (streak >= 200 ? 1.8 : streak >= 100 ? 1.5 : streak >= 30 ? 1.3 : streak >= 10 ? 1.1 : 1);
    const flameSize = 140 * scale;
    const flameX = canvas.width / 2 - flameSize / 2;
    const flameY = 85 - (flameSize - 120) / 2;

    ctx.save();
    ctx.shadowColor = '#ff5700';
    ctx.shadowBlur = 45 * scale;
    ctx.drawImage(flame, flameX, flameY, flameSize, flameSize);
    ctx.restore();
  }

  // Numeric streak
  ctx.font = 'bold 50px Sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(String(streak), 400, 270);

  // Return PNG buffer
  return canvas.toBuffer('image/png');
}

////////////////////////////////////////////////////
// MAIN HANDLER (export)
////////////////////////////////////////////////////
module.exports = {
  name: 'messageCreate',
  async execute(message) {
    try {
      // ------------------- VALIDASI PESAN -------------------
      if (!message || !message.author) return;          // jika pesan atau author tidak ada
      if (message.author.bot) return;                   // abaikan pesan bot
      if (!message.channel) return;                     // abaikan jika channel null

      // ------------------- AMBIL MENTION PERTAMA -------------------
      const mention = (message.mentions?.users?.first && typeof message.mentions.users.first === 'function')
        ? message.mentions.users.first()
        : null;

      // ------------------- INTERAKSI PAIR AKTIF -------------------
      const allPairs = getAllPairs(); // Ambil semua pair dari database atau cache

      for (const pair of allPairs) {
        if (!pair?.active) continue;                  // Hanya untuk pair aktif (streak aktif)
        if (pair.users.includes(message.author.id)) {
          const partner = pair.users.find(u => u !== message.author.id);

          // Hitung interaksi jika reply ke partner
          if (message.type === 19 && message.reference?.messageId) { // 19 = MessageType.Reply
            const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMsg && repliedMsg.author.id === partner) {
              pair.interactions++;
              savePair(pair);
            }
          }

          // Hitung interaksi jika mention partner
          if (message.content.includes(`<@${partner}>`) || message.content.includes(`<@!${partner}>`)) {
            pair.interactions++;
            savePair(pair);
          }
        }
      }
 
      const args = String(message.content || '').trim().split(/\s+/).filter(Boolean);
      const cmd = (args.shift() || '').toLowerCase();
      const validCmds = ['streak', 'denystreak', 'istreak', 'topstreak', 'topstreaker', 'cstreak', 'totalstreaker', 'streakhelp', 'ipstreak', 'breakstreak', 'resetstreak', 'restorestreak', 'resetstreaker'];
      if (!validCmds.includes(cmd)) return;

        // ---------------- totalstreaker (final stable) ----------------
        if (cmd === 'totalstreaker') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            const pairs = getAllPairs();
            if (!pairs || pairs.length === 0) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setTitle('📂 Total Pemain Streak Aktif')
                            .setDescription('Tidak ada data streak di database saat ini.')
                    ]
                });
            }

            const activeUsers = new Set();

            for (const pair of pairs) {
                if (!pair || !pair.active || pair.pendingFrom != null) continue; // skip pending
                if (!Array.isArray(pair.users)) continue; // jaga-jaga data rusak
                pair.users.forEach(userId => {
                    if (userId) activeUsers.add(userId);
                });
            }

            const totalPlayers = activeUsers.size;

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x00ffcc)
                        .setTitle('🎉 Total Pemain Streak Aktif')
                        .setDescription(`Saat ini ada **${totalPlayers} pemain streak aktif** di server.`)
                        .setFooter({ text: `Dihitung berdasarkan partner aktif di database` })
                        .setTimestamp()
                ]
            });
        }

        // ---------------- berirolestreaker (final stable) ----------------
        if (cmd === 'berirolestreaker') {

            // Pastikan hanya admin yang bisa jalankan
            if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('<:silang:1392059246937505913> Kamu tidak memiliki izin untuk menjalankan command ini (hanya admin).')
                    ]
                });
            }

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            const pairs = getAllPairs();
            if (!pairs || pairs.length === 0) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setTitle('📂 Total Pemain Streak Aktif')
                            .setDescription('Tidak ada data streak di database saat ini.')
                    ]
                });
            }

            const activeUsers = new Set();

            // Ambil semua pengguna aktif
            for (const pair of pairs) {
                if (!pair || !pair.active || pair.pendingFrom != null) continue;
                if (!Array.isArray(pair.users)) continue;
                pair.users.forEach(userId => {
                    if (userId) activeUsers.add(userId);
                });
            }

            if (activeUsers.size === 0) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setDescription('📭 Tidak ada pemain streak aktif saat ini.')
                    ]
                });
            }

            const role = message.guild.roles.cache.get(SPECIAL_ROLE_ID);
            if (!role) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('❌ Role khusus tidak ditemukan.')
                    ]
                });
            }

            const successUsers = [];
            const failureUsers = [];

            // Proses pemberian role secara paralel
            const tasks = Array.from(activeUsers).map(async (userId) => {
                try {
                    const member = await message.guild.members.fetch(userId).catch(() => null);
                    if (!member) return failureUsers.push(userId);

                    // Skip jika sudah punya role
                    if (member.roles.cache.has(role.id)) return;

                    await member.roles.add(role);
                    successUsers.push(member.user.tag);
                } catch (err) {
                    console.error(`Gagal memberikan role ke ${userId}:`, err);
                    failureUsers.push(userId);
                }
            });

            await Promise.all(tasks);

            // Batasi output agar tidak lebih dari 20 user (biar aman di embed)
            const successDisplay = successUsers.slice(0, 20).join('\n') || 'Tidak ada.';
            const more = successUsers.length > 20 ? `\n...dan ${successUsers.length - 20} lainnya.` : '';

            let desc = `✅ **Berhasil memberikan role** kepada **${successUsers.length}** pemain streak aktif:\n${successDisplay}${more}`;
            if (failureUsers.length) {
                desc += `\n\n❌ **Gagal memberikan role** kepada:\n${failureUsers.map(u => `<@${u}>`).join('\n')}`;
            }

            message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x00ffcc)
                        .setTitle('🎉 Hasil Pemberian Role Streaker')
                        .setDescription(desc)
                        .setFooter({ text: 'Dijalankan oleh admin • berirolestreaker' })
                        .setTimestamp()
                ]
            });
        }

        /*// ---------------- rollbackstreak (admin only) ----------------
        if (cmd === 'rollbackstreak') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            // Pastikan dijalankan di server & oleh admin
            if (!message.guild || !message.member) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('❌ Command ini hanya dapat dijalankan di server.')
                    ]
                });
            }

            const adminRoleIdStr = String(ADMIN_ROLE_ID);
            if (!message.member.roles.cache.has(adminRoleIdStr)) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('❌ Kamu tidak punya izin untuk menjalankan command ini (hanya admin).')
                    ]
                });
            }

            // Ambil semua pair dari database
            const pairs = getAllPairs();
            if (!pairs || pairs.length === 0) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setDescription('📂 Tidak ada data streak di database.')
                    ]
                });
            }

            let rolledBack = 0;

            for (const pair of pairs) {
                // Pastikan pair punya lastRestore sebelumnya
                if (pair.lastRestore) {
                    // Kembalikan ke kondisi sebelum restore
                    const oldActive = pair.active;
                    const oldLastUpdate = pair.prevLastUpdate || 0;
                    const oldLastApiUse = pair.prevLastApiUse || 0;
                    const oldLastApiDay = pair.prevLastApiDay || '';

                    pair.active = false; // rollback ke padam
                    pair.lastUpdate = oldLastUpdate;
                    pair.lastApiUse = oldLastApiUse;
                    pair.lastApiDay = oldLastApiDay;

                    // Simpan perubahan
                    savePair(pair);
                    rolledBack++;

                    console.log(`[ROLLBACK] Pair dikembalikan: ${pair.user1} & ${pair.user2} | aktif sebelumnya: ${oldActive}`);
                }
            }

            if (rolledBack === 0) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setTitle('ℹ️ Tidak Ada yang Dikembalikan')
                            .setDescription('✅ Semua pair sudah berada di kondisi semula atau tidak ada log restore sebelumnya.')
                    ]
                });
            }

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x00ff7f)
                        .setTitle('🔄 Rollback Streak Selesai')
                        .setDescription(`✅ Berhasil mengembalikan **${rolledBack} pasangan** ke kondisi sebelum restore.`)
                        .setTimestamp()
                ]
            });
        }*/

        /*// ---------------- deleteduplicate (admin only) ----------------
        if (cmd === 'deleteduplicate') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            // Pastikan command dijalankan di server dan oleh admin
            if (!message.guild || !message.member) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('<:silang:1392059246937505913> Command ini hanya dapat dijalankan di server.')
                    ]
                });
            }

            const adminRoleIdStr = String(ADMIN_ROLE_ID);
            if (!message.member.roles.cache.has(adminRoleIdStr)) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('<:silang:1392059246937505913> Kamu tidak punya izin untuk menjalankan command ini (hanya admin).')
                    ]
                });
            }

            // Ambil semua pair
            const pairs = getAllPairs();
            if (!pairs || pairs.length === 0) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setDescription('📂 Tidak ada data streak di database.')
                    ]
                });
            }

            const seenPairs = new Map(); // key: "user1_user2" (urutkan), value: pair
            let deletedCount = 0;

            for (const pair of pairs) {
                if (!pair || !pair.users || pair.users.length < 2) continue;

                const sortedKey = pair.users.slice().sort().join('_'); // urutkan user ID agar konsisten
                if (seenPairs.has(sortedKey)) {
                    // Ini duplikat → hapus
                    deletePair(pair.key); // hapus dari database
                    deletedCount++;
                    console.log(`[DELETEDUPLICATE] Menghapus duplicate pair: ${pair.users[0]} & ${pair.users[1]}`);
                } else {
                    // Simpan yang pertama ketemu
                    seenPairs.set(sortedKey, pair);
                }
            }

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x00ff7f)
                        .setTitle('🧹 Duplicate Pairs Dihapus')
                        .setDescription(`✅ Selesai memproses database.\n• Total duplikat dihapus: **${deletedCount}**`)
                        .setTimestamp()
                ]
            });
        }*/

        /*// ---------------- topunactive ----------------
        if (cmd === 'topunactive') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            const today = getTodayWIB();

            // Ambil semua pair aktif yang belum nyala hari ini
            let list = getAllPairs()
                .filter(v => v && v.active && v.lastApiDay !== today)
                .map(v => ({
                    users: v.users,
                    days: v.days,
                    interactions: v.interactions || 0
                }))
                .sort((a, b) => {
                    // Prioritas: streak terbesar → interaksi terbesar
                    if (b.days !== a.days) return b.days - a.days;
                    return (b.interactions || 0) - (a.interactions || 0);
                });

            if (!list.length) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setDescription('📭 Tidak ada streak aktif yang belum nyala hari ini.')
                    ]
                });
            }

            let page = 0;
            const totalPages = Math.ceil(list.length / PER_PAGE);

            const makeEmbed = () => {
                const slice = list.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
                return new EmbedBuilder()
                    .setColor(0xffa500)
                    .setTitle('🔥 Top Streak Aktif tapi Belum Nyala Hari Ini')
                    .setDescription(
                        slice.map((v, i) => {
                            return `#${page * PER_PAGE + i + 1} <@${v.users[0]}> & <@${v.users[1]}> • ${emojiWithNumber(v.days, v.interactions)}`;
                        }).join('\n')
                    )
                    .setFooter({ text: `Halaman ${page + 1}/${totalPages}` });
            };

            const msg = await message.reply({
                embeds: [makeEmbed()],
                components: [makePaginationRow(page, totalPages)]
            });

            const collector = msg.createMessageComponentCollector({ time: 120000 });

            collector.on('collect', async (i) => {
                if (i.user.id !== message.author.id) return i.reply({
                    content: '<:silang:1392059246937505913> Tidak bisa mengontrol embed ini.',
                    ephemeral: true
                });

                if (i.customId === 'next' && page < totalPages - 1) page++;
                else if (i.customId === 'prev' && page > 0) page--;

                await i.update({ embeds: [makeEmbed()], components: [makePaginationRow(page, totalPages)] });
            });

            collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
        }*/

        // ---------------- cstreak (v8.1-LITE - Only Active & Today Status) ----------------
        if (cmd === 'cstreak') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            let mention = message.mentions.users.first();
            if (!mention && message.reference) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                    if (repliedMsg && repliedMsg.author.id !== message.author.id) mention = repliedMsg.author;
                } catch (err) {
                    console.error('[REPLY FETCH ERROR - cstreak]', err);
                }
            }

            if (!mention || mention.id === message.author.id) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('⚠️ Tag atau reply partner kamu (bukan diri sendiri) untuk cek streak. Contoh: `cstreak @user`')
                    ]
                });
            }

            const key = pairKey(message.author.id, mention.id);
            const pair = getPair(key);
            if (!pair) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setDescription(`📭 Kamu belum pernah memulai streak dengan ${mention.username}.`)
                    ]
                });
            }

            const today = getTodayWIB();
            const dayDiff = getDayDiffWIB(pair.lastApiDay, today);

            // 🔥 Status hanya dua kondisi
            let statusHariIni;
            if (pair.lastApiDay === today) {
                statusHariIni = '<:centang:1392058573843988520> Streak Nyala 🔥';
            } else {
                statusHariIni = '<:silang:1392059246937505913> Belum Nyala 😴';
            }

            const tanggalAwal = new Date(
                pair.createdAt || pair.lastUpdate || Date.now()
            ).toLocaleDateString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric'
            });

            const emoji = streakEmoji(pair.days);

            // 🖼️ Buat banner
            let bannerBuffer = null;
            try {
                bannerBuffer = await generateStreakBannerBuffer({
                    name1: message.author.username,
                    avatar1: message.author.displayAvatarURL?.({ extension: 'png', size: 256 }) ?? DEFAULT_AVATAR,
                    name2: mention.username,
                    avatar2: mention.displayAvatarURL?.({ extension: 'png', size: 256 }) ?? DEFAULT_AVATAR,
                    streak: pair.days
                });
            } catch (err) {
                console.error('[BANNER ERROR - cstreak]', err);
            }

            const files = bannerBuffer ? [new AttachmentBuilder(bannerBuffer, { name: 'streak-banner.png' })] : [];

            const embed = new EmbedBuilder()
                .setColor(pair.lastApiDay === today ? 0x00b7ff : 0xffa500)
                .setTitle(`${message.author.username} & ${mention.username}`)
                .addFields(
                    { name: 'Status Hari Ini', value: statusHariIni, inline: true },
                    { name: 'Total Streak', value: `${pair.days.toLocaleString()} ${emoji}`, inline: true },
                    { name: 'Total Interaksi', value: `💭 ${pair.interactions?.toLocaleString() ?? 0}`, inline: true },
                    { name: 'Tanggal Awal Streak', value: tanggalAwal, inline: true },
                )
                .setFooter({ text: 'Cek status streak kamu dengan partner (Lite Mode)' })
                .setTimestamp();

            if (bannerBuffer) embed.setImage('attachment://streak-banner.png');

            await message.reply({ embeds: [embed], files });
        }

        // ===== Utility =====
        function getDayDiffWIB(day1, day2) {
            if (!day1 || !day2) return 0;
            try {
                const d1 = new Date(`${day1}T00:00:00+07:00`);
                const d2 = new Date(`${day2}T00:00:00+07:00`);
                return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
            } catch {
                return 0;
            }
        }

        // ---------------- streak (start, v7.7 fixed - always react if not active) ----------------
        if (cmd === 'streak') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            // Ambil target (mention atau reply)
            let mention = message.mentions.users.first();
            if (!mention && message.reference) {
                try {
                    const repliedMsg = await message.fetchReference();
                    if (repliedMsg && repliedMsg.author.id !== message.author.id) {
                        mention = repliedMsg.author;
                    }
                } catch (err) {
                    console.error('[STREAK REPLY ERROR]', err);
                }
            }

            // Validasi mention
            if (message.mentions.users.size > 1 || !mention || mention.id === message.author.id || mention.bot) return;
            if (!message.guild.members.cache.has(mention.id)) return;

            const key = pairKey(message.author.id, mention.id);
            let pair = getPair(key);
            const today = getTodayWIB();

            // ---------------- CASE 1: Belum ada pair → buat baru (pending) ----------------
            if (!pair) {
                pair = {
                    key,
                    user1: message.author.id,
                    user2: mention.id,
                    users: [message.author.id, mention.id],
                    active: false,
                    days: 0,
                    interactions: 0,
                    lastUpdate: 0,
                    lastApiUse: 0,
                    lastApiDay: '',
                    lastRestore: 0,
                    restoreCount: 0,
                    apiPending: [{ user: message.author.id, day: today }],
                    createdAt: Date.now(),
                };
                savePair(pair);

                // 🔥 React api3 saat pertama kali ajak
                try {
                    await message.react('<:api3:1431549052826292315>');
                } catch (err) {
                    console.error('[REACT ERROR - api3]', err);
                }

                return;
            }

            // ---------------- CASE 2: Partner balas → aktifkan streak ----------------
            const pendingUser = pair.apiPending?.[0]?.user;
            const pendingDay = pair.apiPending?.[0]?.day;

            if (!pair.active && pendingUser && pendingUser !== message.author.id && pendingDay === today) {
                pair.active = true;
                pair.days = 1;
                pair.interactions = 1;
                pair.lastUpdate = Date.now();
                pair.lastApiUse = Date.now();
                pair.lastApiDay = today;
                pair.apiPending = [];
                savePair(pair);

                // 🔥 React juga saat partner balas (streak berhasil)
                try {
                    await message.react('<:api3:1431549052826292315>');
                } catch (err) {
                    console.error('[REACT ERROR - partner reply]', err);
                }

                // 🔥 Generate banner untuk log
                let bannerBuffer = null;
                try {
                    bannerBuffer = await generateStreakBannerBuffer({
                        name1: message.author.username,
                        avatar1: message.author.displayAvatarURL({ extension: 'png', size: 256 }) || DEFAULT_AVATAR,
                        name2: mention.username,
                        avatar2: mention.displayAvatarURL({ extension: 'png', size: 256 }) || DEFAULT_AVATAR,
                        streak: 1,
                    });
                } catch (err) {
                    console.error('[BANNER ERROR - auto accept]', err);
                }

                // 🧩 Kirim hanya ke streak logs
                try {
                    await kirimStreakLog(message.client, "new", {
                        user1: message.author,
                        user2: mention,
                        streak: 1,
                        bannerBuffer
                    });
                } catch (logErr) {
                    console.error('[STREAK LOG ERROR - new auto]', logErr);
                }

                // ---------------- Role Handling via ID ----------------
                const ROLE_STREAK = "1433012215736307732"; // Ganti dengan Role ID-mu
                try {
                    const guild = message.guild;
                    const role = guild.roles.cache.get(ROLE_STREAK);
                    if (role) {
                        // User 1
                        const member1 = guild.members.cache.get(message.author.id);
                        if (member1 && !member1.roles.cache.has(role.id)) {
                            await member1.roles.add(role);
                        }

                        // User 2 (mention)
                        const member2 = guild.members.cache.get(mention.id);
                        if (member2 && !member2.roles.cache.has(role.id)) {
                            await member2.roles.add(role);
                        }
                    } else {
                        console.error(`[ROLE ERROR] Role dengan ID "${ROLE_ID}" tidak ditemukan di guild.`);
                    }
                } catch (roleErr) {
                    console.error('[ROLE ERROR]', roleErr);
                }

                return;
            }

            // ---------------- CASE 3: Sudah aktif → tidak kasih reaksi ----------------
            if (pair.active) return;

            // ---------------- CASE 4: Pending sudah dikirim hari ini → tetap kasih react ----------------
            if (!pair.active && pair.apiPending?.length && pair.apiPending[0].day === today) {
                try {
                    await message.react('<:api3:1431549052826292315>');
                } catch (err) {
                    console.error('[REACT ERROR - already pending]', err);
                }
                return;
            }

            // ---------------- CASE 5: Tidak aktif & tidak ada pending (expired / baru) ----------------
            pair.apiPending = [{ user: message.author.id, day: today }];
            savePair(pair);

            // 🔥 React api3 untuk ajakan ulang (expired)
            try {
                await message.react('<:api3:1431549052826292315>');
            } catch (err) {
                console.error('[REACT ERROR - api3 expired]', err);
            }

            return;
        }
        
         // ---------------- resetstreak (Reset Semua Streak Milik Sendiri - 1 Menit Timeout) ----------------
        if (cmd === 'resetstreak') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            const userId = message.author.id;
            const allPairs = getAllPairs();

            // Filter data streak yang melibatkan user ini dan statusnya sedang aktif
            const userActivePairs = allPairs.filter(v => v && v.active && Array.isArray(v.users) && v.users.includes(userId));

            if (!userActivePairs.length) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setDescription('📭 Kamu tidak memiliki streak aktif dengan siapa pun saat ini. Tidak ada yang perlu di-reset.')
                    ]
                });
            }

            // Membuat tombol konfirmasi menggunakan ButtonBuilder
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_reset')
                    .setLabel('Ya, Reset Semua')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('cancel_reset')
                    .setLabel('Batal')
                    .setStyle(ButtonStyle.Secondary)
            );

            const warningEmbed = new EmbedBuilder()
                .setColor(0xffcc00)
                .setTitle('⚠️ Konfirmasi Reset Semua Streak')
                .setDescription(
                    `Halo **${message.author.username}**, kamu terdeteksi memiliki **${userActivePairs.length} streak aktif**.\n\n` +
                    `Apakah kamu **yakin seratus persen** ingin memadamkan/menonaktifkan **SEMUA** streak-mu dengan seluruh partner yang ada di list?\n\n` +
                    `*Tindakan ini tidak bisa dibatalkan secara mandiri.*`
                )
                .setFooter({ text: 'Tombol konfirmasi ini akan kedaluwarsa dalam 1 menit.' })
                .setTimestamp();

            const responseMessage = await message.reply({
                embeds: [warningEmbed],
                components: [row]
            });

            // --- HANDLER BUTTON (Menggunakan Collector khusus pesan ini) ---
            try {
                // Menunggu interaksi tombol selama maksimal 1 menit (60000 ms)
                const confirmation = await responseMessage.awaitMessageComponent({
                    filter: i => i.user.id === message.author.id, // Hanya orang yang mengetik cmd yang bisa klik
                    time: 60000 
                });

                // JIKA KLIK BUTTON: YA, RESET SEMUA
                if (confirmation.customId === 'confirm_reset') {
                    let totalReset = 0;

                    for (const pair of userActivePairs) {
                        pair.active = false;
                        pair.apiPending = [];
                        pair.lastUpdate = Date.now();
                        
                        // Cari siapa partner-nya untuk keperluan logging
                        const partnerId = pair.users.find(u => u !== userId);
                        
                        savePair(pair);
                        totalReset++;

                        // Kirim log individual ke channel log server
                        try {
                            const partnerUser = await message.client.users.fetch(partnerId).catch(() => null);
                            if (partnerUser) {
                                await kirimStreakLog(message.client, "break", {
                                    user1: message.author,
                                    user2: partnerUser,
                                    streak: pair.days
                                });
                            }
                        } catch (err) {
                            console.error('[STREAK LOG ERROR - reset individual]', err);
                        }
                    }

                    const successEmbed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('💥 Reset Streak Berhasil')
                        .setDescription(`Selesai! **${totalReset} hubungan streak** aktif milikmu telah resmi dipadamkan secara massal.`)
                        .setTimestamp();

                    // Update pesan awal, hilangkan tombolnya agar tidak bisa diklik lagi
                    await confirmation.update({ embeds: [successEmbed], components: [] });

                // JIKA KLIK BUTTON: BATAL
                } else if (confirmation.customId === 'cancel_reset') {
                    const cancelEmbed = new EmbedBuilder()
                        .setColor(0x00ff7f)
                        .setTitle('✅ Reset Dibatalkan')
                        .setDescription('Tindakan dibatalkan. Streak kamu aman dan tetap menyala seperti biasa! 🔥')
                        .setTimestamp();

                    await confirmation.update({ embeds: [cancelEmbed], components: [] });
                }

            } catch (err) {
                // JIKA WAKTU HABIS (TIDAK ADA TOMBOL YANG DIKLIK DALAM 1 MENIT)
                const timeoutEmbed = new EmbedBuilder()
                    .setColor(0xdc3545) // Warna merah peringatan tulisan gelap
                    .setTitle('⏰ Waktu Konfirmasi Habis!')
                    .setDescription(
                        `⚠️ **Proses Dihentikan otomatis!**\n\n` +
                        `Kamu tidak menekan tombol **Ya** atau **Batal** dalam waktu **1 menit**.\n` +
                        `Untuk keamanan data streak kamu, tombol ini sekarang telah dinonaktifkan (hangus).\n\n` +
                        `*Silakan ketik ulang perintah jika kamu benar-benar ingin mereset.*`
                    )
                    .setFooter({ text: 'Sistem Keamanan Auto-Timeout' })
                    .setTimestamp();

                // Edit pesan awal untuk menghapus tombol yang hangus dan memberikan peringatan baru
                await responseMessage.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }

            return;
        }
        
        // ---------------- breakstreak (Mutusin Streak via Tag/Reply/ID) ----------------
        if (cmd === 'breakstreak') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            let mention = message.mentions.users.first();
            
            // 1. Jika tidak ada tag, coba ambil dari reply pesan
            if (!mention && message.reference) {
                try {
                    const repliedMsg = await message.fetchReference();
                    if (repliedMsg && repliedMsg.author.id !== message.author.id) {
                        mention = repliedMsg.author;
                    }
                } catch (err) {
                    console.error('[BREAK STREAK REPLY ERROR]', err);
                }
            }

            // 2. Jika masih tidak ada, coba ambil dari argumen pertama (ID User)
            if (!mention && args[0]) {
                const targetId = args[0].replace(/[^0-9]/g, ''); // Ambil angka saja jaga-jaga kalau formatnya <@ID>
                if (targetId) {
                    try {
                        mention = await message.client.users.fetch(targetId);
                    } catch (err) {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0xff0000)
                                    .setDescription('❌ ID User tidak valid atau pengguna tidak ditemukan.')
                            ]
                        });
                    }
                }
            }

            // Validasi final apakah target ditemukan
            if (!mention) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('⚠️ Tag partner, reply pesannya, atau masukkan ID User untuk memutuskan streak.\nContoh: `breakstreak @user` atau `breakstreak 1234567890`')
                    ]
                });
            }

            if (mention.id === message.author.id) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('⚠️ Kamu tidak bisa memutuskan streak dengan diri sendiri.')
                    ]
                });
            }

            if (mention.bot) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('⚠️ Bot tidak memiliki streak untuk diputuskan.')
                    ]
                });
            }

            const key = pairKey(message.author.id, mention.id);
            const pair = getPair(key);

            // Cek data di database
            if (!pair) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setDescription(`📭 Kamu tidak memiliki histori data streak apa pun dengan **${mention.username}**.`)
                    ]
                });
            }

            // Cek keaktifan streak
            if (!pair.active) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xffa500)
                            .setDescription(`⚠️ Streak kamu dengan **${mention.username}** memang sudah tidak aktif atau padam.`)
                    ]
                });
            }

            // 💔 Proses Pemutusan Streak
            pair.active = false;
            pair.apiPending = []; // Bersihkan antrean pending api hari ini jika ada
            pair.lastUpdate = Date.now();
            savePair(pair);

            // Kirim konfirmasi ke channel chat
            await message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x8b0000)
                        .setTitle('💔 Streak Diputuskan')
                        .setDescription(`Hubungan streak antara <@${message.author.id}> dan <@${mention.id}> resmi **dinonaktifkan**.\nTerakhir mencapai: **${pair.days} Hari** ${streakEmoji(pair.days)}`)
                        .setTimestamp()
                ]
            });

            // 🪵 Kirim ke log channel
            try {
                await kirimStreakLog(message.client, "break", {
                    user1: message.author,
                    user2: mention,
                    streak: pair.days
                });
            } catch (err) {
                console.error('[STREAK LOG ERROR - break]', err);
            }

            return;
        }
        
        // ---------------- resetstreaker (ADMIN ONLY - Reset Semua Streak Target User) ----------------
        if (cmd === 'resetstreaker') {

            // Pastikan hanya admin yang bisa jalankan
            const adminRoleIdStr = String(ADMIN_ROLE_ID);
            if (!message.member.roles.cache.has(adminRoleIdStr)) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('<:silang:1392059246937505913> Kamu tidak memiliki izin untuk menjalankan command ini (hanya admin).')
                    ]
                });
            }

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            let mention = message.mentions.users.first();
            
            // 1. Ambil dari reply pesan jika tidak ada tag
            if (!mention && message.reference) {
                try {
                    const repliedMsg = await message.fetchReference();
                    if (repliedMsg) mention = repliedMsg.author;
                } catch (err) {
                    console.error('[RESETSTREAKER REPLY ERROR]', err);
                }
            }

            // 2. Ambil dari argumen pertama jika berupa ID User
            if (!mention && args[0]) {
                const targetId = args[0].replace(/[^0-9]/g, '');
                if (targetId) {
                    try {
                        mention = await message.client.users.fetch(targetId);
                    } catch (err) {
                        return message.reply({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0xff0000)
                                    .setDescription('❌ ID User tidak valid atau pengguna tidak ditemukan.')
                            ]
                        });
                    }
                }
            }

            // Validasi target ditemukan
            if (!mention) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('⚠️ Tag target, reply pesannya, atau masukkan ID User untuk mereset seluruh streak orang tersebut.\nContoh: `resetstreaker @user` atau `resetstreaker 1234567890`')
                    ]
                });
            }

            const targetUserId = mention.id;
            const allPairs = getAllPairs();

            // Filter data streak AKTIF yang melibatkan target user
            const targetActivePairs = allPairs.filter(v => v && v.active && Array.isArray(v.users) && v.users.includes(targetUserId));

            if (!targetActivePairs.length) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setDescription(`📭 **${mention.username}** tidak memiliki hubungan streak aktif dengan siapa pun saat ini.`)
                    ]
                });
            }

            let totalReset = 0;

            // Eksekusi pemadaman massal oleh Admin
            for (const pair of targetActivePairs) {
                pair.active = false;
                pair.apiPending = [];
                pair.lastUpdate = Date.now();
                
                // Cari siapa partner-nya untuk keperluan logging
                const partnerId = pair.users.find(u => u !== targetUserId);
                
                savePair(pair);
                totalReset++;

                // Kirim log individual ke channel log server
                try {
                    const partnerUser = await message.client.users.fetch(partnerId).catch(() => null);
                    if (partnerUser) {
                        await kirimStreakLog(message.client, "break", {
                            user1: mention, // User yang direset oleh admin
                            user2: partnerUser,
                            streak: pair.days
                        });
                    }
                } catch (err) {
                    console.error('[STREAK LOG ERROR - resetstreaker individual]', err);
                }
            }

            // Kirim embed sukses ke chat
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('💥 Admin Reset Streak Sukses')
                        .setDescription(`🚨 **Admin** telah memadamkan secara paksa **${totalReset} hubungan streak** milik <@${targetUserId}> (${mention.username}).`)
                        .setFooter({ text: `Dijalankan oleh: ${message.author.username}` })
                        .setTimestamp()
                ]
            });
        }
        
        // ---------------- restorestreak (Kuota 2x klik per Pasangan - Max 24 Jam) ----------------
        if (cmd === 'restorestreak') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            let mention = message.mentions.users.first();
            if (!mention && message.reference) {
                try {
                    const repliedMsg = await message.fetchReference();
                    if (repliedMsg && repliedMsg.author.id !== message.author.id) {
                        mention = repliedMsg.author;
                    }
                } catch (err) {
                    console.error('[RESTORESTREAK REPLY ERROR]', err);
                }
            }

            // Coba ambil dari ID jika argumen diinput
            if (!mention && args[0]) {
                const targetId = args[0].replace(/[^0-9]/g, '');
                if (targetId) {
                    mention = await message.client.users.fetch(targetId).catch(() => null);
                }
            }

            if (!mention) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('⚠️ Tag partner, reply pesan, atau masukkan ID User partner untuk me-restore streak.')
                    ]
                });
            }

            const key = pairKey(message.author.id, mention.id);
            const pair = getPair(key);

            if (!pair) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription(`⚠️ Tidak ada histori data streak dengan **${mention.username}**.`)
                    ]
                });
            }

            if (pair.active) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xffd700)
                            .setDescription(`🔥 Streak dengan **${mention.username}** saat ini masih aktif menyala!`)
                    ]
                });
            }

            if (!pair.lastRestoreTime) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('❌ Data rekaman waktu padam streak tidak valid atau tidak ditemukan.')
                    ]
                });
            }

            // ⏱️ Cek apakah sudah lewat 24 jam sejak waktu padam
            const now = Date.now();
            const timeDiffInHours = (now - pair.lastRestoreTime) / (1000 * 60 * 60);

            if (timeDiffInHours >= 24) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x8b0000)
                            .setTitle('💀 Terlambat! Gagal Restore')
                            .setDescription('Streak ini sudah padam lebih dari 24 jam dan hangus total. Data akan segera dibersihkan.')
                    ]
                });
            }

            // Parse list user yang sudah menggunakan hak restore di pair ini
            let restoredByUsers = [];
            try {
                restoredByUsers = typeof pair.restoredBy === 'string' ? JSON.parse(pair.restoredBy) : (pair.restoredBy || []);
            } catch (e) {
                restoredByUsers = [];
            }

            if (!Array.isArray(restoredByUsers)) restoredByUsers = [];

            // Cek jika kamu sudah pernah klik restore di sesi padam kali ini
            if (restoredByUsers.includes(message.author.id)) {
                const partnerId = pair.users.find(u => u !== message.author.id);
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setTitle('🚫 Jatah Kamu Habis')
                            .setDescription(`Kamu sudah memakai jatah restore kamu untuk sesi ini.\n\nMinta partner kamu (<@${partnerId}>) untuk mengetik \`restorestreak\` demi menggunakan sisa jatah kuota miliknya!`)
                    ]
                });
            }

            // Jatah aman -> Tambahkan user ke daftar klik restore
            restoredByUsers.push(message.author.id);
            pair.restoredBy = JSON.stringify(restoredByUsers);

            // 🩹 Eksekusi Restore & aktifkan kembali apinya
            pair.active = true;
            pair.lastApiUse = now;
            pair.lastApiDay = getTodayWIB();
            pair.lastUpdate = now;
            pair.apiPending = [];
            
            savePair(pair);

            // Buat Banner visual log keberhasilan
            let bannerBuffer = null;
            try {
                bannerBuffer = await generateStreakBannerBuffer({
                    name1: message.author.username,
                    avatar1: message.author.displayAvatarURL({ extension: 'png', size: 256 }) || DEFAULT_AVATAR,
                    name2: mention.username,
                    avatar2: mention.displayAvatarURL({ extension: 'png', size: 256 }) || DEFAULT_AVATAR,
                    streak: pair.days
                });
            } catch (err) {
                console.error('[BANNER ERROR - restorestreak]', err);
            }

            const embed = new EmbedBuilder()
                .setColor(0x00ff7f)
                .setTitle('🔥 Streak Berhasil Diselamatkan!')
                .setDescription(
                    `✨ <@${message.author.id}> menggunakan jatah kuotanya untuk memulihkan streak dengan **${mention.username}**!\n\n` +
                    `• Status saat ini: **${pair.days} Hari** ${streakEmoji(pair.days)}\n` +
                    `• Sisa kuota klik restore pasangan ini: **${2 - restoredByUsers.length}x**`
                )
                .setTimestamp();

            if (bannerBuffer) {
                const banner = new AttachmentBuilder(bannerBuffer, { name: 'streak-banner.png' });
                embed.setImage('attachment://streak-banner.png');
                await message.reply({ embeds: [embed], files: [banner] });
            } else {
                await message.reply({ embeds: [embed] });
            }

            // Kirim log ke channel log
            try {
                await kirimStreakLog(message.client, "restore", {
                    user1: message.author,
                    user2: mention,
                    streak: pair.days,
                    bannerBuffer
                });
            } catch (logErr) {
                console.error('[STREAK LOG ERROR - restorestreak]', logErr);
            }
            return;
        }        

        // ---------------- denystreak (v7.5 compatible) ----------------
        if (cmd === 'denystreak') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            // Ambil target (mention atau reply)
            let mention = message.mentions.users.first();
            if (!mention && message.reference) {
                try {
                    const repliedMsg = await message.fetchReference();
                    if (repliedMsg && repliedMsg.author.id !== message.author.id) {
                        mention = repliedMsg.author;
                    }
                } catch (err) {
                    console.error('[DENY STREAK REPLY ERROR]', err);
                }
            }

            // Validasi mention/reply
            if (!mention) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('⚠️ Tag partner atau reply pesannya untuk menolak streak.')
                    ]
                });
            }
            if (mention.id === message.author.id) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('⚠️ Tidak bisa menolak streak sendiri.')
                    ]
                });
            }
            if (mention.bot) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('⚠️ Tidak bisa menolak streak dengan bot.')
                    ]
                });
            }
            if (!message.guild.members.cache.has(mention.id)) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('⚠️ Target tidak valid.')
                    ]
                });
            }

            const key = pairKey(message.author.id, mention.id);
            const pair = getPair(key);

            if (!pair) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setDescription(`📭 Tidak ada permintaan streak dari **${mention.username}**.`)
                    ]
                });
            }

            // Cek apakah pair masih pending (belum aktif)
            if (pair.active) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xffd700)
                            .setDescription(`⚠️ Kamu sudah punya streak aktif dengan **${mention.username}**, tidak bisa menolak.`)
                    ]
                });
            }

            const today = getTodayWIB();
            const pengirimPending = pair.apiPending?.find(p => p.user === mention.id && p.day === today);

            // Jika tidak ada pending dari mention (artinya gak ada ajakan streak)
            if (!pengirimPending) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription(`⚠️ Tidak ada permintaan streak aktif dari **${mention.username}** yang bisa kamu tolak.`)
                    ]
                });
            }

            // Hapus pair dari database
            deletePair(key);

            // Kirim konfirmasi
            await message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('❌ Streak Ditolak')
                        .setDescription(`Kamu menolak ajakan streak dari **${mention.username}**.`)
                ]
            });

            // Kirim ke log channel
            try {
                await kirimStreakLog(message.client, "deny", {
                    user1: message.author,
                    user2: mention
                });
            } catch (err) {
                console.error('[STREAK LOG ERROR - deny]', err);
            }

            return;
        }

        // ---------------- api (streak update) ----------------
        /*if (cmd === 'api') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            // Ambil mention atau reply
            let mentions = message.mentions.users.map(u => u);
            if (!mentions.length && message.reference) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                    if (repliedMsg && repliedMsg.author.id !== message.author.id) mentions.push(repliedMsg.author);
                } catch (err) {
                    console.error('[REPLY FETCH ERROR]', err);
                }
            }

            if (!mentions.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription('⚠️ Tag partner atau reply pesan mereka.')] });
            if (mentions.length > 6) return message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription('⚠️ Maksimal 6 orang saja.')] });
            if (mentions.some(u => u.id === message.author.id)) return message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription('⚠️ Tidak bisa streak dengan diri sendiri.')] });

            for (const mention of mentions) {
                const key = pairKey(message.author.id, mention.id);
                const pair = getPair(key);

                if (!pair || !pair.active) {
                    await message.channel.send({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`❌ Tidak ada streak aktif dengan ${mention.username}.`)] });
                    continue;
                }

                const today = getTodayWIB();
                const lastDay = pair.lastApiDay;
                const dayDiff = getDayDiffWIB(lastDay, today);

                // Padam jika 1 hari penuh terlewat
                if (dayDiff >= 2) {
                    pair.active = false;
                    pair.lastRestore = pair.lastRestore || Date.now();
                    savePair(pair);
                    await message.channel.send({
                        embeds: [new EmbedBuilder().setColor(0x8b0000).setTitle('💀 Streak Padam').setDescription(`Streak kamu dengan ${mention.username} padam karena tidak diperbarui kemarin.`)]
                    });
                    continue;
                }

                // Sudah streak hari ini → tampilkan total api saat ini di description
                if (pair.lastApiDay === today) {
                    const wait = msUntilMidnightWIB();
                    const flameEmoji = apiEmojiWithNumber(pair.days); // emoji menyesuaikan streak
                    await message.channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(0xffa500)
                                .setTitle('⚠️ Sudah Streak Hari Ini')
                                .setDescription(
                                    `Total streak saat ini **${flameEmoji}**\n\n` +
                                    `⌛ Waktu tersisa **${countdown(wait)}**`
                                )
                        ]
                    });
                    continue;
                }

                // Pending check
                pair.apiPending = pair.apiPending || [];
                if (!pair.apiPending.includes(message.author.id)) pair.apiPending.push(message.author.id);

                if (pair.apiPending.length < 2) {
                    savePair(pair);
                    await message.channel.send({ embeds: [new EmbedBuilder().setColor(0xffa500).setDescription(`⌛ Menunggu partner ${mention.username} mengetik api juga.`)] });
                    continue;
                }

                // ✅ Update streak
                pair.days++;
                pair.interactions++;
                pair.lastUpdate = Date.now();
                pair.lastApiUse = Date.now();
                pair.lastApiDay = today;
                pair.apiPending = [];
                savePair(pair);

                // Banner
                let bannerBuffer = null;
                try {
                    bannerBuffer = await generateStreakBannerBuffer({
                        name1: message.author.username,
                        avatar1: message.author.displayAvatarURL({ extension: 'png', size: 256 }) || DEFAULT_AVATAR,
                        name2: mention.username,
                        avatar2: mention.displayAvatarURL({ extension: 'png', size: 256 }) || DEFAULT_AVATAR,
                        streak: pair.days
                    });
                } catch (err) {
                    console.error('[BANNER ERROR - api]', err);
                }

                const embed = new EmbedBuilder()
                    .setColor(0xff4500)
                    .setTitle('🔥 Api Bertambah!')
                    .setDescription(`${message.author.username} & ${mention.username} sekarang punya streak • ${emojiWithNumber(pair.days, pair.interactions)}`)
                    .setTimestamp();

                if (bannerBuffer) {
                    const banner = new AttachmentBuilder(bannerBuffer, { name: 'streak-banner.png' });
                    embed.setImage('attachment://streak-banner.png');
                    await message.channel.send({ embeds: [embed], files: [banner] });
                } else {
                    await message.channel.send({ embeds: [embed] });
                }

                try {
                    const client = message.client;
                    await kirimStreakLog(client, "continue", { user1: message.author, user2: mention, streak: pair.days, bannerBuffer });
                } catch (logErr) {
                    console.error('[STREAK LOG ERROR - api]', logErr);
                }
            }
        }

        // Utility
        function getDayDiffWIB(day1, day2) {
            if (!day1 || !day2) return 0;
            const d1 = new Date(`${day1}T00:00:00+07:00`);
            const d2 = new Date(`${day2}T00:00:00+07:00`);
            return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
        }*/

        /*// ---------------- restoreapi (fixed & safe v7.5) ----------------
        if (cmd === 'restoreapi') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            // Ambil target (mention atau reply)
            let mention = message.mentions.users.first();
            if (!mention && message.reference) {
                try {
                    const repliedMsg = await message.fetchReference();
                    if (repliedMsg && repliedMsg.author.id !== message.author.id) {
                        mention = repliedMsg.author;
                    }
                } catch (err) {
                    console.error('[RESTOREAPI REPLY ERROR]', err);
                }
            }

            // Validasi mention
            if (!mention) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription('⚠️ Tag partner atau reply pesan mereka untuk restore.')
                    ]
                });
            }

            const key = pairKey(message.author.id, mention.id);
            const pair = getPair(key);

            if (!pair) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setDescription(`⚠️ Tidak ada data streak dengan ${mention.username || "pengguna ini"}.`)
                    ]
                });
            }

            if (pair.active) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xffd700)
                            .setDescription(`🔥 Streak dengan ${mention.username} masih aktif.`)
                    ]
                });
            }

            if (!pair.lastApiDay) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x8b0000)
                            .setTitle('💀 Tidak Bisa Restore')
                            .setDescription('Data tanggal terakhir streak tidak ditemukan.')
                    ]
                });
            }

            // ✅ Cek apakah streak sudah padam lebih dari 24 jam
            let lastPadamTime = pair.lastRestore || 0;
            if (!lastPadamTime && pair.lastApiDay && /^\d{4}-\d{2}-\d{2}$/.test(pair.lastApiDay)) {
                lastPadamTime = new Date(`${pair.lastApiDay}T00:00:00+07:00`).getTime();
            } else if (!lastPadamTime && pair.lastUpdate) {
                lastPadamTime = pair.lastUpdate;
            }

            const now = Date.now();
            const timeDiffInHours = (now - lastPadamTime) / (1000 * 60 * 60);

            if (timeDiffInHours > 24) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x8b0000)
                            .setTitle('💀 Streak Tidak Bisa Direstore')
                            .setDescription('Streak sudah padam lebih dari 24 jam dan tidak bisa dipulihkan.')
                    ]
                });
            }

            pair.restoreCount = pair.restoreCount || 0;
            if (pair.restoreCount >= 3) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xff0000)
                            .setTitle('🚫 Batas Restore Tercapai')
                            .setDescription('Sudah mencapai batas maksimal 3x restore.')
                    ]
                });
            }

            // ✅ Restore logic
            pair.active = true;
            pair.pendingFrom = null;
            pair.lastApiUse = Date.now();
            pair.lastApiDay = getTodayWIB();
            pair.lastRestore = Date.now();
            pair.lastUpdate = Date.now();
            pair.restoreCount += 1;
            pair.apiPending = [];
            savePair(pair);

            // 🖼️ Banner (opsional)
            let bannerBuffer = null;
            try {
                bannerBuffer = await generateStreakBannerBuffer({
                    name1: message.author.username,
                    avatar1: message.author.displayAvatarURL({ extension: 'png', size: 256 }) || DEFAULT_AVATAR,
                    name2: mention.username,
                    avatar2: mention.displayAvatarURL({ extension: 'png', size: 256 }) || DEFAULT_AVATAR,
                    streak: pair.days
                });
            } catch (err) {
                console.error('[BANNER ERROR - restoreapi]', err);
            }

            // 🔥 Kirim pesan berhasil
            const embed = new EmbedBuilder()
                .setColor(0x00ff7f)
                .setTitle('🔥 Streak Dipulihkan!')
                .setDescription(
                    `✨ Streak dengan **${mention.username}** berhasil dipulihkan!\n` +
                    `Sekarang **${emojiWithNumber(pair.days)} hari.**\n` +
                    `🩹 Kesempatan restore tersisa: **${3 - pair.restoreCount}x**`
                )
                .setTimestamp();

            if (bannerBuffer) {
                const banner = new AttachmentBuilder(bannerBuffer, { name: 'streak-banner.png' });
                embed.setImage('attachment://streak-banner.png');
                await message.channel.send({ embeds: [embed], files: [banner] });
            } else {
                await message.channel.send({ embeds: [embed] });
            }

            // 🪵 Log restore
            try {
                await kirimStreakLog(message.client, "restore", {
                    user1: message.author,
                    user2: mention,
                    streak: pair.days,
                    bannerBuffer
                });
            } catch (logErr) {
                console.error('[STREAK LOG ERROR - restoreapi]', logErr);
            }
        }

        // ---------------- Helper Function ----------------
        function getDayDiffWIB(date1, date2) {
            try {
                const d1 = new Date(date1);
                const d2 = new Date(date2);
                if (isNaN(d1) || isNaN(d2)) return NaN;
                const diffMs = d2 - d1;
                return Math.floor(diffMs / (1000 * 60 * 60 * 24));
            } catch (err) {
                console.error('[getDayDiffWIB ERROR]', err);
                return NaN;
            }
        }*/

        // ---------------- istreak (v8.7-LITE - Only Active & Today Status) ----------------
        if (cmd === 'istreak') {
            if (message.channel.id === STREAK_CHANNEL_ID) return;

            let targetUser = message.mentions.users.first();
            if (!targetUser && message.reference) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
                    if (repliedMsg) targetUser = repliedMsg.author;
                } catch (err) {
                    console.error('[REPLY FETCH ERROR - istreak]', err);
                }
            }

            const userId = targetUser?.id || message.author.id;
            const today = getTodayWIB();
            const now = Date.now();

            // ✅ Filter: Ambil yang 'active' ATAU yang lagi padam tapi masih dalam masa tenggang 24 jam
            const list = getAllPairs()
                .filter(v => {
                    if (!v || !Array.isArray(v.users) || !v.users.includes(userId)) return false;
                    
                    // Kalau aktif, gas masukkan list
                    if (v.active) return true;
                    
                    // Kalau padam, cek apakah belum lewat 24 jam?
                    if (!v.active && v.lastRestoreTime) {
                        const hoursPassed = (now - v.lastRestoreTime) / (1000 * 60 * 60);
                        return hoursPassed < 24; // Masuk list hanya jika belum hangus total 24 jam
                    }
                    
                    return false;
                })
                .map(v => {
                    const partnerId = v.users.find(u => u !== userId);
                    let status;

                    if (v.active) {
                        if (v.lastApiDay === today) {
                            status = '<:centang:1392058573843988520> Streak Nyala 🔥';
                        } else {
                            status = '<:silang:1392059246937505913> Belum Nyala 😴';
                        }
                    } else {
                        // ⏱️ Hitung sisa waktu restore untuk dipajang di status
                        const hoursPassed = (now - v.lastRestoreTime) / (1000 * 60 * 60);
                        const sisaJam = Math.max(0, 24 - hoursPassed);
                        
                        if (sisaJam > 1) {
                            status = `💀 Padam (Restore: ${Math.floor(sisaJam)}j lagi) 🩹`;
                        } else {
                            status = `💀 Padam (Restore: ${Math.floor(sisaJam * 60)}m lagi) 🩹`;
                        }
                    }

                    return {
                        partner: partnerId,
                        days: v.days || 0,
                        interactions: v.interactions || 0,
                        status
                    };
                })
                // Urutkan: hari terbanyak → interaksi terbanyak
                .sort((a, b) => b.days - a.days || (b.interactions || 0) - (a.interactions || 0));

            if (!list.length) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setDescription(
                                userId === message.author.id
                                    ? '📭 Kamu belum punya streak aktif atau restorable dengan siapa pun.'
                                    : `📭 ${targetUser ? targetUser.username : 'User ini'} belum punya streak aktif atau restorable dengan siapa pun.`
                            )
                    ]
                });
            }

            const PER_PAGE = 10;
            let page = 0;
            const totalPages = Math.ceil(list.length / PER_PAGE);

            const makeEmbed = async () => {
                const slice = list.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
                const lines = await Promise.all(slice.map(async (d, i) => {
                    const partnerUser = (await message.client.users.fetch(d.partner).catch(() => null))?.username || `Unknown#${d.partner}`;
                    return `#${page * PER_PAGE + i + 1} **${partnerUser}** • ${emojiWithNumber(d.days, d.interactions)} • ${d.status}`;
                }));

                return new EmbedBuilder()
                    .setColor(0x00b7ff)
                    .setTitle(`Streak Info — ${targetUser ? targetUser.username : message.author.username}`)
                    .setDescription(lines.join('\n'))
                    .setFooter({ text: `Halaman ${page + 1}/${totalPages} • Total partner: ${list.length}` })
                    .setTimestamp();
            };

            const makePaginationRow = (page, totalPages) =>
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('prev').setLabel('⬅️').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
                    new ButtonBuilder().setCustomId('next').setLabel('➡️').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
                );

            const embed = await makeEmbed();
            const msg = await message.reply({ embeds: [embed], components: [makePaginationRow(page, totalPages)] });

            const collector = msg.createMessageComponentCollector({ time: 120000 });

            collector.on('collect', async i => {
                if (i.user.id !== message.author.id)
                    return i.reply({ content: '❌ Tidak bisa mengontrol embed ini.', ephemeral: true });
                await i.deferUpdate();
                if (i.customId === 'next' && page < totalPages - 1) page++;
                else if (i.customId === 'prev' && page > 0) page--;
                const newEmbed = await makeEmbed();
                await msg.edit({ embeds: [newEmbed], components: [makePaginationRow(page, totalPages)] });
            });

            collector.on('end', async () => {
                try { await msg.edit({ components: [] }); } catch {}
            });
        }

        // ---------------- ipstreak (v7.6 fixed, username only, async-safe) ----------------
        if (cmd === 'ipstreak') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            // Tentukan target: mention / reply / default ke author
            let targetUser = message.mentions.users.first();
            if (!targetUser && message.reference) {
                try {
                    const repliedMsg = await message.fetchReference();
                    if (repliedMsg) targetUser = repliedMsg.author;
                } catch (err) {
                    console.error('[IPSTREAK REPLY ERROR]', err);
                }
            }
            if (!targetUser) targetUser = message.author;

            const userId = targetUser.id;
            const allPairs = getAllPairs();
            const PER_PAGE = 10; // ✅ tampilkan 10 per halaman

            // Ambil semua pair yang pending untuk user ini
            let list = allPairs
                .filter(v =>
                    v &&
                    Array.isArray(v.users) &&
                    v.users.includes(userId) &&
                    !v.active &&
                    Array.isArray(v.apiPending) &&
                    v.apiPending.some(p => v.users.includes(p.user) && p.user !== userId) // pending dari partner
                )
                .map(v => {
                    const partnerId = v.users.find(u => u !== userId);
                    const partnerPending = v.apiPending.find(p => p.user === partnerId);
                    return {
                        partner: partnerId,
                        day: partnerPending?.day || "-",
                        days: v.days || 0,
                        interactions: v.interactions || 0,
                        createdAt: v.createdAt || 0
                    };
                })
                .sort((a, b) => b.createdAt - a.createdAt); // terbaru duluan

            // Jika tidak ada pending sama sekali
            if (!list.length) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setDescription(
                                userId === message.author.id
                                    ? '📭 Tidak ada streak pending yang menunggu kamu saat ini.'
                                    : `${targetUser.username} tidak memiliki streak pending yang menunggu mereka saat ini.`
                            )
                    ]
                });
            }

            let page = 0;
            const totalPages = Math.ceil(list.length / PER_PAGE);

            const makeEmbed = async () => {
                const slice = list.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

                const lines = await Promise.all(slice.map(async (d, i) => {
                    const partnerUser = (await message.client.users.fetch(d.partner).catch(() => null))?.username || `Unknown#${d.partner}`;
                    return `#${page * PER_PAGE + i + 1} **${partnerUser}** • ${emojiWithNumber(d.days, d.interactions)} • ⏳ Pending (${d.day})`;
                }));

                return new EmbedBuilder()
                    .setColor(0xffa500)
                    .setTitle(`📨 Pending Streak — Menunggu ${targetUser.username}`)
                    .setDescription(lines.length > 0 ? lines.join('\n') : '❌ Tidak ada data pending ditemukan.')
                    .setFooter({ text: `Halaman ${page + 1}/${totalPages} • Total pending: ${list.length}` });
            };

            const makePaginationRow = (page, totalPages) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev')
                        .setLabel('⬅️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('➡️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages - 1)
                );
            };

            // ✅ Panggil embed pertama (karena makeEmbed async)
            const embed = await makeEmbed();
            const msg = await message.reply({
                embeds: [embed],
                components: [makePaginationRow(page, totalPages)]
            });

            const collector = msg.createMessageComponentCollector({ time: 120000 });

            collector.on('collect', async i => {
                try {
                    if (i.user.id !== message.author.id) {
                        return i.reply({
                            content: '<:silang:1392059246937505913> Tidak bisa mengontrol embed ini.',
                            ephemeral: true
                        });
                    }

                    await i.deferUpdate();

                    if (i.customId === 'next' && page < totalPages - 1) page++;
                    else if (i.customId === 'prev' && page > 0) page--;

                    const newEmbed = await makeEmbed();
                    await msg.edit({
                        embeds: [newEmbed],
                        components: [makePaginationRow(page, totalPages)]
                    });
                } catch (err) {
                    console.error('[IPSTREAK PAGINATION ERROR]', err);
                }
            });

            collector.on('end', async () => {
                try {
                    await msg.edit({ components: [] });
                } catch (err) {
                    console.error('[IPSTREAK END ERROR]', err);
                }
            });

            return;
        }

        // ---------------- topstreaker (v7.8 no-pagination, top 11 only) ----------------
        if (cmd === 'topstreaker') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            // Hitung jumlah partner per user, hanya pair aktif & tidak pending
            const partnerCount = {};
            for (const pair of getAllPairs()) {
                if (!pair || !pair.active || pair.pendingFrom != null) continue;
                if (!Array.isArray(pair.users)) continue;

                for (const user of pair.users) {
                    if (!user) continue;
                    partnerCount[user] = (partnerCount[user] || 0) + 1;
                }
            }

            const sortedUsers = Object.entries(partnerCount)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 11); // hanya top 11

            if (!sortedUsers.length) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setDescription('📭 Belum ada streak aktif di server.')
                    ]
                });
            }

            // 🔹 Buat embed leaderboard
            const names = await Promise.all(sortedUsers.map(async (v, i) => {
                const user = await message.client.users.fetch(v[0]).catch(() => null);
                const username = user?.username || `Unknown#${v[0]}`;
                return `#${i + 1} **${username}** • **${v[1]} partner**`;
            }));

            const embed = new EmbedBuilder()
                .setColor(0x00ffcc)
                .setTitle('🏆 Top Streaker Leaderboard (Berdasarkan Jumlah Partner)')
                .setDescription(names.join('\n'))
                .setFooter({ text: `Menampilkan 11 streaker teratas • Total aktif: ${sortedUsers.length}` })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
        }

        // ---------------- topstreak (v7.9 SIMPLE - No Pagination, Top 11 Only) ----------------
        if (cmd === 'topstreak') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            // Ambil semua pair aktif
            const all = getAllPairs().filter(v => v && v.active);

            if (!all.length) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x999999)
                            .setDescription('📭 Belum ada streak aktif di server.')
                    ]
                });
            }

            // Urutkan: hari terbanyak → interaksi terbanyak
            all.sort((a, b) => {
                if (b.days !== a.days) return b.days - a.days;
                return (b.interactions || 0) - (a.interactions || 0);
            });

            // Ambil hanya top 11
            const top = all.slice(0, 11);

            const names = await Promise.all(
                top.map(async (v, i) => {
                    // kompatibel dengan model pair lama atau baru
                    const [u1, u2] = v.users || [v.user1, v.user2];

                    const user1 =
                        message.client.users.cache.get(u1) ||
                        await message.client.users.fetch(u1).catch(() => null);

                    const user2 =
                        message.client.users.cache.get(u2) ||
                        await message.client.users.fetch(u2).catch(() => null);

                    const name1 = user1?.username || `Unknown#${u1}`;
                    const name2 = user2?.username || `Unknown#${u2}`;

                    return `#${i + 1} **${name1}** & **${name2}** • ${emojiWithNumber(v.days, v.interactions || 0)}`;
                })
            );

            const embed = new EmbedBuilder()
                .setColor(0xffd700)
                .setTitle('🏆 Top 11 Streak Leaderboard (Aktif)')
                .setDescription(names.join('\n\n'))
                .setFooter({ text: `Total partner aktif: ${all.length}` })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // ---------------- Command: streakhelp (v8.1 - Clean Edition / No Padam Restore) ----------------
        if (cmd === 'streakhelp') {

            if (message.channel.id === STREAK_CHANNEL_ID) return;

            const embed = new EmbedBuilder()
                .setColor(0xff69b4)
                .setTitle('🔥 Streak System Help')
                .setDescription('Panduan lengkap sistem streak di server ini!')
                .addFields(
                    { 
                        name: '📘 Memulai & Mengecek Streak', 
                        value:
                            '`streak @user` — Mulai streak dengan partner.\n' +
                            '`cstreak @user` — Cek status streak dengan partner.\n' +
                            '`istreak [@user]` — Lihat semua streak aktifmu.\n' +
                            '`ipstreak` — Lihat streak pending yang menunggu kamu.\n' +
                            '`denystreak @user` — Tolak ajakan streak yang kamu tidak inginkan.'
                    },
                    { 
                        name: '🔥 Cara Update Streak Harian',
                        value:
                            'Sekarang **tidak perlu lagi mengetik `api`!** 🎉\n\n' +
                            'Cukup **mention atau reply partner streak-mu** di channel biasa:\n' +
                            '➡️ Jika **keduanya saling mention/reply di hari yang sama**, streak 🔥 akan naik!\n' +
                            '➡️ Kalau baru satu orang kirim pesan, sistem akan **menunggu balasan partner**.\n\n' +
                            'Bot otomatis menambahkan **react emoji api** sebagai penanda ajakan atau update streak.'
                    },                  
                    { 
                        name: '🏆 Leaderboard & Statistik', 
                        value:
                            '`topstreak` — Lihat leaderboard streak aktif.\n' +
                            '`totalstreaker` — Lihat total streak per user.' +
                            '`topstreaker` — Lihat leaderboard user dengan banyak partner'
                    },
                    { 
                        name: '🔥 Milestone', 
                        value:
                            '<:api3:1431549052826292315> — 1–9 streak\n' +
                            '<:api10:1431549094081335406> — 10–29 streak\n' +
                            '<:api30:1431549197311807508> — 30–99 streak\n' +
                            '<:api100:1431549262520389703> — 100–199 streak\n' +
                            '<:api200:1431549305168330772> — 200 streak ke atas\n'
                    },
                    { 
                        name: '💡 Tips & Catatan', 
                        value:
                            '• Pastikan hanya mention **1 partner per pesan**.\n' +
                            '• Jangan streak dengan diri sendiri.\n' +
                            '• Bot akan react 🔥 kalau ajakan tersimpan.\n' +
                            '• Kalau bot sedang offline, streak tetap lanjut kalau partner membalas setelah online lagi.\n' +
                            '• Gunakan `denystreak` kalau tidak ingin menerima ajakan streak.'
                    }
                )
                .setFooter({ text: 'Gunakan command ini kapan pun untuk panduan streak 🔥' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            return;
        }

        // ---------------- Fungsi Milestone Emoji ----------------
        function getStreakEmoji(days) {
            if (days >= 200) return '<:api200:1431549305168330772>';
            if (days >= 100) return '<:api100:1431549262520389703>';
            if (days >= 30) return '<:api30:1431549197311807508>';
            if (days >= 10) return '<:api10:1431549094081335406>';
            return '<:api3:1431549052826292315>';
        }       

    } catch (err) {
      console.error('Error in streak handler:', err);
    }
  }
};

async function checkStreakExpirations(client) {
  try {
    const today = getTodayWIB();
    const allPairs = getAllPairs();
    const now = Date.now();

    // Ambil waktu jam 12:00 Siang WIB hari ini
    const todayMidnight = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    todayMidnight.setHours(0, 0, 0, 0); 
    const limitTimeWIB = todayMidnight.getTime();

    for (const pair of allPairs) {
      if (!pair) continue;

      const user1Obj = await client.users.fetch(pair.user1).catch(() => null);
      const user2Obj = await client.users.fetch(pair.user2).catch(() => null);
      if (!user1Obj || !user2Obj) continue;

      // --- KONDISI 1: JIKA STREAK MASIH AKTIF ---
      if (pair.active) {
        // Jika hari ini sudah lewat jam 12:00 Siang WIB DAN mereka belum ketik/update hari ini
        if (now > limitTimeWIB && pair.lastApiDay !== today) {
          pair.active = false; // Ubah jadi padam
          pair.lastRestoreTime = now; // Catat waktu mulai padam untuk hitung mundur 24 jam
          
          // Reset data restore khusus pasangan ini agar bisa di-restore kembali (Masing-masing dijatah 1x klik)
          pair.restoredBy = JSON.stringify([]); 
          
          savePair(pair);

          // Kirim Log Padam
          await kirimStreakLog(client, "burn", {
            user1: user1Obj,
            user2: user2Obj,
            streak: pair.days
          });
        }
      } 
      // --- KONDISI 2: JIKA STREAK SUDAH PADAM (Mencari apakah hangus total > 24 jam) ---
      else if (!pair.active && pair.lastRestoreTime) {
        const hoursPassed = (now - pair.lastRestoreTime) / (1000 * 60 * 60);

        // Jika sudah lebih dari 24 jam semenjak padam dan tidak ada yang restore
        if (hoursPassed >= 24) {
          deletePair(pair.key); // Hapus permanen dari database list

          // Kirim log info ke channel log bahwa data dihapus permanen
          try {
            const channel = await client.channels.fetch(config.streakLogChannelId).catch(() => null);
            if (channel) {
              await channel.send(`💀 **Padam Total:** Streak antara <@${pair.user1}> & <@${pair.user2}> telah melewati batas waktu 24 jam dan **dihapus permanen** dari list database.`);
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    console.error('[CHECK EXPIRED ERROR]', err);
  }
}   

// ================== Ekspor fungsi biar bisa dipakai autostreak.js ==================
module.exports.pairKey = pairKey;
module.exports.getPair = getPair;
module.exports.savePair = savePair;
module.exports.getAllPairs = getAllPairs;
module.exports.getTodayWIB = getTodayWIB;
module.exports.apiEmojiWithNumber = apiEmojiWithNumber;
module.exports.streakEmoji = streakEmoji;
module.exports.generateStreakBannerBuffer = generateStreakBannerBuffer;
