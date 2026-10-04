const db = require('../utils/simpleDb');
const dayjs = require('dayjs');
require('dayjs/locale/id'); // Tambahkan locale Indonesia
dayjs.locale('id');

module.exports = (client) => {
  setInterval(() => {
    const list = db.get('countdowns') || [];
    const now = Date.now();
    const remaining = [];

    for (const item of list) {
      if (now >= item.targetTs) {
        const ch = client.channels.cache.get(item.channelId);
        if (ch) {
          const time = dayjs(item.targetTs).format('dddd, D MMMM YYYY • HH:mm');
          ch.send(`<@${item.remindUserId}> ⏰ Countdown selesai pada **${time}**`);
        }
      } else {
        remaining.push(item);
      }
    }

    db.set('countdowns', remaining);
  }, 60_000); // cek tiap menit
};
