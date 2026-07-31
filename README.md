# GTL VR Learning - A-Frame + Capacitor

Project sederhana untuk aplikasi pembelajaran GTL berbasis video 360° dengan dua mode:

1. **Mode VR**
   - Tampilan split-screen: kiri dan kanan untuk headset Shinecon VR.
   - Kamera mengikuti giroskop HP melalui A-Frame `look-controls`.
   - Jawaban kuis dipilih menggunakan gaze cursor di tengah layar.

2. **Mode Mobile**
   - Tampilan video 360° satu layar penuh.
   - View diputar dengan drag.
   - Jawaban dipilih dengan tap.

## Struktur penting

```text
public/content\01-modul-gtl\scenarios.json  -> data video, kuis, jawaban, dan branching
public/videos/                 -> tempat file video 360° MP4
src/main.js                    -> logic mode, video, quiz, dan branching
src/style.css                  -> tampilan aplikasi
capacitor.config.json          -> konfigurasi Capacitor
```

## Cara menjalankan di browser

```bash
npm install
npm run dev
```

Buka:

```text
http://localhost:5173/
```

Jika ingin tes dari HP di jaringan WiFi yang sama, buka URL Network yang muncul di terminal, contoh:

```text
http://192.168.x.x:5173/
```

## Cara build web

```bash
npm run build
```

## Cara menambahkan Android Capacitor

Jalankan sekali saja:

```bash
npm run cap:add:android
```

Lalu setiap ada perubahan web:

```bash
npm run cap:sync
npm run cap:open
```

## Catatan penting

- Project ini **tidak meng-import A-Frame dari npm**. A-Frame dipanggil dari CDN di `index.html` agar tidak terjadi error bundling Vite.
- Jika video terlalu besar dan build Android gagal, gunakan video yang sudah dipotong per segmen atau simpan video di server/direct URL lalu ubah field `video` di `scenarios.json`.
- Untuk build Android dengan Gradle 8.2.x, gunakan JDK 17 agar tidak terkena error `Unsupported class file major version 65`.
