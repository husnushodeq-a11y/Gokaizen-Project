# Progress Teknis: Alt Detection Audit Mode

Tanggal catatan: 2026-09-16

## Status Implementasi

Tahap yang sudah selesai adalah command layer untuk testing/audit. Belum ada ban, kick, atau perubahan role otomatis.

Project existing:

- Runtime: Node.js
- Bot: `discord.js` v14
- Prefix: `g!`
- Prefix command diproses melalui event `messageCreate`
- Entry point bot: `index.js`
- Database existing: JSON melalui `utils/dbStore.js`
- File database existing: `data/database.json`
- Backup database: `data/database.bak.json`
- Event loader di `index.js` otomatis memuat semua file `.js` dari folder `events`
- Express sudah dipasang dan diintegrasikan; OAuth/domain publik belum diuji

## File Yang Sudah Ditambahkan

### `utils/altDetectionData.js`

Helper data untuk namespace database `alt_detection`.

Struktur logical data:

```json
{
  "alt_detection": {
    "verifications": [],
    "bans": [],
    "flagLogs": [],
    "guildConfig": {},
    "blacklistedSignals": []
  }
}
```

Fungsi yang tersedia:

- `guildConfig(guildId)`
- `setGuildConfig(guildId, config)`
- `latestVerification(guildId, discordId)`
- `addVerification(record)`
- `addBlacklistSignal(record)`
- `matches(guildId, record)`
- `linkedRecords(guildId, record)`
- `addFlagLog(entry)`

Record verifikasi yang diharapkan memakai field:

```json
{
  "guildId": "guild-id",
  "discordId": "discord-user-id",
  "ipHash": "hmac-sha256-ip",
  "fingerprintHash": "hmac-sha256-fingerprint",
  "userAgent": "user-agent",
  "discordCreatedAt": 1760000000000,
  "createdAt": 1760000000000,
  "status": "verified"
}
```

IP mentah dan komponen fingerprint mentah tidak boleh dimasukkan ke record.

### `utils/altDetectionSystem.js`

Implementasi command prefix dan scoring audit.

Command yang aktif:

```text
g!verifyconfig <modlog_channel_id> <superadmin_role_id>
g!banip @user alasan
g!ban_ip @user alasan
g!altcheck @user
```

`g!ban_ip` disediakan sebagai alias dari `g!banip`.

### `utils/altDetectionWeb.js`

Express web server yang diinisialisasi dari `index.js` pada `WEB_HOST` dan `WEB_PORT` (default `127.0.0.1:3000`). Route yang tersedia:

- `/`: health check
- `/privacy`: halaman kebijakan singkat
- `/auth`: validasi signed state dan redirect OAuth Discord
- `/auth/callback`: tukar OAuth code, hash IP, dan membuat sesi fingerprint sementara
- `/auth/submit`: hash fingerprint, simpan verification record, dan tulis hasil audit

State OAuth memakai HMAC, expiry 10 menit, dan single-use selama proses Node hidup. IP memakai HMAC-SHA256; IP mentah tidak ditulis ke database. Fingerprint browser langsung di-HMAC dan komponen mentah tidak disimpan.

`index.js` menjalankan web server otomatis kecuali `ALT_WEB_DISABLED=1`.

Format lengkap dengan role verifikasi masih diterima untuk kompatibilitas:

```text
g!verifyconfig <unverified_role_id> <verified_role_id> <flagged_role_id> <modlog_channel_id> <superadmin_role_id>
```

### `events/altDetectionCommands.js`

Adapter event `messageCreate` yang meneruskan pesan ke `utils/altDetectionSystem.js`. File ini akan otomatis dimuat oleh loader existing di `index.js`.

## Mode Audit

Semua command saat ini berjalan dalam mode audit/testing:

```text
mode: audit
```

`g!banip` saat ini:

- Tidak memanggil `member.ban()`.
- Tidak memanggil `member.kick()`.
- Tidak menambah atau menghapus role.
- Hanya mengambil record verifikasi yang sudah ada.
- Menambahkan `ipHash` dan `fingerprintHash` ke `blacklistedSignals` jika tersedia.
- Menulis `flagLogs`.
- Mengirim embed audit ke mod-log.
- Membalas executor dengan embed hasil.

Jika target belum pernah verifikasi web, hasilnya hanya:

```text
Target belum verifikasi. Tidak ada signal yang ditambahkan.
```

Bot Discord tidak dapat memperoleh IP user langsung dari command. IP hanya bisa tersedia setelah integrasi web verification.

## Konfigurasi Guild

`g!verifyconfig` hanya dapat digunakan oleh member dengan permission Administrator.

Format utama untuk audit mode:

```text
g!verifyconfig 444444444444444444 555555555555555555
```

Pada format ini role `Unverified`, `Verified`, dan `Flagged` tidak diperlukan. Sistem hanya memakai channel mod-log dan role superadmin.

Field yang disimpan pada audit mode:

```json
{
  "modlogChannelId": "...",
  "superadminRoleId": "...",
  "mode": "audit",
  "updatedAt": 1760000000000
}
```

