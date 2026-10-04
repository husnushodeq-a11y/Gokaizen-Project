// events/absenMessage.js
const { Events } = require("discord.js");
const { loadData, saveData } = require("../utils/absenData");
const config = require("../config.json");

function getTodayWIB() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
function getTimeWIB() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(11, 16);
}
function randomColor() {
  return Math.floor(Math.random() * 0xffffff);
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author.bot) return;

    const data = loadData();
    const today = getTodayWIB();

    // Reset harian
    if (!data.date || data.date !== today) {
      data.date = today;
      data.users = [];
      data.page = 0;
      data.messageId = null;
      data.color = randomColor();
    }

    // Cegah double absen
    if (data.users.some(u => u.id === message.author.id)) return;

    const perPage = config.ABSEN_PER_PAGE;
    const currentPage = data.page || 0;
    const maxIndexCurrentPage = (currentPage + 1) * perPage;

    // 🔥 AUTO PINDAH PAGE SEKALI SAAT NEMBUS BATAS
    if (data.users.length >= maxIndexCurrentPage) {
      data.page = currentPage + 1;
    }

    data.users.push({
      id: message.author.id,
      username: message.author.username,
      avatarURL: message.author.displayAvatarURL({ extension: "png" }),
      time: getTimeWIB()
    });

    saveData(data);
  }
};