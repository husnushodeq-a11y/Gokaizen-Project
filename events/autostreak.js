// =======================================
// AUTO STREAK HANDLER v7.5 (Flame Repeat React Support) - NO MESSAGE VERSION
// =======================================

const { Events } = require("discord.js");
const fiturstreak = require("./fiturstreak");
const { kirimStreakLog } = require("./streakLogs");

const {
  pairKey,
  getPair,
  savePair,
  getTodayWIB,
  streakEmoji,
  generateStreakBannerBuffer,
  STREAK_CHANNEL_ID
} = fiturstreak;

module.exports = {
  name: Events.MessageCreate,

  async execute(message) {
    try {
      if (!message || message.author.bot) return;
      if (message.channel.id === STREAK_CHANNEL_ID) return;

      // --- Ambil mention atau reply ---
      let mentions = message.mentions.users.map((u) => u);
      if (!mentions.length && message.reference) {
        try {
          const replied = await message.channel.messages.fetch(message.reference.messageId);
          if (replied && replied.author.id !== message.author.id)
            mentions.push(replied.author);
        } catch {}
      }

      // --- Validasi: hanya 1 target dan bukan diri sendiri ---
      if (mentions.length !== 1) return;
      const partner = mentions[0];
      if (partner.id === message.author.id) return;

      // --- Ambil data streak ---
      const key = pairKey(message.author.id, partner.id);
      const pair = getPair(key);

      // 1) Jika tidak ada data streak, abaikan
      if (!pair) return;

      // 🛑 HADANGAN TOTAL JIKA STREAK SEDANG PADAM/RESTURABLE 🛑
      // Diam saja, jangan beri react api dan jangan kirim pesan apa pun
      if (!pair.active) return; 

      const today = getTodayWIB();

      // 2) Bersihkan pending yang bukan untuk hari ini
      pair.apiPending = pair.apiPending || [];
      pair.apiPending = pair.apiPending.filter(p => p && p.day === today);
      savePair(pair);

      // 3) Jika sudah streak hari ini → skip
      if (pair.lastApiDay === today) return;

      const userKey = message.author.id;
      const partnerKey = partner.id;

      // CEK APAKAH USER SUDAH NGAJAK HARI INI
      const already = pair.apiPending.find(
        (p) => p.user === userKey && p.day === today
      );

      if (already) {
        try {
          const emoji = streakEmoji(pair.days);
          const match = (typeof emoji === 'string') ? emoji.match(/<:.+:(\d+)>/) : null;
          await message.react(match ? match[1] : emoji);
        } catch {}
        return; 
      }

      const partnerPending = pair.apiPending.find(
        (p) => p.user === partnerKey && p.day === today
      );

      // CASE 1: PARTNER SUDAH PENDING → STREAK LANJUT
      if (partnerPending) {
        pair.days = (pair.days || 0) + 10;
        pair.interactions = (pair.interactions || 0) + 1;
        pair.lastUpdate = Date.now();
        pair.lastApiUse = Date.now();
        pair.lastApiDay = today;
        pair.apiPending = [];
        savePair(pair);

        try {
          const emoji = streakEmoji(pair.days);
          const match = (typeof emoji === 'string') ? emoji.match(/<:.+:(\d+)>/) : null;
          await message.react(match ? match[1] : emoji);
        } catch {}

        let bannerBuffer = null;
        try {
          bannerBuffer = await generateStreakBannerBuffer({
            name1: message.author.username,
            avatar1:
              message.author.displayAvatarURL({ extension: "png", size: 256 }) ||
              "https://cdn.discordapp.com/embed/avatars/0.png",
            name2: partner.username,
            avatar2:
              partner.displayAvatarURL({ extension: "png", size: 256 }) ||
              "https://cdn.discordapp.com/embed/avatars/1.png",
            streak: pair.days,
          });
        } catch {}

        try {
          await kirimStreakLog(message.client, "continue", {
            user1: message.author,
            user2: partner,
            streak: pair.days,
            bannerBuffer,
          });
        } catch {}
      }

      // CASE 2: AJAKAN BARU (BELUM DIBALAS)
      else {
        pair.apiPending.push({ user: userKey, day: today });
        savePair(pair);

        try {
          const emoji = streakEmoji(pair.days);
          const match = (typeof emoji === 'string') ? emoji.match(/<:.+:(\d+)>/) : null;
          await message.react(match ? match[1] : emoji);
        } catch {}
      }
    } catch (err) {
      console.error('[AUTO STREAK ERROR]', err);
    }
  },
};

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
