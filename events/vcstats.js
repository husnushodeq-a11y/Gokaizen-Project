const { EmbedBuilder } = require('discord.js');
const tracker = require('../utils/userVoiceTracker');

const PREFIX = 'go!';

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        try {
            if (!message.guild || message.author.bot) return;
            if (!message.content.toLowerCase().startsWith(PREFIX)) return;

            const args = message.content.slice(PREFIX.length).trim().split(/ +/);
            const command = args.shift()?.toLowerCase();

            if (command !== 'vcstats') return;

            // Target user: mentioned user, provided ID, or message author
            let targetUser = message.author;
            
            if (args[0]) {
                if (message.mentions.users.size > 0) {
                    targetUser = message.mentions.users.first();
                } else {
                    const userId = args[0].replace(/\D/g, '');
                    if (userId) {
                        try {
                            const member = await message.guild.members.fetch(userId);
                            if (member) targetUser = member.user;
                        } catch (e) {
                            return message.reply({
                                embeds: [
                                    new EmbedBuilder()
                                        .setColor('Red')
                                        .setDescription('## User Tidak Ditemukan\nUser yang kamu cari tidak berada di dalam server ini.')
                                ]
                            });
                        }
                    }
                }
            }

            const stats = tracker.getUserStats(targetUser.id);
            const totalDuration = tracker.formatDuration(stats.totalMs);
            const weeklyDuration = tracker.formatDuration(stats.weeklyMs);

            const embed = new EmbedBuilder()
                .setColor('Blue')
                .setAuthor({ name: `Voice Stats: ${targetUser.username}`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
                .setDescription(`Berikut adalah statistik waktu yang dihabiskan **${targetUser.username}** di Voice Channel.`)
                .addFields(
                    { name: 'Total Waktu Keseluruhan', value: `\`${totalDuration}\``, inline: true },
                    { name: 'Waktu Minggu Ini', value: `\`${weeklyDuration}\``, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Gokaizen Voice Tracker' });

            return message.reply({ embeds: [embed] });

        } catch (err) {
            console.error('[VCStats Command Error]', err);
        }
    }
};
