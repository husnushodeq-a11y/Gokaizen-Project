const { EmbedBuilder, ChannelType } = require('discord.js');
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

            if (command !== 'froom') return;

            // 🔐 CEK ROLE (PREMIUM ONLY)
            const hasPermission = config.SPECIAL_ROLE_ID5?.some(roleId =>
                message.member.roles.cache.has(roleId)
            );

            if (!hasPermission) return;

            const mode = args[0]?.toLowerCase();

            // ambil semua voice channel
            let voiceChannels = message.guild.channels.cache
                .filter(c => c.type === ChannelType.GuildVoice)
                .map(vc => ({
                    id: vc.id,
                    name: vc.name,
                    size: vc.members.filter(m => !m.user.bot).size
                }));

            if (!voiceChannels.length) {
                return message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Red')
                            .setTitle('❌ Tidak Ada Voice Channel')
                            .setDescription('Server ini tidak memiliki voice channel.')
                    ]
                });
            }

            // =====================
            // 📌 MODE DEFAULT / TOP
            // =====================
            if (!mode || mode === 'top') {

                const active = voiceChannels
                    .filter(vc => vc.size > 0)
                    .sort((a, b) => b.size - a.size)
                    .slice(0, 5);

                if (!active.length) {
                    return message.channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('Red')
                                .setTitle('❌ Tidak Ada Voice Aktif')
                                .setDescription('Saat ini tidak ada member di voice channel.')
                        ]
                    });
                }

                const list = active
                    .map((vc, i) => `**${i + 1}.** 🎧 <#${vc.id}> — **${vc.size} orang**`)
                    .join('\n');

                const best = active[0];

                return message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Blue')
                            .setTitle('🔥 Rekomendasi Voice Channel')
                            .setDescription(list)
                            .addFields({
                                name: '💡 Disarankan',
                                value: `Join <#${best.id}> (paling ramai)`
                            })
                            .setTimestamp()
                    ]
                });
            }

            // =====================
            // 💤 MODE SEPI
            // =====================
            if (mode === 'sepi') {

                const empty = voiceChannels
                    .filter(vc => vc.size === 0)
                    .slice(0, 5);

                if (!empty.length) {
                    return message.channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('Orange')
                                .setTitle('⚠️ Tidak Ada VC Sepi')
                                .setDescription('Semua voice channel sedang terisi.')
                        ]
                    });
                }

                const list = empty
                    .map((vc, i) => `**${i + 1}.** 🎧 <#${vc.id}> — **kosong**`)
                    .join('\n');

                return message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Yellow')
                            .setTitle('💤 Voice Channel Sepi')
                            .setDescription(list)
                            .setTimestamp()
                    ]
                });
            }

            // =====================
            // 📊 MODE SEMUA
            // =====================
            if (mode === 'all') {

                const sorted = voiceChannels
                    .sort((a, b) => b.size - a.size)
                    .slice(0, 10);

                const list = sorted
                    .map(vc => `🎧 <#${vc.id}> — **${vc.size} orang**`)
                    .join('\n');

                return message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Purple')
                            .setTitle('📊 Semua Voice Channel')
                            .setDescription(list)
                            .setTimestamp()
                    ]
                });
            }

            // =====================
            // ❓ MODE TIDAK VALID
            // =====================
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Grey')
                        .setTitle('📌 Penggunaan Command')
                        .setDescription(
                            'Gunakan mode berikut:\n\n' +
                            '`.froom` → rekomendasi VC ramai\n' +
                            '`.froom sepi` → VC kosong\n' +
                            '`.froom all` → semua VC'
                        )
                ]
            });

        } catch (err) {
            console.error(err);
        }
    }
};