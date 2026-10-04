// utils/gosmartSoal.js
// Bank soal GO SMART.
//
// Bentuk setiap soal:
//   t : teks pertanyaan
//   p : empat pilihan jawaban, urut A sampai D
//   j : nomor pilihan yang benar, dihitung mulai dari nol
//   k : kategori, dipakai untuk menyusun komposisi tiap babak
//   e : penjelasan singkat, ditampilkan setelah soal berakhir, boleh dikosongkan
//
// Kategori yang dikenali:
//   sejarah   soal seputar kemerdekaan dan perjuangan
//   indonesia pengetahuan umum tentang Indonesia
//   gokaizen  soal tentang server, tidak dapat dicari di internet
//
// Soal berkategori gokaizen yang membuat lomba ini adil, sebab tidak tersedia
// di mesin pencari dan hanya diketahui anggota yang benar benar aktif.
// Semakin tinggi babaknya, semakin banyak porsi soal jenis ini.

const SOAL = [

    // ========================================================
    //  SEJARAH KEMERDEKAAN
    // ========================================================

    {
        t: 'Teks Proklamasi Kemerdekaan Indonesia dibacakan pada tanggal berapa?',
        p: ['16 Agustus 1945', '17 Agustus 1945', '18 Agustus 1945', '19 Agustus 1945'],
        j: 1, k: 'sejarah',
        e: 'Dibacakan Soekarno di Jalan Pegangsaan Timur 56 Jakarta.',
    },
    {
        t: 'Siapa yang mengetik naskah Proklamasi?',
        p: ['Sayuti Melik', 'Ahmad Soebardjo', 'Sukarni', 'Chaerul Saleh'],
        j: 0, k: 'sejarah',
        e: 'Sayuti Melik mengetik ulang naskah tulisan tangan Soekarno.',
    },
    {
        t: 'Peristiwa Rengasdengklok terjadi karena golongan muda ingin Soekarno dan Hatta segera melakukan apa?',
        p: ['Menyerah kepada Sekutu', 'Memproklamasikan kemerdekaan', 'Membentuk tentara', 'Berunding dengan Jepang'],
        j: 1, k: 'sejarah',
        e: 'Golongan muda mendesak proklamasi tanpa menunggu janji Jepang.',
    },
    {
        t: 'Bendera Merah Putih pertama kali dikibarkan saat proklamasi dijahit oleh siapa?',
        p: ['Fatmawati', 'Rahmi Hatta', 'Cut Nyak Dien', 'Dewi Sartika'],
        j: 0, k: 'sejarah',
        e: 'Fatmawati adalah istri Soekarno.',
    },
    {
        t: 'Siapa yang menjadi Wakil Presiden pertama Republik Indonesia?',
        p: ['Sutan Sjahrir', 'Mohammad Hatta', 'Ahmad Soebardjo', 'Radjiman Wedyodiningrat'],
        j: 1, k: 'sejarah',
        e: 'Mohammad Hatta dilantik bersama Soekarno pada 18 Agustus 1945.',
    },
    {
        t: 'Badan yang merumuskan dasar negara sebelum kemerdekaan disebut apa?',
        p: ['PPKI', 'BPUPKI', 'KNIP', 'MPRS'],
        j: 1, k: 'sejarah',
        e: 'BPUPKI dibentuk pada Maret 1945 dan bersidang dua kali.',
    },
    {
        t: 'Pancasila pertama kali dikemukakan Soekarno pada tanggal berapa?',
        p: ['1 Juni 1945', '17 Agustus 1945', '22 Juni 1945', '18 Agustus 1945'],
        j: 0, k: 'sejarah',
        e: 'Karena itu 1 Juni diperingati sebagai Hari Lahir Pancasila.',
    },
    {
        t: 'Pertempuran 10 November 1945 terjadi di kota mana?',
        p: ['Bandung', 'Semarang', 'Surabaya', 'Medan'],
        j: 2, k: 'sejarah',
        e: 'Diperingati sebagai Hari Pahlawan.',
    },
    {
        t: 'Siapa tokoh yang dikenal dengan julukan Bung Tomo?',
        p: ['Sutomo', 'Sutan Sjahrir', 'Tan Malaka', 'Sudirman'],
        j: 0, k: 'sejarah',
        e: 'Pidatonya membakar semangat arek Surabaya.',
    },
    {
        t: 'Panglima Besar TNI pertama adalah?',
        p: ['Urip Sumoharjo', 'Jenderal Sudirman', 'A H Nasution', 'Gatot Soebroto'],
        j: 1, k: 'sejarah',
        e: 'Jenderal Sudirman memimpin perang gerilya meski sedang sakit.',
    },
    {
        t: 'Belanda mengakui kedaulatan Indonesia secara penuh pada tahun berapa?',
        p: ['1945', '1947', '1949', '1950'],
        j: 2, k: 'sejarah',
        e: 'Melalui Konferensi Meja Bundar pada Desember 1949.',
    },
    {
        t: 'Lagu Indonesia Raya diciptakan oleh siapa?',
        p: ['Ismail Marzuki', 'W R Supratman', 'Kusbini', 'C Simanjuntak'],
        j: 1, k: 'sejarah',
        e: 'Pertama kali diperdengarkan pada Kongres Pemuda Kedua 1928.',
    },
    {
        t: 'Sumpah Pemuda diikrarkan pada tanggal berapa?',
        p: ['20 Mei 1908', '28 Oktober 1928', '17 Agustus 1945', '1 Juni 1945'],
        j: 1, k: 'sejarah',
        e: 'Diperingati sebagai Hari Sumpah Pemuda.',
    },
    {
        t: 'Siapa presiden yang menjabat paling lama dalam sejarah Indonesia?',
        p: ['Soekarno', 'Soeharto', 'B J Habibie', 'Susilo Bambang Yudhoyono'],
        j: 1, k: 'sejarah',
        e: 'Soeharto menjabat selama tiga puluh dua tahun.',
    },
    {
        t: 'Bunyi sila kelima Pancasila adalah?',
        p: [
            'Kemanusiaan yang adil dan beradab',
            'Persatuan Indonesia',
            'Keadilan sosial bagi seluruh rakyat Indonesia',
            'Ketuhanan Yang Maha Esa',
        ],
        j: 2, k: 'sejarah',
    },

    // ========================================================
    //  PENGETAHUAN INDONESIA
    // ========================================================

    {
        t: 'Berapa jumlah provinsi di Indonesia saat ini?',
        p: ['34', '36', '38', '40'],
        j: 2, k: 'indonesia',
        e: 'Bertambah setelah pemekaran wilayah Papua.',
    },
    {
        t: 'Lagu daerah Ampar Ampar Pisang berasal dari mana?',
        p: ['Kalimantan Selatan', 'Sumatera Barat', 'Jawa Tengah', 'Sulawesi Selatan'],
        j: 0, k: 'indonesia',
    },
    {
        t: 'Rumah adat Gadang berasal dari daerah mana?',
        p: ['Aceh', 'Sumatera Barat', 'Riau', 'Jambi'],
        j: 1, k: 'indonesia',
        e: 'Ciri khasnya atap runcing menyerupai tanduk kerbau.',
    },
    {
        t: 'Alat musik Sasando berasal dari provinsi mana?',
        p: ['Bali', 'Nusa Tenggara Timur', 'Maluku', 'Papua'],
        j: 1, k: 'indonesia',
        e: 'Berasal dari Pulau Rote.',
    },
    {
        t: 'Danau terbesar di Indonesia adalah?',
        p: ['Danau Toba', 'Danau Sentani', 'Danau Singkarak', 'Danau Maninjau'],
        j: 0, k: 'indonesia',
        e: 'Terbentuk dari letusan gunung api purba.',
    },
    {
        t: 'Tari Kecak berasal dari daerah mana?',
        p: ['Jawa Timur', 'Bali', 'Lombok', 'Sulawesi Utara'],
        j: 1, k: 'indonesia',
    },
    {
        t: 'Ibu kota Provinsi Kalimantan Barat adalah?',
        p: ['Palangkaraya', 'Banjarmasin', 'Pontianak', 'Samarinda'],
        j: 2, k: 'indonesia',
    },
    {
        t: 'Hewan khas Pulau Komodo termasuk jenis apa?',
        p: ['Mamalia', 'Reptil', 'Amfibi', 'Burung'],
        j: 1, k: 'indonesia',
    },
    {
        t: 'Semboyan negara Indonesia adalah?',
        p: ['Bhinneka Tunggal Ika', 'Jalesveva Jayamahe', 'Tut Wuri Handayani', 'Swa Bhuwana Paksa'],
        j: 0, k: 'indonesia',
        e: 'Berarti berbeda beda tetapi tetap satu.',
    },
    {
        t: 'Candi Borobudur terletak di provinsi mana?',
        p: ['Jawa Timur', 'Jawa Tengah', 'Yogyakarta', 'Jawa Barat'],
        j: 1, k: 'indonesia',
        e: 'Tepatnya di Kabupaten Magelang.',
    },
    {
        t: 'Senjata tradisional Rencong berasal dari daerah mana?',
        p: ['Aceh', 'Sumatera Utara', 'Lampung', 'Bengkulu'],
        j: 0, k: 'indonesia',
    },
    {
        t: 'Gunung tertinggi di Indonesia adalah?',
        p: ['Gunung Semeru', 'Gunung Kerinci', 'Puncak Jaya', 'Gunung Rinjani'],
        j: 2, k: 'indonesia',
        e: 'Berada di Pegunungan Jayawijaya, Papua.',
    },

    {
        t: 'Kongres Pemuda Kedua yang melahirkan Sumpah Pemuda diselenggarakan di kota mana?',
        p: ['Bandung', 'Surabaya', 'Batavia', 'Yogyakarta'],
        j: 2, k: 'sejarah',
        e: 'Batavia adalah nama Jakarta pada masa itu.',
    },
    {
        t: 'Organisasi Budi Utomo berdiri pada tanggal 20 Mei 1908 dan kini diperingati sebagai hari apa?',
        p: ['Hari Pahlawan', 'Hari Kebangkitan Nasional', 'Hari Pendidikan', 'Hari Sumpah Pemuda'],
        j: 1, k: 'sejarah',
    },
    {
        t: 'Siapa tokoh yang dikenal sebagai Bapak Pendidikan Nasional?',
        p: ['Ki Hajar Dewantara', 'Douwes Dekker', 'Cipto Mangunkusumo', 'Wahidin Sudirohusodo'],
        j: 0, k: 'sejarah',
        e: 'Hari lahirnya diperingati sebagai Hari Pendidikan Nasional.',
    },
    {
        t: 'Perjanjian Linggarjati ditandatangani antara Indonesia dengan negara mana?',
        p: ['Jepang', 'Inggris', 'Belanda', 'Amerika Serikat'],
        j: 2, k: 'sejarah',
    },
    {
        t: 'Serangan Umum 1 Maret 1949 terjadi di kota mana?',
        p: ['Jakarta', 'Yogyakarta', 'Bandung', 'Surakarta'],
        j: 1, k: 'sejarah',
        e: 'Membuktikan kepada dunia bahwa Indonesia masih ada.',
    },
    {
        t: 'Tari Saman berasal dari daerah mana?',
        p: ['Aceh', 'Sumatera Utara', 'Riau', 'Sumatera Selatan'],
        j: 0, k: 'indonesia',
    },
    {
        t: 'Selat yang memisahkan Pulau Jawa dan Pulau Sumatera adalah?',
        p: ['Selat Bali', 'Selat Sunda', 'Selat Madura', 'Selat Karimata'],
        j: 1, k: 'indonesia',
    },
    {
        t: 'Kain tradisional Ulos berasal dari suku apa?',
        p: ['Minang', 'Batak', 'Dayak', 'Bugis'],
        j: 1, k: 'indonesia',
    },
    {
        t: 'Ibu kota Provinsi Sulawesi Selatan adalah?',
        p: ['Manado', 'Palu', 'Makassar', 'Kendari'],
        j: 2, k: 'indonesia',
    },
    {
        t: 'Bunga bangkai raksasa yang menjadi puspa langka Indonesia bernama?',
        p: ['Melati', 'Rafflesia Arnoldii', 'Anggrek Bulan', 'Kantong Semar'],
        j: 1, k: 'indonesia',
        e: 'Ditemukan pertama kali di Bengkulu.',
    },
    {
        t: 'Pulau terbesar yang seluruhnya masuk wilayah Indonesia adalah?',
        p: ['Sumatera', 'Kalimantan', 'Papua', 'Sulawesi'],
        j: 0, k: 'indonesia',
        e: 'Kalimantan dan Papua terbagi dengan negara lain.',
    },

    // ========================================================
    //  KHUSUS GOKAIZEN
    // ========================================================
    //
    // Bagian ini WAJIB disesuaikan sendiri oleh staff, karena isinya
    // bergantung pada keadaan server. Soal di bawah hanya contoh bentuk,
    // periksa dan sesuaikan jawabannya sebelum lomba dimulai.

    {
        t: 'Berapa poin yang didapat setiap mengirim pesan di general untuk Member of the Month?',
        p: ['1 poin', '2 poin', '5 poin', '10 poin'],
        j: 1, k: 'gokaizen',
        e: 'Dua poin per pesan, paling banyak dua ratus poin per hari.',
    },
    {
        t: 'Berapa lama waktu di voice untuk mendapat satu poin Member of the Month?',
        p: ['1 menit', '5 menit', '10 menit', '15 menit'],
        j: 1, k: 'gokaizen',
        e: 'Satu poin setiap lima menit, dengan syarat ada minimal dua orang di channel.',
    },
    {
        t: 'Poin voice TIDAK dihitung apabila peserta berada dalam keadaan apa?',
        p: [
            'Mematikan mikrofon',
            'Sendirian di voice channel',
            'Sedang bermain game',
            'Tidak menyalakan kamera',
        ],
        j: 1, k: 'gokaizen',
        e: 'Harus ada minimal dua orang, sebab sendirian bukan kegiatan bersama.',
    },
    {
        t: 'Ada berapa kategori Member of the Month di GO KAIZEN?',
        p: ['Satu', 'Dua', 'Tiga', 'Empat'],
        j: 1, k: 'gokaizen',
        e: 'Kategori Voice dan kategori Chat, masing masing punya pemenang sendiri.',
    },
    {
        t: 'Berapa nominal donasi untuk mencapai tingkatan SOCIALITE?',
        p: ['Rp 25.000', 'Rp 35.000', 'Rp 50.000', 'Rp 100.000'],
        j: 1, k: 'gokaizen',
    },
    {
        t: 'Tingkatan dukungan tertinggi di GO KAIZEN bernama apa?',
        p: ['Socialite', 'Crazy Rich', 'Sultan', 'Booster'],
        j: 2, k: 'gokaizen',
    },
    {
        t: 'Berapa nominal donasi untuk mencapai tingkatan SULTAN?',
        p: ['Rp 250.000', 'Rp 500.000', 'Rp 750.000', 'Rp 1.000.000'],
        j: 2, k: 'gokaizen',
        e: 'Tertulis pada channel informasi donasi.',
    },
    {
        t: 'Berapa peringkat teratas yang ditampilkan pada papan leaderboard bulanan?',
        p: ['Lima', 'Sepuluh', 'Lima belas', 'Dua puluh'],
        j: 1, k: 'gokaizen',
        e: 'Sepuluh teratas tampil di papan, selebihnya lewat tombol.',
    },
    {
        t: 'Berapa banyak peringkat teratas yang mendapat role juara Member of the Month setiap kategori?',
        p: ['Satu', 'Dua', 'Tiga', 'Lima'],
        j: 2, k: 'gokaizen',
        e: 'Tiga teratas pada masing masing kategori.',
    },
    {
        t: 'Berapa batas poin obrolan yang bisa dikumpulkan dalam satu hari?',
        p: ['100 poin', '150 poin', '200 poin', 'Tidak dibatasi'],
        j: 2, k: 'gokaizen',
    },
    {
        t: 'Tombol pada papan peringkat menampilkan peringkat berapa sampai berapa?',
        p: ['5 sampai 15', '10 sampai 20', '11 sampai 30', '20 sampai 50'],
        j: 2, k: 'gokaizen',
        e: 'Tombolnya tertulis jelas pada papan peringkat.',
    },
    {
        t: 'Dua kategori Member of the Month di GO KAIZEN adalah?',
        p: ['Voice dan Chat', 'Voice dan Boost', 'Chat dan Donasi', 'Boost dan Donasi'],
        j: 0, k: 'gokaizen',
        e: 'Masing masing kategori punya papan dan pemenangnya sendiri.',
    },
    {
        t: 'Poin obrolan Member of the Month hanya dihitung di channel apa?',
        p: ['Semua channel', 'General', 'Channel donasi', 'Channel bebas'],
        j: 1, k: 'gokaizen',
        e: 'Hanya percakapan di general yang dihitung.',
    },
    {
        t: 'Pada papan leaderboard bulanan, selain poin, keterangan apa yang ikut ditampilkan?',
        p: ['Jumlah hari aktif', 'Lama waktu voice', 'Jumlah pesan', 'Tanggal bergabung'],
        j: 0, k: 'gokaizen',
        e: 'Jumlah hari aktif menjadi penentu bila ada peserta yang poinnya sama.',
    },
    {
        t: 'Menurut kebijakan donasi GO KAIZEN, benefit yang diterima berlaku untuk berapa akun Discord?',
        p: ['Satu akun', 'Dua akun', 'Tiga akun', 'Tidak dibatasi'],
        j: 0, k: 'gokaizen',
        e: 'Benefit tidak dapat dipindahtangankan ke akun lain.',
    },
];

