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

            if (command !== 'vctop') return;

            // default type is weekly
            let type = 'weeklyMs';
            let title = 'Top Voice Minggu Ini';

            if (args[0] && args[0].toLowerCase() === 'total') {
                type = 'totalMs';
                title = 'Top Voice Keseluruhan';
            }

            const topUsers = tracker.getTopUsers(10, type);

            if (topUsers.length === 0) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Orange')
                            .setDescription('Belum ada data voice channel untuk ditampilkan.')
                    ]
                });
            }

            const embed = new EmbedBuilder()
                .setColor('Gold')
                .setTitle(`🏆 Leaderboard ${title}`)
                .setDescription('Berikut adalah member yang paling lama nongkrong di Voice Channel:')
                .setTimestamp()
                .setFooter({ text: 'Gokaizen Voice Tracker' });

            let description = '';
            for (let i = 0; i < topUsers.length; i++) {
                const stat = topUsers[i];
                const rank = i + 1;
                let rankEmoji = '🔹';
                if (rank === 1) rankEmoji = '🥇';
                if (rank === 2) rankEmoji = '🥈';
                if (rank === 3) rankEmoji = '🥉';

                const duration = tracker.formatDuration(stat[type]);
                description += `${rankEmoji} **<@${stat.userId}>** - \`${duration}\`\n`;
            }

            embed.setDescription(description);

            return message.reply({ embeds: [embed] });

        } catch (err) {
            console.error('[VCTop Command Error]', err);
        }
    }
};
