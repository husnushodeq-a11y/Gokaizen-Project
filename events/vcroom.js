const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PREFIX = 'go!';

module.exports = {
    name: 'messageCreate',

    async execute(message) {
        try {
            // Abaikan jika bukan di guild atau dari bot
            if (!message.guild) return;
            if (message.author.bot) return;

            // Pastikan pesan diawali dengan prefix
            if (!message.content.toLowerCase().startsWith(PREFIX)) return;

            // Ambil args dan command
            const args = message.content.slice(PREFIX.length).trim().split(/ +/);
            const command = args.shift()?.toLowerCase();

            if (command !== 'vcroom') return;

            // Jika tidak ada argumen (user tidak tag/kasih ID)
            if (!args[0]) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription('## Panduan Penggunaan\nSilakan mention user atau masukkan ID user yang ingin kamu cari voice room-nya.\n\n**Contoh Tag:** `go!vcroom @user`\n**Contoh ID:** `go!vcroom 123456789012345678`')
                    ]
                });
            }

            let member;

            // Cek apakah menggunakan mention atau ID
            if (message.mentions.members.size > 0) {
                member = message.mentions.members.first();
            } else {
                const userId = args[0].replace(/\D/g, '');
                if (!userId) {
                    return message.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription('## ID Tidak Valid\nFormat yang kamu masukkan salah. Pastikan berupa mention atau ID yang valid.')
                        ]
                    });
                }
                // Fetch member berdasarkan ID
                member = await message.guild.members.fetch(userId).catch(() => null);
            }

            // Jika member tidak ditemukan di server
            if (!member) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription('## User Tidak Ditemukan\nUser yang kamu cari tidak berada di dalam server ini.')
                    ]
                });
            }

            const vc = member.voice.channel;

            // Jika member sedang di voice channel
            if (vc) {
                const channelLink = `https://discord.com/channels/${message.guild.id}/${vc.id}`;
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('Join VC')
                            .setStyle(ButtonStyle.Link)
                            .setURL(channelLink)
                    );

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`## Member Ditemukan\n${member} saat ini sedang berada di dalam Voice Channel.\n\n**Channel:** **${vc.name}** (<#${vc.id}>)\n**Member Aktif:** **${vc.members.size}** orang\n**Aktivitas:** ${member.voice.streaming ? 'Streaming / Screen Share' : (member.voice.selfVideo ? 'Open Cam' : 'Sedang Ngobrol')}`)
                    ],
                    components: [row]
                });
            } else {
                // Jika member tidak di voice channel
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`## Tidak Aktif\n${member} tidak sedang berada di dalam voice channel mana pun.`)
                    ]
                });
            }

        } catch (err) {
            console.error('[VCRoom Command Error]', err);
        }
    }
};
