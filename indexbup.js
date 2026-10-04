require('dotenv').config();

console.log('⏳ mulai proses inisialisasi bot...');

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, REST, Routes, EmbedBuilder, Partials } = require('discord.js');
const config = require('./config.json');
const dbStore = require('./utils/dbStore');
const dayjs = require('dayjs');

// === TAMBAHAN ABSEN UPDATER ===
const startAbsenUpdater = require('./events/absenUpdater');

const voiceTracker = require('./utils/voiceTracker');

const { buildTop10VoiceEmbed } = require('./commands/tools/topvoice');
const { buildGBMEmbed, updateGBM, isMusicBot } = require('./gbm');
const { initWargaPoints } = require('./utils/wargaPoints');
const { syncGoKaizenTaglineRole } = require('./utils/taglineRoleSync');
const { enqueueTaglineRoleSync } = require('./utils/taglineRoleQueue');
const { startAltDetectionWebServer } = require('./utils/altDetectionWeb');
const { sendVerificationPrompt } = require('./utils/altJoinVerification');
const { ensureVerificationRoles, markUnverified } = require('./utils/altDetectionRoles');
const { enforceBlacklistedIpJoin } = require('./utils/altEnforcement');
// const { startAutoBerita } = require('./berita');

async function syncTaglineRolesForGuild(guild, client) {
  try {
    const members = await guild.members.fetch().catch(() => null);
    if (!members) return;

    console.log('[TAGLINE_ROLE] guild sync', { guildId: guild.id, totalMembers: members.size });
    for (const member of members.values()) {
      try {
        const result = await syncGoKaizenTaglineRole(member, client);
        if (process.env.DEBUG_TAGLINE_ROLE === '1') {
          console.log('[TAGLINE_ROLE] member result', { guildId: guild.id, memberId: member.id, result });
        }
      } catch (err) {
        console.error('[TAGLINE_ROLE] gagal validasi member saat sync guild-wide:', err.message);
      }
    }
  } catch (err) {
    console.error('[TAGLINE_ROLE] gagal fetch members guild:', err.message);
  }
}

async function syncAllGoKaizenTaglineRoles(client) {
  console.log('[TAGLINE_ROLE] running guild-wide sync...');
  for (const guild of client.guilds.cache.values()) {
    await syncTaglineRolesForGuild(guild, client);
  }
}

require('./deploy-commands');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
		GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates
    ],
    // WAJIB untuk reaction role: reaksi pada pesan lama (yang tidak ada di cache)
    // dikirim Discord dalam bentuk partial. Tanpa ini, event reaksi diabaikan
    // setelah bot restart.
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User
    ]
});

if (process.env.ALT_WEB_DISABLED !== '1') {
  try {
    startAltDetectionWebServer(client);
  } catch (err) {
    console.error('[ALT_WEB] gagal memulai web server:', err.message);
  }
}

client.commands = new Collection();
client.pendingRequests = new Map();

console.log('✅ semua module berhasil di-load.');
console.log('✅ client discord berhasil dibuat.');

// === LOAD COMMANDS ===
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const exported = require(filePath);
            const commands = Array.isArray(exported) ? exported : [exported];

            for (const command of commands) {
                if ('data' in command && 'execute' in command) {
                    client.commands.set(command.data.name, command);
                    console.log(`✅ command berhasil dimuat: ${command.data.name} dari ${file}`);
                } else {
                    console.warn(`[warning] command di ${filePath} tidak punya properti "data" atau "execute".`);
                }
            }
        } catch (err) {
            console.error(`❌ gagal memuat command: ${filePath}`);
            console.error(err);
        }
    }
}

// === DEPLOY COMMANDS ===
const rest = new REST({ version: '10' }).setToken(config.token);
rest.put(Routes.applicationCommands(config.clientId), {
    body: client.commands.map(c => c.data.toJSON())
})
.then(() => console.log('✅ commands berhasil di-deploy'))
.catch(console.error);

