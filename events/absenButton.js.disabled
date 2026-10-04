const {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { loadData, saveData } = require("../utils/absenData");
const { buildEmbed } = require("../utils/absenEmbed");
const { generateAbsenImage } = require("../utils/absenCanvas");
const config = require("../config.json");

function getTodayWIB() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function loadByDate(date) {
  if (date === getTodayWIB()) return loadData();
  return JSON.parse(
    fs.readFileSync(
      path.join(__dirname, `../data/archive/${date}.json`)
    )
  );
}

function getPageFromEmbed(embed) {
  const match = embed.footer?.text?.match(/Page (\d+)/);
  return match ? parseInt(match[1]) - 1 : 0;
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("absen_")) return;

    // 🔒 ADMIN ONLY
    if (
      !interaction.member ||
      !interaction.member.roles.cache.has(config.ADMIN_ROLE_ID)
    ) {
      return interaction.reply({
        content: "❌ Tombol ini hanya bisa digunakan admin.",
        ephemeral: true
      });
    }

    await interaction.deferUpdate();

    const [action, date] = interaction.customId.split(":");

    let data;
    try {
      data = loadByDate(date);
    } catch {
      return;
    }

    const perPage = config.ABSEN_PER_PAGE;
    const totalPage = Math.max(
      1,
      Math.ceil(data.users.length / perPage)
    );

    let page = getPageFromEmbed(interaction.message.embeds[0]);

    if (action === "absen_prev") page--;
    if (action === "absen_next") page++;

    page = Math.max(0, Math.min(page, totalPage - 1));

    // 🔥 SIMPAN PAGE JIKA TODAY
    if (date === getTodayWIB()) {
      data.page = page;
      saveData(data);
    }

    const startIndex = page * perPage;
    const users = data.users.slice(startIndex, startIndex + perPage);

    const buffer = await generateAbsenImage(
      users,
      path.join(__dirname, "../assets/jam.png"),
      startIndex,
      date
    );

    const attachment = new AttachmentBuilder(buffer, {
      name: "absen.png"
    });

    const components =
      totalPage > 1
        ? [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`absen_prev:${date}`)
                .setLabel("Prev")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
              new ButtonBuilder()
                .setCustomId(`absen_next:${date}`)
                .setLabel("Next")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page + 1 >= totalPage)
            )
          ]
        : [];

    await interaction.editReply({
      embeds: [
        buildEmbed(data, page).setImage("attachment://absen.png")
      ],
      files: [attachment],
      components
    });
  }
};