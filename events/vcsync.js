const { EmbedBuilder } = require('discord.js');
const tracker = require('../utils/userVoiceTracker');
const path = require('path');
const fs = require('fs');

const PREFIX = 'go!';
// 1 point = 5 minutes = 300,000 ms
const POINT_MULTIPLIER = 5 * 60 * 1000;

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        try {
            if (!message.guild || message.author.bot) return;
            if (!message.content.toLowerCase().startsWith(PREFIX)) return;

            const args = message.content.slice(PREFIX.length).trim().split(/ +/);
            const command = args.shift()?.toLowerCase();

            if (command !== 'vcsync') return;

            // Pastikan hanya admin/owner yang bisa jalankan ini
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('❌ Hanya Administrator yang dapat menggunakan perintah ini.');
            }

            const dataPath = path.join(__dirname, '../data/warga_data.json');
            
            if (!fs.existsSync(dataPath)) {
                return message.reply('❌ File data lama (`warga_data.json`) tidak ditemukan.');
            }

            const rawData = fs.readFileSync(dataPath, 'utf8');
            const data = JSON.parse(rawData);

            if (!data || !data.users) {
                return message.reply('❌ Format data lama tidak dikenali.');
            }

            let totalUsersSynced = 0;
            let totalPointsFound = 0;

            const updateStmt = tracker.db.prepare(`
                INSERT INTO voice_stats (userId, totalMs, weeklyMs, lastJoinTimestamp)
                VALUES (?, ?, 0, 0)
                ON CONFLICT(userId) DO UPDATE SET totalMs = totalMs + excluded.totalMs;
            `);

            tracker.db.transaction(() => {
                for (const [userId, userObj] of Object.entries(data.users)) {
                    let yearlySum = 0;
                    if (userObj.yearlyVoice) {
                        for (const val of Object.values(userObj.yearlyVoice)) {
                            yearlySum += Number(val) || 0;
                        }
                    }
                    
                    let monthlySum = 0;
                    if (userObj.monthlyVoice) {
                        for (const val of Object.values(userObj.monthlyVoice)) {
                            monthlySum += Number(val) || 0;
                        }
                    }

                    // Ambil nilai tertinggi dari histori tahunan atau bulanan
                    const userPoints = Math.max(yearlySum, monthlySum);

                    if (userPoints > 0) {
                        const ms = userPoints * POINT_MULTIPLIER;
                        updateStmt.run(userId, ms);
                        totalUsersSynced++;
                        totalPointsFound += userPoints;
                    }
                }
            })();

            const embed = new EmbedBuilder()
                .setColor('Green')
                .setTitle('✅ Sinkronisasi Selesai')
                .setDescription(`Berhasil menyinkronkan data lama (dari fitur Member of the Month) ke dalam Tracker VC terbaru.\n\n**Total Member:** ${totalUsersSynced}\n**Total Poin Dikonversi:** ${totalPointsFound} poin`)
                .setTimestamp();

            return message.reply({ embeds: [embed] });

        } catch (err) {
            console.error('[VCSync Command Error]', err);
            message.reply(`❌ Terjadi kesalahan saat sinkronisasi: ${err.message}`);
        }
    }
};
