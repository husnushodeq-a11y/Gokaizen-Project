/* -----------------------------------------------------------
🔥 STREAK LOG SYSTEM (Full Streak System v5.3.7 - SQLite Edition)
✨ Gaya natural, chill, dan friendly (kayak contoh Discord feed)
------------------------------------------------------------ */

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const config = require('../config.json');

const STREAK_LOG_CHANNEL_ID = config.streakLogChannelId;

let lastLog = null;

function getFireEmoji(streak) {
  if (streak >= 200) return '<:api200:1431549305168330772>';
  if (streak >= 100) return '<:api100:1431549262520389703>';
  if (streak >= 30) return '<:api30:1431549197311807508>';
  if (streak >= 10) return '<:api10:1431549094081335406>';
  return '<:api3:1431549052826292315>';
}

/**
 * 🧩 Kirim log streak ke channel log
 * @param {Client} client
 * @param {"new"|"continue"|"break"|"burn"|"restore"|"deny"} type
 * @param {{ user1, user2, streak, bannerBuffer }} data
 */
async function kirimStreakLog(client, type, data) {
  try {
    const { user1, user2, streak, bannerBuffer } = data;

    if (!STREAK_LOG_CHANNEL_ID) return;
    const channel = await client.channels.fetch(STREAK_LOG_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const currentLogId = `${user1.id}-${user2.id}-${streak}-${type}`;
    if (currentLogId === lastLog) return;
    lastLog = currentLogId;

    const fire = getFireEmoji(streak || 0);
    const messages = {
      new: [
        `${fire} Mantap, <@${user1.id}> & <@${user2.id}>! Streak kalian resmi dimulai, semangat terus ya!`,
        `${fire} Nice start, <@${user1.id}> & <@${user2.id}>! Streak baru udah mulai nyala!`,
        `${fire} Gas terus <@${user1.id}> & <@${user2.id}>! Streak baru udah aktif hari ini!`,
        `${fire} Keren, <@${user1.id}> & <@${user2.id}> udah mulai streak bareng. Jaga terus momentumnya!`,
        `${fire} Awal yang solid, <@${user1.id}> & <@${user2.id}>! Streak baru resmi dimulai.`,
        `${fire} Selamat <@${user1.id}> & <@${user2.id}>! Streak pertama kalian udah ke-record.`,
        `${fire} <@${user1.id}> & <@${user2.id}>, streak baru dimulai! Semangat terus tiap harinya!`,
        `${fire} <@${user1.id}> & <@${user2.id}> baru aja nyalain api streak baru! Ayo lanjut terus!`,
        `${fire} Streak pertama beres buat <@${user1.id}> & <@${user2.id}>! Awal yang mantap!`,
        `${fire} <@${user1.id}> & <@${user2.id}> mulai bareng lagi! Semoga kali ini bisa melangkah lebih jauh!`,
        `${fire} Akhirnya pecah telor! <@${user1.id}> & <@${user2.id}> resmi memulai perjalanan streak mereka.`,
        `${fire} Ciee yang mulai streak baru, <@${user1.id}> & <@${user2.id}> awas aja kalau besok lupa!`
      ],
      continue: [
        `${fire} Streak **${streak}** kalian sukses dilewati! Pertahankan terus, <@${user1.id}> & <@${user2.id}>!`,
        `${fire} **${streak}** streak tanpa bolong! Keren abis, <@${user1.id}> & <@${user2.id}>!`,
        `${fire} <@${user1.id}> & <@${user2.id}>, udah bareng **${streak}** streak nonstop! Kalian luar biasa!`,
        `${fire} <@${user1.id}> & <@${user2.id}>, streak kalian udah nyampe **${streak}**! Stabil banget asli.`,
        `${fire} **${streak}** streak aktif dan masih berlanjut! Hebat, <@${user1.id}> & <@${user2.id}>!`,
        `${fire} **${streak}** streak kalian mulus terus tanpa hambatan! Lanjutkan, <@${user1.id}> & <@${user2.id}>!`,
        `${fire} <@${user1.id}> & <@${user2.id}>, **${streak}** hari berlalu tapi semangatnya tetep membara!`,
        `${fire} **${streak}** streak aktif! <@${user1.id}> & <@${user2.id}> makin solid tiap harinya!`,
        `${fire} <@${user1.id}> & <@${user2.id}>, kalian udah **${streak}** hari bareng terus! GG banget!`,
        `${fire} **${streak}** streak lewat tanpa jeda! Terus jaga ritmenya, <@${user1.id}> & <@${user2.id}>!`,
        `${fire} **${streak}** hari sukses dijaga kencang. Salut sama kekompakan <@${user1.id}> & <@${user2.id}>!`,
        `${fire} Ngeri! **${streak}** hari berturut-turut dan belum ada tanda-tanda berhenti dari <@${user1.id}> & <@${user2.id}>!`,
        `${fire} Streak **${streak}** aman terkendali! Keep it up, <@${user1.id}> & <@${user2.id}>!`
      ],
      break: [
        `💔 Hubungan streak antara <@${user1.id}> & <@${user2.id}> resmi diputuskan secara sadar pada angka **${streak} hari**.`,
        `💔 Perjalanan panjang berakhir di sini. Streak **${streak} hari** milik <@${user1.id}> & <@${user2.id}> resmi direset total.`,
        `💔 Sayang banget, kerja keras <@${user1.id}> & <@${user2.id}> selama **${streak} hari** hancur begitu saja.`,
        `💔 Game Over! Streak **${streak} hari** antara <@${user1.id}> & <@${user2.id}> resmi pecah.`
      ],
      burn: [
        `💀 **Streak Padam!** <@${user1.id}> & <@${user2.id}> melewatkan batas waktu jam 12.00 WIB. Streak (**${streak} hari**) mereka membeku!`,
        `💀 **Apinya Mati!** <@${user1.id}> & <@${user2.id}> ketiduran atau lupa nih? Streak **${streak} hari** kalian masuk masa kritis!`,
        `💀 **Waduh, Gosong!** Api streak **${streak} hari** milik <@${user1.id}> & <@${user2.id}> padam hari ini karena ga absen.`,
        `💀 **⚠️ Emergency!** Streak **${streak} hari** <@${user1.id}> & <@${user2.id}> padam! Buruan ketik \`restoreapi\` sebelum 24 jam!`
      ],
      restore: [
        `🩹 **Streak Dipulihkan!** <@${user1.id}> & <@${user2.id}> berhasil menyelamatkan streak mereka kembali ke **${streak} hari**! 🔥`,
        `🩹 **Keajaiban Datang!** Streak **${streak} hari** milik <@${user1.id}> & <@${user2.id}> yang padam akhirnya menyala lagi! Gas!`,
        `🩹 **Definisi Kompak!** Berkat kuota ganda, streak **${streak} hari** <@${user1.id}> & <@${user2.id}> sukses di-restore penuh!`,
        `🩹 **Welcome Back!** Api streak **${streak} hari** <@${user1.id}> & <@${user2.id}> resmi diselamatkan dari jurang kematian!`
      ],
      deny: [
        `❌ <@${user1.id}> menolak ajakan streak dari <@${user2.id}>. Duh, yang sabar ya...`,
        `❌ Ajakan streak dari <@${user2.id}> ditolak mentah-mentah sama <@${user1.id}>. Sakit tapi ga berdarah.`,
        `❌ Maaf ya <@${user2.id}>, kayaknya <@${user1.id}> lagi ga mau diajakin streak bareng dulu.`,
        `❌ No! <@${user1.id}> memutuskan untuk tidak menerima undangan streak dari <@${user2.id}>.`
      ]
    };

    const textArray = messages[type] || messages.continue;
    const text = textArray[Math.floor(Math.random() * textArray.length)];

    const embed = new EmbedBuilder()
      .setTimestamp();

    // Set warna tema embed berdasarkan tipe log
    if (type === 'new') embed.setColor(0xff914d);        // Orange Muda
    else if (type === 'continue') embed.setColor(0xff5e00);   // Orange Pekat/Api
    else if (type === 'restore') embed.setColor(0x00ff7f);    // Hijau Terang
    else if (type === 'burn') embed.setColor(0xe67e22);       // Dark Orange/Tembaga
    else embed.setColor(0x8b0000);                            // Merah Tua (Break/Deny)

    const payload = { content: text, embeds: [embed] };

    // Pasang banner jika ada buffer dan tipenya new/continue/restore
    if (bannerBuffer && ['new', 'continue', 'restore'].includes(type)) {
      const banner = new AttachmentBuilder(bannerBuffer, { name: 'streak-log.png' });
      embed.setImage('attachment://streak-log.png');
      payload.files = [banner];
    }

    embed.setFooter({
      text: `🔥 Total Streak: ${streak || 0} Hari`,
      iconURL: 'https://cdn.discordapp.com/attachments/1430806814253121588/1431917518888505364/1750481231750_11zon-1.jpg'
    });

    await channel.send(payload);
  } catch (err) {
    console.error('[STREAK LOG INTERNAL ERROR]', err);
  }
}

module.exports = { kirimStreakLog };
