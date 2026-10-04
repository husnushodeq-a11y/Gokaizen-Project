// events/absenArchive.js
const fs = require("fs");
const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { loadData, saveData } = require("../utils/absenData");
const { buildEmbed } = require("../utils/absenEmbed");
const config = require("../config.json");

module.exports = {
  name: "archiveAbsen",
  async execute(client) {
    const data = loadData();
    if (!data.date || !data.users.length) return;

    const channel = client.channels.cache.get(config.ARCHIVE_CHANNEL_ID);
    if (!channel) return;

    const totalPage = Math.max(
      1,
      Math.ceil(data.users.length / config.ABSEN_PER_PAGE)
    );

    const components = totalPage > 1 ? [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`absen_prev:${data.date}`)
          .setLabel("Prev")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`absen_next:${data.date}`)
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary)
      )
    ] : [];

    const msg = await channel.send({
      embeds: [buildEmbed(data, 0)],
      components
    });

    const dir = path.join(__dirname, "../data/archive");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(
      path.join(dir, `${data.date}.json`),
      JSON.stringify({ ...data, messageId: msg.id }, null, 2)
    );

    saveData({ date: null, users: [], page: 0, messageId: null, color: null });
  }
};