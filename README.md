# Dokumentasi Gokaizen Bot

Dokumentasi singkat mengenai struktur folder, cara sistem memuat modul, dan panduan menambahkan command serta event baru.

## 📂 Struktur Folder
Berikut adalah struktur folder utama dari bot Gokaizen:
- `assets/` - Berisi aset gambar dan media lainnya yang digunakan oleh bot (misal: logo, banner).
- `commands/` - Tempat penyimpanan semua slash commands. Dibagi lagi ke dalam subfolder kategori (seperti `tools/`, `utility/`).
- `data/` - Folder tempat menyimpan berbagai file JSON sebagai database lokal sementara (seperti `voiceDB.json`, `warnData.json`).
- `events/` - Berisi file-file listener untuk menangani berbagai event dari Discord (misal: saat bot ready, member join, interaksi tombol, dll).
- `utils/` - Tempat berkumpulnya fungsi pembantu (helper), modul sistem (seperti `warnSystem.js`, `dbStore.js`), dan berbagai logic fitur spesifik.
- `scripts/` - Script-script operasional atau perbaikan (maintenance).
- `tests/` - File pengujian (testing) untuk fitur-fitur tertentu.
- `scheduler/` - Pengaturan jadwal atau cron untuk tugas yang berjalan otomatis.
- `index.js` - File utama (entry point) tempat bot dijalankan dan semua modul digabungkan.
- `config.json` - File konfigurasi untuk token, berbagai ID channel/role penting, dan pengaturan lainnya.

---

## ⚙️ Cara `index.js` Memuat Modul

### 1. Memuat Commands
Bot menggunakan sistem pembacaan folder otomatis (dynamic loading) untuk memuat slash commands.
- Di dalam `index.js`, bot menggunakan `fs.readdirSync` untuk membaca folder `commands/` dan menelusuri setiap subfoldernya.
- Bot mengambil setiap file `.js` dan memeriksa apakah modul yang diekspor memiliki properti `data` (metadata command dari `SlashCommandBuilder`) dan `execute` (fungsi jalannya command).
- Jika strukturnya valid, command tersebut akan dimasukkan ke dalam koleksi internal (`client.commands.set`) dan otomatis didaftarkan (di-deploy) ke API Discord melalui modul `REST`.

### 2. Memuat Events
Sama seperti commands, event juga dimuat secara dinamis.
- `index.js` membaca seluruh file `.js` yang berada langsung di dalam folder `events/`.
- Tiap file akan diperiksa properti `name` (nama event dari Discord, misal `interactionCreate`), properti `once` (berupa boolean), dan properti `execute` (fungsi utamanya).
- Bot kemudian mendaftarkan fungsi `execute` tersebut ke sistem *event emitter* menggunakan `client.on(event.name, ...)` atau `client.once(event.name, ...)`.

### 3. Memuat Utils
Berbeda dengan commands dan events, file di dalam folder `utils/` **tidak dimuat secara otomatis**. 
Modul-modul di `utils/` dipanggil menggunakan `require()` secara manual. Pemanggilan ini biasanya dilakukan di bagian paling atas file `index.js` atau di dalam file command/event yang membutuhkannya.
*Contoh di `index.js`:*
```javascript
const dbStore = require('./utils/dbStore');
const voiceTracker = require('./utils/voiceTracker');
```

---

## ➕ Cara Menambah Command atau Event Baru

### Menambah Command Baru
1. Buat file `.js` baru di dalam salah satu subfolder di folder `commands/` (contoh: `commands/utility/ping.js`).
2. Gunakan struktur standar berikut untuk isi filenya:
   ```javascript
   const { SlashCommandBuilder } = require('discord.js');

   module.exports = {
       // Bagian data digunakan untuk mendaftarkan struktur command ke Discord
       data: new SlashCommandBuilder()
           .setName('ping')
           .setDescription('Membalas dengan Pong!'),
           
       // Fungsi execute dipanggil saat user menggunakan command ini
       async execute(interaction) {
           await interaction.reply('Pong!');
       },
   };
   ```
3. Restart proses bot (`index.js`). Command tersebut akan otomatis terbaca dan di-deploy ke server Discord.

### Menambah Event Baru
1. Buat file `.js` baru langsung di dalam folder `events/` (contoh: `events/messageCreate.js`).
2. Gunakan struktur standar berikut untuk isi filenya:
   ```javascript
   const { Events } = require('discord.js');

   module.exports = {
       name: Events.MessageCreate, // Atau ketik string manual 'messageCreate'
       once: false, // Set true jika event hanya untuk dijalankan sekali saat bot baru menyala
       
       // Fungsi execute menerima parameter bawaan dari event Discord tersebut
       execute(message, client) {
           // Contoh: Jangan merespon bot lain
           if (message.author.bot) return;

           console.log(`Pesan baru dari ${message.author.tag}: ${message.content}`);
       },
   };
   ```
3. Restart bot, dan listener event baru tersebut akan otomatis aktif memantau aktivitas Discord.
