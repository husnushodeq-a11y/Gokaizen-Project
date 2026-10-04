// events/regulasi.js
// Command g!regulasi: Donation Policy GO KAIZEN dan membership tier.
// Memakai Components V2 dengan accent color dan separator tipis antar bagian.
// Hanya bisa dijalankan staff (Moderate Members).

const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
    PermissionsBitField,
} = require('discord.js');

const PREFIX = 'g!';
const COMMAND = 'regulasi';

// Warna aksen per bagian
const COLOR_POLICY = 0xD31007;
const COLOR_BOOSTER = 0xF47FFF;
const COLOR_SOCIALITE = 0x57606A;
const COLOR_CRAZYRICH = 0x2EA0F0;
const COLOR_SULTAN = 0xE8B923;

// Role yang dirujuk
const ROLE_SOCIALITE = '1420986794253746186';
const ROLE_CRAZYRICH = '1362504922033295500';
const ROLE_SULTAN = '1510540521896939621';
const ROLE_BOOSTER = '1348517203770740859';

// ============================================================
//  PEMBANGUN KOMPONEN
// ============================================================

function divider() {
    return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function text(content) {
    return new TextDisplayBuilder().setContent(content);
}

// Membangun container dari daftar bagian secara berurutan.
// Setiap bagian dipisah garis tipis.
function container(color, sections) {
    const c = new ContainerBuilder().setAccentColor(color);
    sections.forEach((isi, i) => {
        c.addTextDisplayComponents(text(isi));
        if (i < sections.length - 1) c.addSeparatorComponents(divider());
    });
    return c;
}

const payload = (c) => ({
    components: [c],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
});

// ============================================================
//  DONATION POLICY
// ============================================================

function policyContainer() {
    return container(COLOR_POLICY, [
        '## GO KAIZEN DONATION POLICY',

        'Terima kasih atas dukungan terhadap perkembangan GO KAIZEN Official. ' +
        'Kebijakan ini berlaku untuk seluruh member yang melakukan donasi dalam bentuk apa pun. ' +
        'Pastikan seluruh poin di bawah dibaca dan dipahami sepenuhnya.\n' +
        '> Dengan melakukan donasi, kamu dianggap telah menyetujui dan terikat pada seluruh ketentuan ini tanpa terkecuali.',

        '**Sifat Donasi**\n' +
        'Donasi bersifat sukarela dan bukan merupakan transaksi jual beli. ' +
        'Seluruh dana yang terkumpul digunakan sepenuhnya untuk mendukung keberlangsungan dan perkembangan server, mencakup:\n' +
        '\u2022 Event komunitas\n' +
        '\u2022 Giveaway dan reward member\n' +
        '\u2022 Pengembangan server\n' +
        '\u2022 Hosting dan bot premium\n' +
        '\u2022 Kebutuhan operasional lainnya',

        '**Benefit Donatur**\n' +
        'Setiap donatur akan mendapatkan benefit sesuai dengan paket yang dipilih:\n' +
        '\u2022 Role donatur eksklusif\n' +
        '\u2022 Akses channel khusus\n' +
        '\u2022 Priority event\n' +
        '\u2022 Reward tambahan\n' +
        '> Benefit hanya berlaku untuk satu akun Discord dan tidak dapat dipindahtangankan ke akun lain. ' +
        'Sistem benefit dapat diperbarui sewaktu-waktu mengikuti perkembangan dan kebutuhan server.',

        '**Verifikasi**\n' +
        'Setiap donatur **wajib mengirimkan bukti pembayaran yang valid** sebagai syarat verifikasi. ' +
        'Benefit akan diproses setelah pembayaran berhasil dikonfirmasi oleh Staff GO KAIZEN.\n' +
        '> Apabila terjadi kesalahan pencatatan atau benefit belum diterima, segera hubungi Staff agar dapat dilakukan pengecekan lebih lanjut.',

        '**Kebijakan Refund**\n' +
        'Seluruh donasi yang telah diterima bersifat final dan tidak dapat dikembalikan. ' +
        'Refund hanya dapat dipertimbangkan apabila:\n' +
        '\u2022 Terjadi kesalahan sistem pembayaran\n' +
        '\u2022 Terjadi transfer ganda\n' +
        '\u2022 Terjadi kesalahan administrasi dari pihak GO KAIZEN\n' +
        '> Di luar kondisi tersebut, refund tidak dapat diproses.',

        '**Batasan Penggunaan Benefit**\n' +
        'Benefit donasi **tidak diperkenankan** digunakan untuk:\n' +
        '\u2022 Melanggar rules server\n' +
        '\u2022 Menyalahgunakan hak akses atau role\n' +
        '\u2022 Mengganggu kenyamanan komunitas\n' +
        '\u2022 Melakukan tindakan yang merugikan server\n' +
        '> Apabila ditemukan pelanggaran, GO KAIZEN berhak mencabut seluruh benefit tanpa pengembalian dana.',

        '**Kebijakan Umum**\n' +
        'GO KAIZEN **berhak menyesuaikan, mengubah, atau menghentikan** sistem benefit, role, maupun kebijakan donasi ' +
        'kapan saja tanpa perlu persetujuan donatur, demi menjaga keberlangsungan dan keseimbangan komunitas.\n' +
        '> Perubahan yang bersifat signifikan akan diumumkan melalui channel announcement sebagai bentuk transparansi kepada seluruh member.',

        '**Persetujuan**\n' +
        'Dengan melakukan donasi, setiap member dianggap telah membaca, memahami, dan menyetujui secara penuh seluruh ' +
        'Donation Policy GO KAIZEN Official ini. Terima kasih atas kepercayaan dan dukungan yang telah diberikan. ' +
        'Setiap kontribusi menjadi bagian nyata dari perkembangan komunitas ini ke depan.',
    ]);
}

// ============================================================
//  MEMBERSHIP TIERS
// ============================================================

function tiersHeaderContainer() {
    return container(COLOR_POLICY, ['## GO KAIZEN MEMBERSHIP TIERS']);
}

function boosterContainer() {
    return container(COLOR_BOOSTER, [
        '## BOOSTER SERVER',
        '**Benefit**\n' +
        `\u2022 Mendapatkan role <@&${ROLE_BOOSTER}>\n` +
        '\u2022 Dapat memilih role premium di <#1496646087266668636>\n' +
        '\u2022 Display role di member list\n' +
        '\u2022 Gradient color role\n' +
        '\u2022 Akses priority voice di <#1461294184894824560>',
    ]);
}

function socialiteContainer() {
    return container(COLOR_SOCIALITE, [
        '## SOCIALITE\nIDR 35.000 / bulan',
        '**Benefit**\n' +
        `\u2022 Role <@&${ROLE_SOCIALITE}> selama 1 bulan\n` +
        '\u2022 Custom role: nama, warna solid, dan icon selama 1 bulan\n' +
        '\u2022 Bypass slowmode di General Chat\n' +
        '\u2022 Akses embed link dan attach file\n' +
        '\u2022 Akses external sticker dan emoji\n' +
        '\u2022 Akses soundboard\n' +
        '\u2022 Akses ganti nickname\n' +
        '\u2022 Akses VIP Lounge (text dan voice)',
    ]);
}

function crazyRichContainer() {
    return container(COLOR_CRAZYRICH, [
        '## CRAZY RICH\nIDR 100.000 / 3 bulan',
        '**Benefit**\n' +
        `\u2022 Role <@&${ROLE_SOCIALITE}> selama 3 bulan\n` +
        `\u2022 Role <@&${ROLE_CRAZYRICH}> selama 1 bulan\n` +
        '\u2022 Custom role: nama, warna solid, gradient, atau hologram, dan icon selama 1 bulan\n' +
        '\u2022 Seluruh benefit tier Socialite\n' +
        '\u2022 Akses command bot premium selama 1 bulan (syarat dan ketentuan berlaku)\n' +
        '\u2022 Dapat menarik, memindahkan, dan disconnect member dari voice\n' +
        '\u2022 Hak mengatur 1 custom auto-responder (syarat dan ketentuan berlaku)',
    ]);
}

function sultanContainer() {
    return container(COLOR_SULTAN, [
        '## SULTAN\nIDR 750.000 / tahun',
        '**Benefit**\n' +
        `\u2022 Role <@&${ROLE_SOCIALITE}>, <@&${ROLE_CRAZYRICH}>, dan <@&${ROLE_SULTAN}> selama 1 tahun\n` +
        '\u2022 Custom role: nama, warna solid, gradient, atau hologram, dan icon selama 1 tahun\n' +
        '\u2022 Seluruh benefit tier sebelumnya\n' +
        '\u2022 Akses command bot premium secara permanen (syarat dan ketentuan berlaku)\n' +
        '\u2022 Kontrol voice penuh: menarik, memindahkan, disconnect, server mute, dan deafen\n' +
        '\u2022 Private voice lounge permanen\n' +
        '\u2022 Pengumuman resmi di announcement channel\n' +
        '\u2022 Giveaway khusus sebagai sambutan\n' +
        '\u2022 Early access untuk fitur baru GO KAIZEN',
    ]);
}

function caraDonasiContainer() {
    return container(COLOR_POLICY, [
        '## INFORMASI DONASI',

        'Seluruh donasi diproses melalui Sociabuzz di https://sociabuzz.com/gkzn/tribe',

        '**Notifikasi Donasi**\n' +
        'Setiap donasi yang masuk akan otomatis ditampilkan di <#1510476578138619945>. ' +
        'Donatur dengan kontribusi tertinggi juga akan ditampilkan sebagai top donatur di channel <#1447802692671111208>',

        '**Setelah Berhasil Donasi**\n' +
        'Setelah donasi berhasil, silakan lakukan konfirmasi kepada Staff GO KAIZEN di <#1431026073495146696> ' +
        'dengan menyertakan bukti pembayaran yang valid agar benefit dapat segera diproses.\n' +
        '> Apabila dalam waktu wajar benefit belum diterima, segera hubungi Staff agar dapat dilakukan pengecekan lebih lanjut.',
    ]);
}

// ============================================================
//  HANDLER
// ============================================================

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        try {
            if (!message.guild || message.author.bot) return;
            if (!message.content.startsWith(PREFIX)) return;

            const args = message.content.slice(PREFIX.length).trim().split(/ +/);
            const command = args.shift()?.toLowerCase();
            if (command !== COMMAND) return;

            if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

            const channel = message.channel;

            await channel.send(payload(policyContainer()));
            await channel.send(payload(tiersHeaderContainer()));
            await channel.send(payload(boosterContainer()));
            await channel.send(payload(socialiteContainer()));
            await channel.send(payload(crazyRichContainer()));
            await channel.send(payload(sultanContainer()));
            await channel.send(payload(caraDonasiContainer()));

            await message.delete().catch(() => null);
        } catch (err) {
            console.error('[REGULASI] error:', err.message);
        }
    },
};
