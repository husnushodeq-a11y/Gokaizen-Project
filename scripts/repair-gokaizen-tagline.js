#!/usr/bin/env node

const { Client, GatewayIntentBits } = require('discord.js');
const config = require('../config.json');
const { syncGoKaizenTaglineRole, extractServerTag } = require('../utils/taglineRoleSync');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.replace(/^--/, '');
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    args[key] = value;
  }
  return args;
}

function chunkArray(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const guildId = args.guild || process.env.GUILD_ID;
  const userIdsInput = args.userIds || process.env.USER_IDS || '';
  const batchSize = Number(args.batchSize || 25);
  const delayMs = Number(args.delayMs || 750);
  const dryRun = args.dryRun === true || args.dryRun === 'true';

  if (!guildId) {
    console.error('Usage: node scripts/repair-gokaizen-tagline.js --guild <guildId> --userIds <comma-separated-user-ids> [--batchSize 25] [--delayMs 750] [--dryRun]');
    process.exit(1);
  }

  const userIds = userIdsInput
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (!userIds.length) {
    console.error('No user IDs provided. Use --userIds 123,456 or set USER_IDS env var.');
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
    ],
  });

  client.on('ready', async () => {
    try {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        console.log('GUILD_NOT_FOUND');
        process.exit(1);
      }

      const chunks = chunkArray(userIds, batchSize);
      console.log(`[TAGLINE_REPAIR] start repair for guild ${guildId} with ${userIds.length} user(s) in ${chunks.length} batch(es)`);

      for (let i = 0; i < chunks.length; i++) {
        const batch = chunks[i];
        console.log(`[TAGLINE_REPAIR] processing batch ${i + 1}/${chunks.length} (${batch.length} user(s))`);

        for (const userId of batch) {
          try {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) {
              console.log(`[TAGLINE_REPAIR] member not found ${userId}`);
              continue;
            }

            const tag = extractServerTag(member) ?? 'NO_TAG';
            const hasRoleBefore = member.roles.cache.has('1422140113667751977');
            console.log(`[TAGLINE_REPAIR] user=${userId} tag=${tag} hasRoleBefore=${hasRoleBefore}`);

            if (dryRun) {
              console.log(`[TAGLINE_REPAIR] dry-run user=${userId} tag=${tag}`);
              continue;
            }

            const result = await syncGoKaizenTaglineRole(member, client);
            const refreshed = await guild.members.fetch(userId).catch(() => null);
            const hasRoleAfter = refreshed?.roles?.cache?.has('1422140113667751977') ?? false;

            console.log(`[TAGLINE_REPAIR] user=${userId} result=${JSON.stringify(result)} hasRoleAfter=${hasRoleAfter}`);
          } catch (err) {
            console.error(`[TAGLINE_REPAIR] failed user=${userId}: ${err.message}`);
          }
        }

        if (i < chunks.length - 1) {
          console.log(`[TAGLINE_REPAIR] waiting ${delayMs}ms before next batch`);
          await delay(delayMs);
        }
      }

      console.log('[TAGLINE_REPAIR] done');
      process.exit(0);
    } catch (err) {
      console.error('[TAGLINE_REPAIR] fatal:', err.message);
      process.exit(1);
    }
  });

  client.login(config.token).catch(err => {
    console.error('LOGIN_FAILED:', err.message);
    process.exit(1);
  });
})();