// === LOAD EVENTS ===
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
        console.log(`✅ event berhasil dimuat: ${file}`);
    } catch (err) {
        console.error(`❌ gagal memuat event: ${file}`);
        console.error(err);
    }
}

// === HANDLE INTERACTION ===
client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (err) {
            console.error(`❌ error saat eksekusi command ${interaction.commandName}:`, err);
            if (!interaction.replied) {
                await interaction.reply({ content: '❌ terjadi kesalahan saat menjalankan command.', ephemeral: true });
            }
        }
    }

    if (interaction.isButton()) {
        // handler tombol
    }
});

// === ERROR HANDLING GLOBAL ===
process.on('unhandledRejection', err => console.error('❌ unhandled promise rejection:', err));
process.on('uncaughtException', err => console.error('❌ uncaught exception:', err));

// === STATUS MONITOR BOT ===
async function sendStatus(channelId, status) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    let embed;
    if (status === 'online') {
        embed = new EmbedBuilder()
            .setTitle('🟢 Bot Online')
            .setDescription('bot sekarang sudah online')
            .setColor('Green')
            .setTimestamp();
    } else if (status === 'offline') {
        embed = new EmbedBuilder()
            .setTitle('🔴 Bot Offline')
            .setDescription('bot offline / process exit')
            .setColor('Red')
            .setTimestamp();
    } else if (status === 'disconnect') {
        embed = new EmbedBuilder()
            .setTitle('🔴 Bot Disconnect')
            .setDescription('bot disconnect dari shard')
            .setColor('Red')
            .setTimestamp();
    }

    try {
        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error('❌ gagal mengirim status monitor:', err);
    }
}

client.on('voiceStateUpdate', (oldState, newState) => {
  voiceTracker.onVoiceStateUpdate(oldState, newState);

  // Jika member yang berubah voice state-nya adalah bot musik, update GBM list
  const member = newState.member || oldState.member;
  if (member && isMusicBot(member)) {
    setTimeout(() => {
      updateGBM(client);
    }, 1000);
  }
});

client.on('guildMemberAdd', async (member) => {
  if (isMusicBot(member)) {
    updateGBM(client);
  }

  try {
    await enqueueTaglineRoleSync(member, client);
  } catch (err) {
    console.error('[TAGLINE_ROLE] gagal validasi saat member join:', err.message);
  }

  if (process.env.ALT_VERIFY_ON_JOIN === '1' && !member.user.bot) {
    const enforcement = await enforceBlacklistedIpJoin(member).catch(err => {
      console.error('[ALT_ENFORCEMENT] gagal memproses IP join:', err.message);
      return { banned: false };
    });
    if (enforcement.banned) return;
  }

  if (process.env.ALT_VERIFY_ON_JOIN === '1' && !member.user.bot) {
    try {
      if (process.env.ALT_VERIFY_GATE === '1') {
        await markUnverified(member);
      }
    } catch (err) {
      console.error('[ALT_WEB] gagal memberi role unverified:', err.message);
    }

    try {
      await sendVerificationPrompt(member);
    } catch (err) {
      console.error('[ALT_WEB] gagal mengirim instruksi verifikasi:', err.message);
    }
  }
});

client.on('guildMemberRemove', (member) => {
  if (isMusicBot(member)) {
    updateGBM(client);
  }
});

