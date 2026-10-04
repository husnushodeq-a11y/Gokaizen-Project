const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");
const TODAY_FILE = path.join(DATA_DIR, "today.json");

function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TODAY_FILE)) {
    fs.writeFileSync(
      TODAY_FILE,
      JSON.stringify({
        date: null,
        users: [],
        page: 0,
        messageId: null,
        color: null
      }, null, 2)
    );
  }
}

function loadData() {
  init();
  return JSON.parse(fs.readFileSync(TODAY_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(TODAY_FILE, JSON.stringify(data, null, 2));
}

module.exports = { loadData, saveData };