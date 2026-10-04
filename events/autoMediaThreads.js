// events/autoMediaThread.js
const config = require("../config.json");

module.exports = {
  name: "messageCreate",
  async execute(message) {
    try {
      // ignore bot
      if (message.author.bot) return;

      // hanya untuk channel tertentu
      if (!config.MEDIA_CHANNEL_IDS.includes(message.channel.id)) return;

      // ---------- HAPUS PESAN NON-MEDIA ----------
      if (message.attachments.size === 0) {
        // hapus pesan teks biasa
        await message.delete().catch(() => {});
        return; // stop lanjut ke thread/react
      }

      // ---------- REACT DAN THREAD ----------
      // react love ❤️
      await message.react("❤️").catch(() => {});

      // buat thread dari message
      await message.startThread({
        name: `Tulis Komentar Disini...`,
        autoArchiveDuration: 1440, // 24 jam
        reason: "Auto thread media post"
      }).catch(() => {});

    } catch (err) {
      console.error("[AUTO MEDIA THREAD ERROR]", err);
    }
  }
};