// === SAAT BOT SIAP ===
client.once('ready', async () => {
    console.log(`🟢 bot aktif sebagai ${client.user.tag}`);
    await sendStatus(config.statusChannelId, 'online');

    if (process.env.ALT_VERIFY_GATE === '1') {
      for (const guild of client.guilds.cache.values()) {
        try {
          await ensureVerificationRoles(guild);
          console.log(`[ALT_WEB] role verifikasi siap di guild ${guild.id}`);
        } catch (err) {
          console.error(`[ALT_WEB] gagal menyiapkan role di guild ${guild.id}:`, err.message);
        }
      }
    }

    // === START WARGA POINTS SYSTEM ===
    console.log('Starting warga points...');
    await initWargaPoints(client);

    // === VALIDASI AWAL TAGLINE GOKAIZEN (opsional) ===
    // Guild besar tidak boleh di-scan otomatis setiap startup tanpa opt-in.
    const startupReconcile = process.env.TAGLINE_STARTUP_RECONCILE === '1';
    if (startupReconcile) {
      await syncAllGoKaizenTaglineRoles(client);
    } else {
      console.log('[TAGLINE_ROLE] startup full reconciliation disabled; use repair script when needed');
    }
    const reconcileMs = Number(process.env.TAGLINE_RECONCILE_MS || 0);
    if (reconcileMs > 0) {
      let reconciliationRunning = false;
      console.log('[TAGLINE_ROLE] reconciliation enabled', { intervalMs: reconcileMs });
      setInterval(async () => {
        if (reconciliationRunning) {
          console.log('[TAGLINE_ROLE] reconciliation sebelumnya masih berjalan, skip');
          return;
        }

        reconciliationRunning = true;
        try {
          console.log('[TAGLINE_ROLE] running scheduled reconciliation...');
          await syncAllGoKaizenTaglineRoles(client);
        } catch (err) {
          console.error('[TAGLINE_ROLE] gagal reconciliation guild-wide:', err.message);
        } finally {
          reconciliationRunning = false;
        }
      }, reconcileMs);
    } else {
      console.log('[TAGLINE_ROLE] scheduled full reconciliation disabled; event queue is active');
    }

    // === START ABSEN AUTO UPDATER (1 MENIT) ===
    startAbsenUpdater(client);

    // === LOOP AUTO UPDATE TOPVOICE ===
      // **init voiceTime otomatis**
      const data = dbStore.get('topvoice10from4cat');
      if (data) {
        const guild = await client.guilds.fetch(data.guildId);
        await guild.channels.fetch();
        voiceTracker.init(guild, data.categoryIds);
      }

      // loop update topvoice (6 menit)
      setInterval(async () => {
        const data = dbStore.get('topvoice10from4cat');
        if (!data) return;

        try {
          const guild = await client.guilds.fetch(data.guildId);
          const channel = await guild.channels.fetch(data.channelId);
          let message = await channel.messages.fetch(data.messageId).catch(() => null);

          if (!message) {
            const embedBaru = buildTop10VoiceEmbed(guild, data.categoryIds);
            message = await channel.send({ embeds: [embedBaru] });
            dbStore.set('topvoice10from4cat', {
              guildId: guild.id,
              channelId: channel.id,
              messageId: message.id,
              categoryIds: data.categoryIds
            });

            console.log(`🔄 TOPVOICE: message baru dibuat dan disimpan ke DB (ID: ${message.id})`);
            return;
          }

          const embed = buildTop10VoiceEmbed(guild, data.categoryIds);
          await message.edit({ embeds: [embed] });

          console.log(`🔄 TOPVOICE: embed berhasil diperbarui pada ${new Date().toLocaleTimeString()}`);
        } catch (err) {
          console.error('❌ gagal update TOPVOICE:', err.message);
        }

      }, 10_000);

    // === LOOP AUTO UPDATE GBM ===
    setInterval(async () => {
        await updateGBM(client);
    }, 120_000);

    // startAutoBerita(client);
});

// === EVENT DISCONNECT / OFFLINE ===
client.on('shardDisconnect', () => sendStatus(config.statusChannelId, 'disconnect'));

const sendOffline = async () => {
    await sendStatus(config.statusChannelId, 'offline');
    await new Promise(resolve => setTimeout(resolve, 2000));
};

process.on('exit', sendOffline);
process.on('SIGINT', async () => { await sendOffline(); process.exit(); });
process.on('SIGTERM', async () => { await sendOffline(); process.exit(); });

// === LOGIN ===
client.login(config.token)
.then(() => console.log('🔓 login ke discord berhasil.'))
.catch(err => console.error('❌ gagal login ke discord:', err));