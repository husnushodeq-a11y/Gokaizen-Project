// utils/premiumRole.js
// Sistem Premium Role berbasis SELECT MENU.
//
// Kenapa select menu, bukan reaksi:
//  - Select menu adalah interaksi, jadi balasan ephemeral benar-benar bisa dipakai.
//  - Tidak ada state reaksi yang perlu disinkronkan, sehingga masalah role dobel
//    dan reaksi yang terasa lambat hilang dengan sendirinya.
//  - Discord langsung menampilkan tanda memuat saat diklik, jadi terasa instan.
//
// Dipakai oleh:
//   events/premiumRoleCommand.js  -> handleCommand
//   events/premiumRoleSelect.js   -> handleInteraction

const {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    PermissionsBitField,
} = require('discord.js');

const dbStore = require('./dbStore');

// ============================================================
//  KONFIGURASI
// ============================================================

const PREFIX = '.';
const COMMAND = 'premiumrole';
const DB_KEY = 'premiumRolePanel';

// customId tetap, jangan diubah setelah panel dipasang.
// Nilai inilah yang membuat panel tetap berfungsi walau bot restart.
const SELECT_ID = 'premium_role_select';
const REMOVE_VALUE = 'premium_role_none';

const PANEL_COLOR = 0x9B59B6;
const COLOR_OK = 0x57F287;
const COLOR_WARN = 0xED4245;

const PLACEHOLDER = 'Pilih role premium kamu';

// Role yang disebut di judul panel
const TITLE_ROLE_ID = '1348517203770740859';

// true  = hanya pemilik TITLE_ROLE_ID yang boleh mengambil role premium
const REQUIRE_TITLE_ROLE = true;

// true  = hanya boleh satu role premium sekaligus
// false = boleh memilih beberapa role
const EXCLUSIVE = true;

// emojiId -> { name, roleId }
const ROLE_MAP = {
    '1529453610814013550': { name: 'noir', roleId: '1458903538720575561' },
    '1529454473951318158': { name: 'lunar', roleId: '1368478522301091921' },
    '1529454487570223255': { name: 'bloom', roleId: '1449989444332421201' },
    '1529454501394780164': { name: 'nebula', roleId: '1445972027100889128' },
    '1529454529228308591': { name: 'astral', roleId: '1418961808613445712' },
    '1529454515500089426': { name: 'void', roleId: '1452483067061993665' },
};

const ALL_PREMIUM_ROLE_IDS = Object.values(ROLE_MAP).map(v => v.roleId);
const ROLE_ID_TO_NAME = Object.fromEntries(Object.values(ROLE_MAP).map(v => [v.roleId, v.name]));

// ============================================================
//  UTILITAS
// ============================================================

// Versi discord.js baru memakai flags. Opsi ephemeral lama masih jalan tapi
// memunculkan peringatan usang di log, jadi dipilih otomatis di sini.
const EPHEMERAL = (MessageFlags && MessageFlags.Ephemeral !== undefined)
    ? { flags: MessageFlags.Ephemeral }
    : { ephemeral: true };

function namaRole(guild, roleId) {
    return guild.roles.cache.get(roleId)?.name || ROLE_ID_TO_NAME[roleId] || roleId;
}

// Bentuk emoji diambil langsung dari server supaya animasi atau tidaknya benar
function emojiUntukOpsi(client, emojiId, fallbackName) {
    const e = client?.emojis?.cache?.get(emojiId);
    if (e) return { id: e.id, name: e.name, animated: Boolean(e.animated) };
    return { id: emojiId, name: fallbackName };
}

function emojiTag(client, emojiId, fallbackName) {
    const e = client?.emojis?.cache?.get(emojiId);
    if (e) return e.toString();
    return `<:${fallbackName}:${emojiId}>`;
}

// ============================================================
//  PANEL
// ============================================================

function isiPanel(client) {
    const baris = Object.entries(ROLE_MAP)
        .map(([emojiId, v]) => `${emojiTag(client, emojiId, v.name)} = <@&${v.roleId}>`)
        .join('\n');

    return `## Premium roles for <@&${TITLE_ROLE_ID}>\n\n${baris}`;
}

function barisSelect(client) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(SELECT_ID)
        .setPlaceholder(PLACEHOLDER)
        .setMinValues(1)
        .setMaxValues(EXCLUSIVE ? 1 : Object.keys(ROLE_MAP).length);

    for (const [emojiId, v] of Object.entries(ROLE_MAP)) {
        menu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(v.name)
                .setValue(v.roleId)
                .setEmoji(emojiUntukOpsi(client, emojiId, v.name))
        );
    }

    menu.addOptions(
        new StringSelectMenuOptionBuilder()
            .setLabel('Lepas role premium')
            .setValue(REMOVE_VALUE)
            .setDescription('Hapus role premium yang sedang dipakai')
    );

    return new ActionRowBuilder().addComponents(menu);
}

