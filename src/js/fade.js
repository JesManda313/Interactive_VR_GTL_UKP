/**
 * fade.js — fade transition overlay (no imports).
 * Dipakai mobile-player.html + vr-player.html.
 *
 * UNTUK APA FILE INI?
 * Mengatur layar hitam transparan yang memudar (fade) saat pindah segmen video.
 * Tujuannya agar transisi tidak "kaget" (langsung ganti kasar), tapi halus seperti bioskop.
 * No imports KENAPA? Agar bisa dipakai scenario.js tanpa circular import.
 */

/**
 * getFadeOverlay(mode):
 * Untuk apa? Ambil elemen overlay fade sesuai mode ('mobile' atau 'vr').
 * - mode 'mobile' -> kembalikan 1 elemen (#mobileFadeOverlay). KENAPA getElementById?
 *   Karena mobile hanya 1 layar, cukup 1 overlay.
 * - mode 'vr' -> kembalikan ARRAY beberapa elemen (.vr-fade-panel kiri/kanan).
 *   KENAPA array? Karena VR punya 2 mata (2 panel), keduanya harus di-fade bersamaan.
 * - selain itu -> null. KENAPA? Agar pemanggil tahu mode tidak valid dan tidak crash.
 */
export function getFadeOverlay(mode) {
  if (mode === 'mobile') {
    return document.getElementById('mobileFadeOverlay');
  }

  if (mode === 'vr') {
    return [...document.querySelectorAll('.vr-fade-panel')]; // spread ... KENAPA? Ubah NodeList jadi Array agar bisa .forEach/.map.
  }

  return null;
}

/**
 * setFadeMessage(mode, message):
 * Untuk apa? Set pesan teks pada overlay fade (mis. "Masuk ke: Segmen 2") dan aktifkan overlay.
 * - getFadeOverlays(mode) -> normalisasi jadi array (lihat bawah). KENAPA? Agar kode bawah
 *   tidak perlu if-else tunggal vs jamak, cukup loop.
 * - overlay.querySelector('.fade-message') -> cari tulisan di dalam overlay. KENAPA?
 *   Karena overlay berisi <p class="fade-message"> untuk judul segmen.
 * - overlay.classList.add('active') -> tampilkan overlay. KENAPA? CSS .active mengatur visibility.
 */
export function setFadeMessage(mode, message) {
  const overlays = getFadeOverlays(mode);

  overlays.forEach((overlay) => {
    const textEl = overlay.querySelector('.fade-message');
    if (textEl) textEl.textContent = message; // if KENAPA? Jaga-jaga kalau struktur HTML berubah, tidak crash.
    overlay.classList.add('active');
  });
}

/**
 * getFadeOverlays(mode):
 * Untuk apa? Normalisasi nilai overlay menjadi array (selalu mengembalikan array).
 * KENAPA perlu? getFadeOverlay kadang return 1 elemen, kadang array, kadang null.
 * Dengan selalu jadi array, pemanggil (fadeOverlay) bisa tulis 1 pola loop saja, lebih aman.
 */
export function getFadeOverlays(mode) {
  const overlay = getFadeOverlay(mode);
  if (!overlay) return []; // null -> [] KENAPA? Agar .forEach di pemanggil tidak error.
  return Array.isArray(overlay) ? overlay : [overlay]; // tunggal -> [tunggal]. KENAPA? Samakan bentuk.
}

/**
 * fadeOverlay(mode, opacity):
 * Untuk apa? Lakukan transisi fade pada overlay (opacity = 0 transparan / 1 hitam).
 * Mengembalikan Promise yang ter-resolve saat transisi selesai atau timeout.
 * KENAPA Promise? Agar scenario.js bisa `await fadeOverlay(...,1)` -> tunggu gelap dulu,
 * baru ganti video, lalu `await fadeOverlay(...,0)` -> terang lagi. Urutan terjamin.
 */
export function fadeOverlay(mode, opacity) {
  return new Promise((resolve) => { // Promise KENAPA? Transisi CSS itu async (butuh waktu), jadi bungkus agar bisa await.
    const overlays = getFadeOverlays(mode); // ambil semua panel relevan.
    if (!overlays.length) { // tidak ada overlay -> langsung selesai. KENAPA? Agar tidak hang menunggu event yang tak ada.
      resolve();
      return;
    }

    // toggle 'active' KENAPA? Kelas CSS .active mengontrol display/pointer-events,
    // sedangkan opacity diatur via style di bawah. Dua-duanya perlu agar tidak bisa diklik saat gelap.
    overlays.forEach((overlay) => {
      overlay.classList.toggle('active', opacity === 1);
    });

    // handleTransitionEnd: resolve saat animasi opacity selesai. KENAPA dengar 'transitionend'?
    // Agar await benar-benar menunggu animasi CSS selesai, bukan asal timeout.
    const handleTransitionEnd = (event) => {
      if (event.propertyName === 'opacity') { // cek propertyName KENAPA? Karena 1 elemen bisa punya banyak transisi, hanya opacity yang relevan.
        overlays.forEach((overlay) => {
          overlay.removeEventListener('transitionend', handleTransitionEnd); // hapus listener KENAPA? Agar tidak bocor memori / resolve dobel.
        });
        resolve();
      }
    };

    overlays.forEach((overlay) => {
      overlay.addEventListener('transitionend', handleTransitionEnd);
    });
    // requestAnimationFrame KENAPA? Agar perubahan opacity terjadi di frame berikutnya,
    // sehingga browser sempat mendeteksi perubahan dan menjalankan animasi (kalau langsung, animasi bisa skip).
    requestAnimationFrame(() => {
      overlays.forEach((overlay) => {
        overlay.style.opacity = opacity.toString(); // toString KENAPA? style.opacity butuh string.
      });
    });

    // setTimeout 2000 sebagai pengaman (fallback). KENAPA? Kalau event transitionend tidak pernah datang
    // (mis. tab hidden, CSS dimatikan), Promise tetap resolve setelah 2 detik agar app tidak macet selamanya.
    setTimeout(() => {
      overlays.forEach((overlay) => {
        overlay.removeEventListener('transitionend', handleTransitionEnd);
      });
      resolve();
    }, 2000);
  });
}

/**
 * getTransitionMessage(scenario):
 * Untuk apa? Buat pesan transisi singkat berdasarkan tipe skenario (untuk overlay fade).
 * - !scenario -> '' KENAPA? Jaga-jaga data kosong, jangan tampil "undefined".
 * - type consequence -> "Konsekuensi: ..." KENAPA dibedakan? Agar user paham ini akibat jawaban salah,
 *   bukan materi baru. Aspek pedagogis.
 * - else -> "Masuk ke: ..." untuk linear/decision/end.
 * - async KENAPA padahal tidak ada await? Agar konsisten return Promise (pemanggil pakai await),
 *   dan siap jika nanti pesan perlu fetch/async.
 */
export async function getTransitionMessage(scenario) {
  if (!scenario) {
    return '';
  }

  const title = scenario.title || 'Segmen baru'; // fallback KENAPA? Agar selalu ada teks walau JSON lupa isi title.
  if (scenario.type === 'consequence') {
    return `Konsekuensi: ${title}`;
  }

  return `Masuk ke: ${title}`;
}