// ============================================================
//  PENGAMBILAN SOAL
// ============================================================

// Komposisi soal setiap babak. Semakin tinggi babaknya, semakin banyak
// porsi soal tentang server, sehingga final benar benar dimenangkan
// anggota yang paling mengenal GO KAIZEN.
const KOMPOSISI = {
    penyisihan: { sejarah: 0.45, indonesia: 0.35, gokaizen: 0.20 },
    semifinal: { sejarah: 0.35, indonesia: 0.30, gokaizen: 0.35 },
    final: { sejarah: 0.25, indonesia: 0.25, gokaizen: 0.50 },
};

function acak(daftar) {
    const salinan = [...daftar];
    for (let i = salinan.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [salinan[i], salinan[j]] = [salinan[j], salinan[i]];
    }
    return salinan;
}

// Memeriksa apakah sebuah soal tersusun dengan benar
function soalSah(s) {
    return s
        && typeof s.t === 'string' && s.t.trim()
        && Array.isArray(s.p) && s.p.length === 4
        && s.p.every(x => typeof x === 'string' && x.trim())
        && Number.isInteger(s.j) && s.j >= 0 && s.j <= 3;
}

// Mengambil sejumlah soal untuk satu babak, dengan komposisi kategori
// yang sudah ditentukan. Soal yang sudah terpakai dapat dikecualikan
// agar tidak muncul dua kali dalam satu acara.
function ambilSoal(babak, jumlah, kecuali = []) {
    const dipakai = new Set(kecuali);
    const tersedia = SOAL.filter(s => soalSah(s) && !dipakai.has(s.t));

    const komposisi = KOMPOSISI[babak] || KOMPOSISI.penyisihan;
    const hasil = [];

    for (const [kategori, porsi] of Object.entries(komposisi)) {
        const target = Math.round(jumlah * porsi);
        const kumpulan = acak(tersedia.filter(s => s.k === kategori && !hasil.includes(s)));
        hasil.push(...kumpulan.slice(0, target));
    }

    // bila belum cukup, ditambal dari kategori mana pun
    if (hasil.length < jumlah) {
        const sisa = acak(tersedia.filter(s => !hasil.includes(s)));
        hasil.push(...sisa.slice(0, jumlah - hasil.length));
    }

    return acak(hasil).slice(0, jumlah);
}

