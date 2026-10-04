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

            if (command !== 'fp') return;

            // 🔐 CEK ROLE (kalau gak punya = DIAM)
            const hasPermission = config.SPECIAL_ROLE_ID5?.some(roleId =>
                message.member.roles.cache.has(roleId)
            );

            if (!hasPermission) return; // ❌ NO RESPONSE

            if (!args[0]) {
                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Yellow')
                            .setTitle('📌 Cara Penggunaan')
                            .setDescription('Gunakan mention, ID, atau `random`.')
                            .addFields(
                                { name: 'Contoh', value: '`.fp @user`\n`.fp 123456789`\n`.fp random`' }
                            )
                    ]
                });
            }

            // =====================
            // 🎲 RANDOM MODE
            // =====================
            if (args[0].toLowerCase() === 'random') {

                const voiceMembers = message.guild.members.cache.filter(m =>
                    m.voice.channel && !m.user.bot
                );

                if (!voiceMembers.size) {
                    return message.channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('Red')
                                .setTitle('❌ Tidak Ada User di Voice')
                                .setDescription('Saat ini tidak ada member di voice channel.')
                        ]
                    });
                }

                const randomMember = voiceMembers.random();
                const vc = randomMember.voice.channel;

                return message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Blue')
                            .setTitle('🎲 Random Voice Finder')
                            .setDescription(`${randomMember} sedang berada di:`)
                            .addFields(
                                { name: '🎧 Channel', value: `${vc}` },
                                { name: '👥 Jumlah User', value: `${vc.members.size} orang`, inline: true }
                            )
                            .setThumbnail(randomMember.user.displayAvatarURL({ dynamic: true }))
                            .setTimestamp()
                    ]
                });
            }

            // =====================
            // 🔍 USER MODE
            // =====================
            let member;

            if (message.mentions.members.size > 0) {
                member = message.mentions.members.first();
            } else {
                const userId = args[0].replace(/\D/g, '');
                if (!userId) return;

                member = await message.guild.members.fetch(userId).catch(() => null);
            }

            if (!member) return;

            const vc = member.voice.channel;

            if (vc) {
                return message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Green')
                            .setTitle('🔎 Voice Channel Found')
                            .setDescription(`${member} sedang berada di:`)
                            .addFields(
                                { name: '🎧 Channel', value: `${vc}` },
                                { name: '👥 Jumlah User', value: `${vc.members.size} orang`, inline: true }
                            )
                            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                            .setTimestamp()
                    ]
                });
            } else {
                return message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('Orange')
                            .setTitle('❌ Tidak di Voice Channel')
                            .setDescription(`${member} tidak sedang berada di voice channel mana pun.`)
                            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                            .setTimestamp()
                    ]
                });
            }

        } catch (err) {
            console.error(err);
            // ❌ error juga gak perlu diumumin ke user (biar clean)
        }
    }
};