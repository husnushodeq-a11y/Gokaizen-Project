const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'db', 'countdb.json');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

function read() {
  if (!fs.existsSync(DB_PATH)) return {};
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8') || '{}');
}

function write(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = {
  get(key) {
    return read()[key];
  },
  set(key, val) {
    const db = read();
    db[key] = val;
    write(db);
  },
  push(key, val) {
    const db = read();
    if (!Array.isArray(db[key])) db[key] = [];
    db[key].push(val);
    write(db);
  }
};
