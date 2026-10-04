# Discord Bot

Bot Discord dengan arsitektur modular menggunakan Node.js dan discord.js.

## Setup

1. Clone repository
2. Copy `.env.example` ke `.env` dan isi token bot
3. `npm install`
4. `npm start`

## Struktur

```
src/
├── events/      # Event handlers (1 file = 1 event)
├── commands/    # Slash commands (1 file = 1 command)
├── utils/       # Helper functions
└── handlers/    # Auto-loader untuk events & commands
```

## Menambah Command Baru

Buat file baru di `src/commands/` dengan format:

```js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nama-command')
    .setDescription('Deskripsi command'),
  async execute(interaction) {
    await interaction.reply('Hello!');
  },
};
```

## Menambah Event Baru

Buat file baru di `src/events/` dengan format:

```js
const { Events } = require('discord.js');

module.exports = {
  name: Events.NamaEvent,
  once: false,
  execute(...args) {
    // handle event
  },
};
```
