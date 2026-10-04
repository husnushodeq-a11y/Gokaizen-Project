const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📋 Daftar server tempat bot ini bergabung:`);

  client.guilds.cache.forEach(guild => {
    console.log(`- ${guild.name} (ID: ${guild.id})`);
  });
});

const { token } = require('./config.json');
client.login(token);