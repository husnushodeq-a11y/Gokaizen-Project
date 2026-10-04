const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../data/database.json');
const backupPath = path.join(__dirname, '../data/database.bak.json');

// pastikan folder data ada
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// buat file jika belum ada
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({}, null, 2));
}

function readDB() {
  try {
    const raw = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('❌ gagal baca database.json:', err);
    return {};
  }
}

function writeDB(data) {
  try {
    const serialized = JSON.stringify(data, null, 2);
    const tempDbPath = `${dbPath}.${process.pid}.tmp`;
    const tempBackupPath = `${backupPath}.${process.pid}.tmp`;

    fs.writeFileSync(tempDbPath, serialized);
    fs.renameSync(tempDbPath, dbPath);
    fs.writeFileSync(tempBackupPath, serialized);
    fs.renameSync(tempBackupPath, backupPath);
  } catch (err) {
    console.error('❌ gagal menulis database:', err);
  }
}

module.exports = {
  get(key) {
    const db = readDB();
    return db[key];
  },
  set(key, value) {
    const db = readDB();
    db[key] = value;
    writeDB(db);
  },
  delete(key) {
    const db = readDB();
    delete db[key];
    writeDB(db);
  },
  all() {
    return readDB();
  }
};