Jika format lengkap digunakan, `unverifiedRoleId`, `verifiedRoleId`, dan `flaggedRoleId` ikut disimpan untuk kebutuhan tahap enforcement berikutnya.

Argumen kelima `superadmin_role_id` bisa diganti dengan environment/config:

```env
ALT_SUPERADMIN_ROLE_ID=role-id
```

Jika role superadmin tidak ada di config guild, environment, atau `config.json`, `g!banip` ditolak. Ini sengaja fail closed.

`g!banip` juga ditolak sebelum menulis data jika `modlog_channel_id` belum diatur atau channel tidak dapat diakses bot.

## Permission

### `g!verifyconfig`

Membutuhkan:

```text
Administrator permission
```

### `g!banip`

Membutuhkan role ID yang sama dengan `superadminRoleId` yang dikonfigurasi. Permission Discord biasa seperti `BanMembers` tidak cukup.

### `g!altcheck`

Membutuhkan:

```text
ModerateMembers permission
```

## Scoring Saat Ini

Fungsi yang diekspor:

```javascript
calculateRiskScore(guildId, record)
```

Aturan:

- Fingerprint cocok dengan blacklist: `+70`
- IP cocok dengan blacklist: `+20`
- Ada blacklist signal terkait: `+100`
- Akun Discord berumur kurang dari 7 hari dan fingerprint cocok dengan record lain: `+15`

Keputusan simulasi:

```text
score >= 100 -> AUTO-BAN
score >= 50  -> FLAGGED
score < 50   -> VERIFIED
```

Semua keputusan tersebut hanya ditampilkan sebagai simulasi selama audit mode.

## Skenario Testing Saat Ini

1. Konfigurasikan guild:

```text
g!verifyconfig <modlog> <superadmin>
```

2. Jalankan command pada target yang belum memiliki record web:

```text
g!banip @user testing
```

Expected:

```text
Data verifikasi belum tersedia.
Tidak ada blacklist signal.
Tidak ada ban.
```

3. Setelah record verifikasi tersedia, jalankan lagi:

```text
g!banip @user testing ban evasion
```

Expected:

```text
ipHash/fingerprintHash dimasukkan ke blacklist jika tersedia.
Embed dikirim ke mod-log.
Flag log ditulis.
Target tidak diban.
```

4. Periksa target:

```text
g!altcheck @user
```

Expected:

```text
Status hash tersedia.
Kecocokan blacklist.
Akun terkait.
Risk score.
Keputusan simulasi.
Aksi aktual: TIDAK ADA - AUDIT MODE.
```

## Validasi Yang Sudah Dilakukan

Perintah berikut berhasil:

```bash
node --check utils/altDetectionData.js
node --check utils/altDetectionSystem.js
node --check events/altDetectionCommands.js
```

Smoke test `calculateRiskScore('test-guild', null)` juga berhasil dan menghasilkan `NO_DATA`.

Tidak ada data database yang ditulis oleh smoke test.

## Yang Belum Dibuat

- Pengisian credential OAuth dan secret di VPS.
- Nginx dan HTTPS.
- Pengujian OAuth pada domain publik.
- Role gate `unverified-akun` dan `verified-akun` sudah diimplementasikan, tetapi masih opt-in melalui `ALT_VERIFY_GATE=1`.
- Event `guildMemberAdd` untuk mengirim link verifikasi.
- Role `Unverified`, `Verified`, dan `Suspicious` otomatis. Role-role ini sengaja belum digunakan pada audit mode.
- Rate limiting route web.
- Retensi data 90 hari.
- `g!mydata`.
- Enforcement mode untuk ban/kick/role.

## Rencana Tahap Berikutnya

1. Isi environment OAuth dan secret di VPS.
2. Hentikan server manual lama yang memakai port `3000`, lalu restart bot agar module web baru aktif.
3. Uji `curl http://127.0.0.1:3000/` dan pastikan health check baru muncul.
4. Konfigurasikan Nginx dan HTTPS untuk `verify.cantikkulaven.my.id`.
5. Daftarkan OAuth redirect URI di Discord Developer Portal.
6. Uji satu akun pertama.
7. Jalankan `g!banip` pada akun yang sudah memiliki record.
8. Uji akun kedua dan pastikan hanya log match, tanpa ban.
9. Aktifkan `ALT_VERIFY_GATE=1` hanya setelah permission channel siap.
10. Jangan aktifkan enforcement sebelum hasil audit disetujui.

## Catatan VPS

Bot saat ini berjalan sebagai proses Node.js di VPS. Rancangan web:

```text
Domain HTTPS
    |
    v
Nginx/Caddy reverse proxy
    |
    v
Express localhost:3000
    |
    v
Proses bot Node.js + database JSON
```

Variabel yang nantinya diperlukan:

```env
WEB_HOST=127.0.0.1
WEB_PORT=3000
VERIFY_BASE_URL=https://verify.example.com
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=https://verify.example.com/auth/callback
HMAC_SECRET=
IP_HASH_SECRET=
FINGERPRINT_HASH_SECRET=
ALT_ENFORCEMENT_MODE=audit
```

Jangan menyimpan token bot atau secret di dokumentasi. Token bot yang pernah terekspos di file konfigurasi harus di-rotate melalui Discord Developer Portal.
