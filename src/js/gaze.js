/**
 * gaze.js — VR remote via gaze cursor raycaster.
 * Dipakai vr-player.html (+ debug click di main.js).
 *
 * UNTUK APA FILE INI?
 * Saat user pakai kacamata VR + remote bluetooth, tidak ada mouse/touch.
 * Cara pilih jawaban: arahkan pandangan (gaze cursor = titik tengah layar) ke opsi,
 * lalu tekan tombol remote -> fungsi triggerSelectFromGaze() mengecek "apa yang sedang
 * ditatap" via raycaster A-Frame, lalu klik secara programatis.
 */
import { handleOption, startVrPlayback } from './scenario.js'; // untuk jawab kuis + tombol START VR. KENAPA import? Agar klik remote = aksi beneran (logika tetap di scenario.js).
import { backToModeSelection, backToModules } from './navigation.js'; // untuk tombol kembali dunia.
import { store } from './store.js'; // untuk cek apakah sedang di modul kalibrasi.

/**
 * findGazeCursors(root=document):
 * Untuk apa? Kembalikan array semua elemen kursor gaze di dalam root.
 * KENAPA query .gaze-cursor? Di VR ada 2 scene (kiri+kanan) -> ada 2 cursor. Harus cek keduanya.
 * KENAPA default root=document? Agar bisa dipanggil tanpa argumen untuk cek global,
 * tapi tetap bisa dibatasi ke 1 mount saat testing.
 */
export function findGazeCursors(root = document) {
  if (!root) return []; // jaga-jaga root null -> array kosong agar loop aman.
  return Array.from(root.querySelectorAll('.gaze-cursor')); // Array.from KENAPA? NodeList -> Array agar bisa for..of + .length.
}

/**
 * triggerSelectFromGaze(event):
 * Untuk apa? Trigger pemilihan berdasarkan gaze cursor (dipanggil saat tombol remote ditekan).
 * Mencari elemen yang sedang di-intersect oleh raycaster:
 * - .quiz-option (atau anaknya) -> handleOption (jawab kuis)
 * - .world-back-button (atau anaknya) -> kembali (mode / daftar modul)
 * - .vr-start-gate (atau anaknya) -> startVrPlayback (mulai video VR)
 *
 * ALUR PER BARIS:
 * 1. Cari semua cursor. Bila tidak ada -> warn + return (tidak ada yang bisa diklik).
 * 2. Untuk tiap cursor: cek apakah punya components.raycaster (A-Frame sudah init?).
 *    KENAPA cek? Scene baru dibuat butuh waktu init; kalau dipaksa baca intersectedEls bisa undefined.
 * 3. Ambil intersectedEls[0] = objek 3D paling depan yang kena tatapan.
 * 4. Naik ke parent sampai ketemu .quiz-option / .world-back-button KENAPA while?
 *    Karena raycaster bisa kena anak (teks/gambar di dalam opsi), bukan container opsinya langsung.
 * 5. Kalau opsi -> handleOption. Kalau back -> backToModules/backToModeSelection.
 */
export function triggerSelectFromGaze(event) {
  const cursors = findGazeCursors();

  if (!cursors.length) {
    console.warn('[VR Remote] Tidak ada gaze cursor ditemukan.');
    return;
  }

  for (const cursor of cursors) { // loop KENAPA? Cek mata kiri dulu, kalau tidak kena baru mata kanan.
    if (!cursor.components || !cursor.components.raycaster) {
      continue; // A-Frame belum siap -> skip cursor ini.
    }

    const intersectedEls = cursor.components.raycaster.intersectedEls || []; // daftar objek yang kena sinar tatapan.
    console.log('[VR Remote] cursor', cursor, 'intersectedEls', intersectedEls.length);

    // DIAGNOSTIK sementara: identifikasi persis objek yang kena bidikan.
    // Hapus blok ini setelah kasus remote terpecahkan.
    // KENAPA ada? Saat debug remote susah tahu "user lagi menatap apa". Log ini menampilkan tag/posisi 3 teratas.
    intersectedEls.slice(0, 3).forEach((el, i) => {
      let sceneId = '';
      try {
        sceneId = el.closest?.('a-scene')?.id ?? ''; // sceneId KENAPA? Untuk tahu ini mata kiri atau kanan.
      } catch { /* abaikan */ }
      console.log(`[VR Remote] DIAG hit[${i}]:`, {
        tag: el.tagName,
        cls: el.className,
        visible: el.getAttribute?.('visible'),
        pos: el.getAttribute?.('position'),
        scene: sceneId,
        dataset: { ...el.dataset }, // dataset KENAPA? Berisi data-option-index/next/consequence untuk verifikasi.
      });
    });

    const hit = intersectedEls[0]; // ambil yang paling depan saja.
    if (!hit) {
      continue; // cursor ini tidak menatap apa-apa -> coba cursor mata sebelahnya.
    }

    let target = hit;
    while ( // naik ke atas sampai ketemu container yang bisa diklik.
      target
      && !target.classList.contains('quiz-option')
      && !target.classList.contains('world-back-button')
      && !target.classList.contains('vr-start-gate')
    ) {
      target = target.parentElement;
    }

    if (target && target.classList.contains('quiz-option')) {
      console.log('[VR Remote] opsi ditemukan:', target.dataset.optionIndex, target.dataset.next, target.dataset.consequence);
      handleOption(target); // jawab kuis dengan elemen yang ditemukan.
      return; // return KENAPA? Sudah dapat 1 aksi, jangan lanjut ke cursor lain (hindari dobel jawab).
    }

    if (target && target.classList.contains('world-back-button')) {
      console.log('[VR Remote] tombol kembali ditemukan, kembali...');
      if (store.activeModule?.type === 'calibration') { // kalibrasi -> kembali ke daftar modul (bukan ke pilih mode).
        backToModules(); // KENAPA beda? Modul kalibrasi tidak punya pilih mode, langsung ke home.
      } else {
        backToModeSelection();
      }
      return;
    }

    if (target && target.classList.contains('vr-start-gate')) {
      console.log('[VR Remote] gerbang START ditemukan, memutar video...');
      startVrPlayback(); // tutup gate + play (guard mode VR ada di dalamnya).
      return;
    }
  }

  console.warn('[VR Remote] Tidak menemukan opsi quiz / tombol kembali / gerbang START di gaze cursor. Pastikan kursor mengarah ke target.');
}