function payloadPanel(client) {
    const row = barisSelect(client);

    // Jalur Components V2 kalau versi discord.js mendukungnya
    if (typeof ContainerBuilder === 'function' && typeof TextDisplayBuilder === 'function'
        && MessageFlags && MessageFlags.IsComponentsV2 !== undefined) {
        try {
            const container = new ContainerBuilder();

            if (typeof container.setAccentColor === 'function') {
                container.setAccentColor(PANEL_COLOR);
            }
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(isiPanel(client))
            );

            if (typeof container.addActionRowComponents === 'function') {
                container.addActionRowComponents(row);
                return {
                    components: [container],
                    flags: MessageFlags.IsComponentsV2,
                    allowedMentions: { parse: [] },
                };
            }
        } catch {
            // lanjut ke jalur embed biasa
        }
    }

    // Jalur embed biasa, didukung semua versi
    const baris = Object.entries(ROLE_MAP)
        .map(([emojiId, v]) => `${emojiTag(client, emojiId, v.name)} = <@&${v.roleId}>`)
        .join('\n');

    const embed = new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setDescription(`## Premium roles for <@&${TITLE_ROLE_ID}>\n\n${baris}`);

    return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

// ============================================================
//  DIAGNOSTIK EMOJI
// ============================================================

async function handleCheck(message) {
    const client = message.client;
    let appEmojis = null;
    try {
        appEmojis = await client.application?.emojis?.fetch?.().catch(() => null);
    } catch { /* versi lama belum punya application emoji */ }

    const hasil = Object.entries(ROLE_MAP).map(([emojiId, v]) => {
        const g = client.emojis.cache.get(emojiId);
        const a = appEmojis?.get?.(emojiId) || null;
        return {
            nama: v.name,
            id: emojiId,
            ok: Boolean(g || a),
            sumber: a ? 'Application Emoji' : (g ? `server: ${g.guild?.name || '?'}` : null),
            animated: Boolean((g || a)?.animated),
        };
    });

    const gagal = hasil.filter(h => !h.ok);
    const baris = hasil.map(h => h.ok
        ? `✅ **${h.nama}** — ${h.sumber}${h.animated ? ' (animated)' : ''}`
        : `❌ **${h.nama}** — tidak terbaca (\`${h.id}\`)`
    ).join('\n');

    const embed = new EmbedBuilder()
        .setColor(gagal.length ? COLOR_WARN : COLOR_OK)
        .setTitle('Cek Emoji Premium Role')
        .setDescription(baris);

    if (gagal.length) {
        embed.addFields({
            name: 'Kenapa gagal',
            value:
                'Bot tidak berada di server pemilik emoji tersebut.\n\n' +
                'Undang bot ke server tempat emoji itu berada, lalu jalankan ulang perintah ini.',
        });
    }

    return message.reply({ embeds: [embed] });
}

// ============================================================
//  COMMAND: .premiumrole
// ============================================================

async function handleCommand(message) {
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    if (command !== COMMAND) return;

    // tidak punya izin = diam
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;

    if (args[0]?.toLowerCase() === 'check') return handleCheck(message);

    const me = message.guild.members.me;
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return message.reply({
            embeds: [new EmbedBuilder().setColor(COLOR_WARN)
                .setTitle('❌ Bot Kurang Izin')
                .setDescription('Bot butuh izin **Manage Roles** untuk memberi role.')],
        });
    }

    const terlaluTinggi = ALL_PREMIUM_ROLE_IDS
        .map(id => message.guild.roles.cache.get(id))
        .filter(r => r && r.position >= me.roles.highest.position)
        .map(r => r.name);

    if (terlaluTinggi.length) {
        return message.reply({
            embeds: [new EmbedBuilder().setColor(COLOR_WARN)
                .setTitle('❌ Posisi Role Bot Kurang Tinggi')
                .setDescription(
                    `Role bot harus **di atas** role ini:\n${terlaluTinggi.map(n => `• ${n}`).join('\n')}\n\n` +
                    'Atur di Server Settings, Roles, lalu geser role bot ke atas.'
                )],
        });
    }

    const panel = await message.channel.send(payloadPanel(message.client));

    dbStore.set(DB_KEY, {
        guildId: message.guild.id,
        channelId: panel.channel.id,
        messageId: panel.id,
    });

    console.log(`[PREMIUMROLE] panel dipasang: ${panel.id}`);

    await message.delete().catch(() => null);
}

