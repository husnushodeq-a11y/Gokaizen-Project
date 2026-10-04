const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

const PREFIX = '.';

module.exports = {
    name: 'messageCreate',

    async execute(message) {
        try {
            if (!message.guild) return;
            if (message.author.bot) return;
            if (!message.content.startsWith(PREFIX)) return;

            const args = message.content.slice(PREFIX.length).trim().split(/ +/);
            const command = args.shift()?.toLowerCase();

            if (command !== 'crhelp') return;

            // 🔐 OPTIONAL ROLE CHECK (kalau mau premium only)
            const hasPermission = config.SPECIAL_ROLE_ID5?.some(roleId =>
                message.member.roles.cache.has(roleId)
            );

            if (!hasPermission) return;

            // 📜 EMBED HELP
            const helpEmbed = new EmbedBuilder()
                .setColor('Gold')
                .setTitle('💎 CRAZY RICH PREMIUM COMMANDS')
                .setDescription('Berikut daftar command eksklusif yang bisa kamu gunakan:')
                .addFields(
                    {
                        name: '.bc (Broadcast)',
                        value: 'Promosikan voice kamu ke semua voice channel aktif.\nSemua user akan melihat voice kamu.',
                    },
                    {
                        name: '.fp (Find Player)',
                        value: 'Cari seseorang sedang berada di voice channel mana.',
                    },
                    {
                        name: '.warp @user',
                        value: 'Pindah ke voice target dengan cara mention user.',
                    },
                    {
                        name: '.froom',
                        value: 'Melihat rekomendasi voice channel yang sedang ramai.',
                    },
                    {
                        name: '🛠️ Coming Soon',
                        value: 'Command lainnya akan segera hadir, stay tuned!',
                    }
                )
                .setFooter({ text: 'CRAZY RICH PREMIUM SYSTEM' })
                .setTimestamp();

            message.reply({ embeds: [helpEmbed] });

        } catch (err) {
            console.error(err);
        }
    }
};