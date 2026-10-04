const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../data/userVoiceStats.db');

// Ensure data dir exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS voice_stats (
    userId TEXT PRIMARY KEY,
    totalMs INTEGER DEFAULT 0,
    weeklyMs INTEGER DEFAULT 0,
    lastJoinTimestamp INTEGER DEFAULT 0
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

function getCurrentWeekStr() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

function checkWeeklyReset() {
  const currentWeek = getCurrentWeekStr();
  const stmt = db.prepare(`SELECT value FROM system_config WHERE key = 'current_week'`);
  const row = stmt.get();

  if (!row || row.value !== currentWeek) {
    db.prepare(`UPDATE voice_stats SET weeklyMs = 0`).run();
    db.prepare(`INSERT OR REPLACE INTO system_config (key, value) VALUES ('current_week', ?)`).run(currentWeek);
    console.log(`[UserVoiceTracker] Weekly stats reset for week ${currentWeek}`);
  }
}

// Ensure init check
checkWeeklyReset();

module.exports = {
  db,
  
  handleVoiceStateUpdate(oldState, newState) {
    checkWeeklyReset();
    
    if (!newState.member || newState.member.user.bot) return;
    const userId = newState.member.id;
    const now = Date.now();
    
    // User joined a VC
    if (!oldState.channelId && newState.channelId) {
      db.prepare(`INSERT OR IGNORE INTO voice_stats (userId) VALUES (?)`).run(userId);
      db.prepare(`UPDATE voice_stats SET lastJoinTimestamp = ? WHERE userId = ?`).run(now, userId);
    }
    
    // User left a VC
    if (oldState.channelId && !newState.channelId) {
      const stmt = db.prepare(`SELECT lastJoinTimestamp FROM voice_stats WHERE userId = ?`);
      const row = stmt.get(userId);
      
      if (row && row.lastJoinTimestamp > 0) {
        const timeSpent = now - row.lastJoinTimestamp;
        db.prepare(`UPDATE voice_stats SET totalMs = totalMs + ?, weeklyMs = weeklyMs + ?, lastJoinTimestamp = 0 WHERE userId = ?`).run(timeSpent, timeSpent, userId);
      }
    }
  },
  
  getUserStats(userId) {
    const stmt = db.prepare(`SELECT * FROM voice_stats WHERE userId = ?`);
    let row = stmt.get(userId);
    if (!row) {
      db.prepare(`INSERT OR IGNORE INTO voice_stats (userId) VALUES (?)`).run(userId);
      row = { userId, totalMs: 0, weeklyMs: 0, lastJoinTimestamp: 0 };
    }
    
    let pendingMs = 0;
    if (row.lastJoinTimestamp > 0) {
      pendingMs = Date.now() - row.lastJoinTimestamp;
    }
    
    return {
      totalMs: row.totalMs + pendingMs,
      weeklyMs: row.weeklyMs + pendingMs
    };
  },
  
  getTopUsers(limit = 10, type = 'weeklyMs') {
    const rows = db.prepare(`SELECT * FROM voice_stats`).all();
    const now = Date.now();
    
    for (const row of rows) {
      if (row.lastJoinTimestamp > 0) {
        const pendingMs = now - row.lastJoinTimestamp;
        row.totalMs += pendingMs;
        row.weeklyMs += pendingMs;
      }
    }
    
    rows.sort((a, b) => b[type] - a[type]);
    return rows.slice(0, limit).filter(r => r[type] > 0);
  },
  
  formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    if (hours > 0) return `${hours} jam ${minutes} menit`;
    return `${minutes} menit`;
  }
};
