const { EmbedBuilder } = require('discord.js');

function buildDummyListEmbeds() {
  const rules = [
    ['1. Promosi', 'Dilarang keras untuk melakukan pengiklanan atau mempromosikan barang atau jasa dalam bentuk apapun pada Voice Channel maupun Text Channel.\n\nDilarang untuk mempromosikan link Discord server lain pada Voice Channel maupun Text Channel.'],
    ['2. Doxing', 'Dilarang keras melakukan tindakan tersebut, baik pada Voice Channel maupun Text Channel (hal yang dimaksud adalah menyebarluaskan informasi pribadi orang lain dalam bentuk digital dengan jenis apapun).\n\nInformasi yang dimaksud adalah segala bentuk informasi yang dimiliki oleh seseorang dan diklasifikasikan sebagai informasi pribadi dalam bentuk apapun.'],
    ['3. Pencurian Identitas atau Identitas Palsu', 'Dilarang keras untuk menggunakan identitas palsu atau mengaku menggunakan identitas orang lain yang bukan dirinya untuk kepentingan pribadi.\n\nDilarang keras menggunakan identitas orang lain yang bukan dirinya dengan tujuan merugikan orang lain.'],
    ['4. Roasting', 'Dilarang keras memberikan ucapan yang berlebihan secara lisan maupun tekstual baik pada Voice Channel maupun Text Channel kepada orang lain sehingga menyebabkan rasa tidak nyaman.\n\nDilarang untuk mengirimkan konten digital pada Voice Channel maupun Text Channel yang menyebabkan rasa tidak nyaman kepada orang lain.'],
    ['5. Pornografi', 'Dilarang keras mengirimkan konten digital dalam bentuk apapun yang mengandung unsur ketelanjangan pada Voice Channel maupun Text Channel.\n\nDilarang keras menggunakan fitur screenshare maupun open cam dengan tujuan menampilkan konten digital yang mengandung unsur ketelanjangan pada Voice Channel.'],
    ['6. Pelecehan Seksual', 'Dilarang keras melakukan hal seksual secara sepihak yang menyebabkan rasa tidak nyaman kepada orang lain.\n\nDilarang keras untuk melakukan candaan fisik yang bersifat merendahkan atau menghina orang lain berdasarkan jenis kelamin dari seseorang.'],
    ['7. Ujaran Kebencian', 'Dilarang keras melakukan tindakan atau ajakan yang menyebabkan keributan dan ketidaknyamanan pada orang lain.'],
    ['8. Membuat Keributan', 'Dilarang keras untuk melakukan tindakan keributan dengan tujuan untuk menciptakan rasa tidak nyaman kepada orang lain.\n\nDilarang untuk memanfaatkan keributan untuk menciptakan situasi yang lebih buruk dari sebelumnya.'],
    ['9. Ajakan Membuat Keributan', 'Dilarang keras untuk mengajak atau melakukan tindakan keributan dengan tujuan untuk menciptakan rasa tidak nyaman kepada orang lain.\n\nDilarang keras untuk memprovokasi orang lain dengan tujuan untuk memperkeruh suasana sehingga menyebabkan keributan yang lebih besar dari hasil provokasi yang dilakukan.'],
    ['10. Hoax atau Berita Palsu', 'Dilarang keras untuk menyebarkan informasi yang belum dipastikan kebenarannya sehingga menyebabkan kesalahpahaman pada orang lain.\n\nDilarang keras untuk menyebarkan informasi yang tidak benar dengan tujuan untuk merusak, merendahkan, dan mempermalukan orang lain.'],
    ['11. Sara', 'Dilarang keras untuk mengucapkan hal-hal berlebihan yang berkaitan dengan suku, ras, agama, dan budaya dengan tujuan menciptakan rasa tidak nyaman kepada orang lain.\n\nHal ini dilarang untuk dilakukan baik dalam Voice Channel maupun Text Channel.'],
    ['12. Spam', 'Dilarang keras untuk mengirimkan suatu konten digital apapun secara terus menerus dalam waktu yang bersamaan sehingga menyebabkan rasa tidak nyaman kepada orang lain.'],
    ['13. Penyalahgunaan Akses', 'Dilarang keras untuk menyalahgunakan akses Server Mute, Server Deafens, Disconnect, atau Move pada role tertentu seperti SULTAN atau role lain yang tidak disebutkan dan diberikan akses di GO KAIZEN.'],
    ['14. Channel', 'Dilarang menggunakan Voice atau Text Channel yang tidak sesuai dengan sebagaimana mestinya.'],
    ['15. Akun', 'Dilarang keras menggunakan bergabung kembali ke dalam server menggunakan akun yang telah dikenakan sanksi Ban.'],
    ['16. Perjudian', 'Dilarang keras melakukan tindakan perjudian yang melibatkan transaksi dengan nilai mata uang nyata di dalam server.\n\nHal yang dimaksud adalah segala bentuk tindakan digital dalam jenis apapun.'],
    ['17. Hak Kekayaan Intelektual (HAKI)', 'Dilarang keras menggunakan HAKI orang lain atau kelompok tertentu untuk kepentingan pribadi tanpa adanya izin si pemilik.\n\nDilarang keras mengklaim HAKI orang lain atau kelompok tertentu dengan tujuan apapun tanpa adanya izin si pemilik.'],
    ['18. Penggunaan Kata', 'Dilarang keras untuk menggunakan kata yang tidak senonoh pada Voice Channel maupun Text Channel menggunakan bahasa apapun.\n\nDilarang keras untuk menggunakan kata tidak senonoh pada tampilan akun Discord dalam server.'],
    ['19. Penipuan', 'Dilarang keras untuk melakukan tindakan penipuan untuk kepentingan pribadi dalam bentuk apapun.\n\nHal yang dimaksud adalah kegiatan yang berlaku baik pada Voice Channel maupun Text Channel.'],
    ['20. Scam Link', 'Dilarang keras untuk mengirimkan dan menyebarluaskan pesan text yang berbentuk phising dengan tujuan merugikan orang lain.\n\nMember dihimbau untuk tidak membuka pesan text tersebut jika tidak diminta.'],
    ['21. Jual Beli', 'Dilarang keras untuk melakukan segala transaksi jual beli barang atau jasa pada Voice Channel maupun Text Channel.\n\nKami tidak bertanggung jawab dengan segala resiko yang terjadi ketika kalian melakukan transaksi jual beli di dalam server GO KAIZEN.'],
    ['22. Kekerasan', 'Dilarang keras mengirimkan konten digital apapun yang berbentuk kekerasan ke dalam server.\n\nHal yang dimaksud adalah kegiatan yang berlaku baik pada Voice Channel maupun Text Channel.'],
    ['23. Ketidaknyamanan', 'Dilarang keras melakukan perbuatan yang membuat orang lain merasa terganggu dan tidak nyaman.\n\nHal yang dimaksud adalah perbuatan yang berlaku baik pada Voice Channel maupun Text Channel.']
  ];

  const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII'];
  const rulesMessages = rules.map(([name, value], index) => {
    const title = name.replace(/^\d+\./, `${romanNumerals[index]}.`).toUpperCase();
    const header = index === 0
      ? '**GO KAIZEN — Rules & Guidelines**\n*#ForgeYourLegacy*\n\n**PERATURAN SERVER**\n\n'
      : '';
    return `${header}**${title}**\n\n\`\`\`text\n${name}\n${value}\n\`\`\``;
  });

  rulesMessages.push(
    '**II. SANKSI YANG DIBERLAKUKAN**\n\n**1. WARN**\n\n```text\n1. Warn\n- Batas maksimal penjatuhan sanksi warn adalah sebanyak 2 kali, jika ditemukan pelanggaran lain dikemudian hari maka penjatuhan sanksi Timeout selama 7 hari akan diberlakukan.\n- Warn yang telah diberlakukan akan disertai dengan notifikasi peringatan yang akan dikirimkan melalui bot ke akun Discord kalian.\n```',
    '**2. TIMEOUT**\n\n```text\n2. Timeout\n- Staff berhak menjatuhkan sanksi dalam bentuk Timeout atau TO bagi siapapun yang terbukti melakukan pelanggaran.\n- Hal yang dimaksud adalah pelanggar yang terbukti melanggar ketentuan: Rules no 2, Rules no 4, Rules no 6, Rules no 10, Rules no 17, dan Rules no 11.\n```',
    '**3. BAN**\n\n```text\n3. Ban\n- Pelanggar yang terbukti melanggar ketentuan: Rules no 1, Rules no 2, Rules no 3, Rules no 4, Rules no 7, Rules no 8, Rules no 9, Rules no 10, Rules no 11, Rules no 12, Rules no 13, Rules no 14, Rules no 15, Rules no 16, Rules no 18, Rules no 19, Rules no 23 akan dijatuhkan sanksi berupa Ban setelah menerima sanksi Warn sebanyak 3 kali dan juga Timeout.\n- Pelanggar yang terbukti melanggar ketentuan: Rules no 5, Rules no 6, Rules no 19, dan Rules no 20 akan dijatuhkan sanksi berupa Ban tanpa menerima sanksi Warn atau Timeout.\n```'
  );

  return {
    toList: new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📋 Daftar Orang')
      .setDescription('Contoh daftar orang yang tersimpan di sistem.')
      .addFields(
        { name: '1. Andi Pratama', value: 'ID: `000000000000000001`\nStatus: ✅ Aktif', inline: true },
        { name: '2. Budi Santoso', value: 'ID: `000000000000000002`\nStatus: ✅ Aktif', inline: true },
        { name: '3. Citra Lestari', value: 'ID: `000000000000000003`\nStatus: ⏳ Menunggu verifikasi', inline: true }
      )
      .setFooter({ text: 'Data dummy • Belum terhubung ke database' })
      .setTimestamp(),
    untoList: new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅ Daftar yang Sudah Selesai')
      .setDescription('Contoh orang yang sudah menyelesaikan proses.')
      .addFields(
        { name: 'Andi Pratama', value: 'Selesai pada: 22 September 2026', inline: true },
        { name: 'Budi Santoso', value: 'Selesai pada: 21 September 2026', inline: true }
      )
      .setFooter({ text: 'Data dummy' })
      .setTimestamp(),
    unbanList: new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('🔓 Daftar Unban')
      .setDescription('Contoh riwayat pengajuan atau proses unban.')
      .addFields(
        { name: 'Deni Saputra', value: 'Alasan: Masa hukuman selesai\nStatus: ✅ Disetujui', inline: true },
        { name: 'Eka Ramadhan', value: 'Alasan: Klarifikasi pelanggaran\nStatus: ⏳ Ditinjau', inline: true }
      )
      .setFooter({ text: 'Data dummy' })
      .setTimestamp(),
    catatanPelanggaran: new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('⚠️ Catatan Pelanggaran')
      .setDescription('Contoh catatan moderasi member.')
      .addFields(
        { name: 'Fajar Nugraha', value: 'Pelanggaran: Spam\nPoin: 1\nTanggal: 20 September 2026', inline: true },
        { name: 'Gina Maharani', value: 'Pelanggaran: Promosi tanpa izin\nPoin: 2\nTanggal: 19 September 2026', inline: true }
      )
      .setFooter({ text: 'Data dummy • Contoh tampilan saja' })
      .setTimestamp(),
    rules: rulesMessages
  };
}

module.exports = { buildDummyListEmbeds };