// Ringkasan isi bank soal, dipakai command pemeriksaan
function ringkasanSoal() {
    const perKategori = {};
    let rusak = 0;

    for (const s of SOAL) {
        if (!soalSah(s)) { rusak += 1; continue; }
        perKategori[s.k] = (perKategori[s.k] || 0) + 1;
    }

    return { total: SOAL.length, sah: SOAL.length - rusak, rusak, perKategori };
}

// Memeriksa kecukupan bank soal untuk SELURUH babak sekaligus.
//
// Perhitungannya dijumlahkan, bukan diperiksa per babak, sebab peserta yang
// lolos sudah melihat soal babak sebelumnya. Mengulang soal akan memberi
// keuntungan yang tidak adil, jadi setiap soal hanya boleh dipakai sekali
// sepanjang acara.
function periksaKecukupan(babakConfig) {
    const ringkas = ringkasanSoal();
    const butuhTotal = {};

    for (const [nama, b] of Object.entries(babakConfig)) {
        const komposisi = KOMPOSISI[nama] || {};
        for (const [kategori, porsi] of Object.entries(komposisi)) {
            butuhTotal[kategori] = (butuhTotal[kategori] || 0) + Math.round(b.jumlahSoal * porsi);
        }
    }

    const kurang = [];
    for (const [kategori, butuh] of Object.entries(butuhTotal)) {
        const punya = ringkas.perKategori[kategori] || 0;
        if (punya < butuh) kurang.push({ kategori, butuh, punya, kurang: butuh - punya });
    }

    const totalButuh = Object.values(butuhTotal).reduce((a, b) => a + b, 0);

    return { kurang, butuhTotal, totalButuh, totalPunya: ringkas.sah };
}

module.exports = { SOAL, KOMPOSISI, ambilSoal, ringkasanSoal, periksaKecukupan, soalSah, acak };