// ============================================================
//  ANTREAN PER MEMBER
// ============================================================

// Menjaga urutan kalau seorang member menekan menu berkali-kali dengan cepat.
const antrean = new Map();

function enqueue(key, task) {
    const sebelumnya = antrean.get(key) || Promise.resolve();
    const jalan = sebelumnya.catch(() => {}).then(task);
    antrean.set(key, jalan);
    jalan.catch(() => {}).then(() => {
        if (antrean.get(key) === jalan) antrean.delete(key);
    });
    return jalan;
}

// ============================================================
//  INTERAKSI SELECT MENU
// ============================================================

async function handleInteraction(interaction) {
    if (!interaction.isStringSelectMenu?.()) return;
    if (interaction.customId !== SELECT_ID) return;

    try {
        // Dijawab lebih dulu supaya tidak kena batas tiga detik.
        await interaction.deferReply(EPHEMERAL);
    } catch {
        return;
    }

    const key = `${interaction.guildId}:${interaction.user.id}`;

    return enqueue(key, async () => {
        try {
            const guild = interaction.guild;
            if (!guild) return;

            const member = await guild.members
                .fetch({ user: interaction.user.id, force: true })
                .catch(() => null);

            if (!member) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(COLOR_WARN)
                        .setDescription('Data member kamu tidak bisa diambil. Coba lagi sebentar lagi.')],
                });
            }

            if (REQUIRE_TITLE_ROLE && !member.roles.cache.has(TITLE_ROLE_ID)) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(COLOR_WARN)
                        .setDescription(`Role premium ini khusus untuk pemilik role <@&${TITLE_ROLE_ID}>.`)],
                });
            }

            // Pilihan pengguna adalah daftar role yang diinginkan.
            // Memilih opsi lepas berarti daftar kosong.
            const dipilih = interaction.values.filter(v => v !== REMOVE_VALUE);

            const perluTambah = dipilih.filter(id => !member.roles.cache.has(id));
            const perluLepas = ALL_PREMIUM_ROLE_IDS.filter(
                id => member.roles.cache.has(id) && !dipilih.includes(id)
            );

            if (!perluTambah.length && !perluLepas.length) {
                const sekarang = ALL_PREMIUM_ROLE_IDS.filter(id => member.roles.cache.has(id));
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(PANEL_COLOR)
                        .setDescription(
                            sekarang.length
                                ? `Kamu sudah memakai role **${namaRole(guild, sekarang[0])}**.`
                                : 'Kamu belum memakai role premium.'
                        )],
                });
            }

            const perubahan = [];
            const gagal = [];

            // Dilakukan satu per satu memakai endpoint per-role, bukan menimpa
            // seluruh daftar role sekaligus, supaya role dari sistem lain aman.
            for (const id of perluLepas) {
                try {
                    await member.roles.remove(id);
                    perubahan.push(`❌ Remove role **${namaRole(guild, id)}**`);
                } catch (err) {
                    gagal.push(namaRole(guild, id));
                    console.error(`[PREMIUMROLE] gagal lepas ${id}:`, err.message);
                }
            }

            for (const id of perluTambah) {
                try {
                    await member.roles.add(id);
                    perubahan.push(`✅ Add role **${namaRole(guild, id)}**`);
                } catch (err) {
                    gagal.push(namaRole(guild, id));
                    console.error(`[PREMIUMROLE] gagal beri ${id}:`, err.message);
                }
            }

            const embed = new EmbedBuilder()
                .setColor(gagal.length ? COLOR_WARN : COLOR_OK)
                .setDescription(perubahan.join('\n') || 'Tidak ada perubahan.');

            if (gagal.length) {
                embed.addFields({
                    name: 'Gagal diproses',
                    value: `${gagal.join(', ')}\n\nCek posisi role bot dan izin **Manage Roles**.`,
                });
            }

            await interaction.editReply({ embeds: [embed] });

            console.log(`[PREMIUMROLE] ${member.user.tag}: ${perubahan.join(' | ') || 'tanpa perubahan'}`);
        } catch (err) {
            console.error('[PREMIUMROLE] error interaksi:', err);
            interaction.editReply({
                embeds: [new EmbedBuilder().setColor(COLOR_WARN)
                    .setDescription('Terjadi kesalahan saat memproses pilihan kamu.')],
            }).catch(() => null);
        }
    });
}

// Dipertahankan supaya file event reaksi lama tidak menyebabkan error
// kalau belum sempat dihapus. Sistem reaksi sudah tidak dipakai lagi.
const handleReactionAdd = async () => {};
const handleReactionRemove = async () => {};

module.exports = {
    handleCommand,
    handleInteraction,
    handleReactionAdd,
    handleReactionRemove,
};
