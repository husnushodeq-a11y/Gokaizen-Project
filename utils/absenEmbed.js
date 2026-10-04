const { EmbedBuilder } = require("discord.js");
const config = require("../config.json");

const days = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function buildEmbed(data, page) {
  const perPage = config.ABSEN_PER_PAGE;
  const start = page * perPage;
  const slice = data.users.slice(start, start + perPage);

  const desc = slice.length
    ? slice.map((u, i) => `${start + i + 1}. ${u.username} 🕒 ${u.time}`).join("\n")
    : "Belum ada yang hadir.";

  const totalPage = Math.max(1, Math.ceil(data.users.length / perPage));

  const [y, m, d] = data.date.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);

  const title = `List Active Today - ${days[dateObj.getDay()]}, ${d} ${months[m - 1]} ${y}`;

  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .setColor(data.color || 0x2f3136)
    .setFooter({ text: `Total active today: ${data.users.length} People • Page ${page + 1}/${totalPage}` });
}

module.exports = { buildEmbed };