/**
 * navigation.js — pindah layar & entry mode.
 * Dipakai home.html, settings.html, mode.html + world-back-button di kedua player.
 *
 * UNTUK APA FILE INI?
 * Satu pintu untuk pindah halaman (showScreen) dan masuk mode putar (openMode).
 * KENAPA dipusatkan? Agar tidak ada 5 versi fungsi "kembali" yang beda perilaku.
 * Semua tombol kembali memanggil fungsi di sini.
 */
import { store } from './store.js'; // baca/tulis activeModule/activeMode. KENAPA? Navigasi harus reset state saat pindah.
import { applyCalibrationTarget } from './calibration.js'; // terapkan geser mata setelah scene kalibrasi dibuat.
import { clearScenes, playActiveVideos } from './video.js'; // bersihkan video/scene lama sebelum pindah. KENAPA? Cegah suara dobel + memori bocor. playActiveVideos untuk gerbang panduan mobile.
import { buildCalibrationSceneHtml } from './scene-builders.js'; // bangun HTML A-Frame kalibrasi.
import { bindSceneEvents, lockLandscape, renderActiveScenario, setNavHandlers, unlockOrientation, cancelPendingRedirects } from './scenario.js'; // render engine + kunci orientasi + daftarkan handler balik (hindari circular via setter).
import { applyImageUris, applyLocalVideos } from './download-manager.js'; // petakan file lokal yang sudah diunduh ke scenario.video.
import { firstScenarioId, isUnlocked } from './progress.js'; // tentukan segmen mulai yang boleh dibuka.

// SCREEN_IDS: Untuk apa? Petakan nama logis ('home') -> id DOM ('homeScreen').
// KENAPA object? Agar showScreen('home') tidak perlu hafal id HTML; kalau id HTML berubah cukup ubah di sini.
const SCREEN_IDS = {
  home: 'homeScreen',
  settings: 'settingsScreen',
  mode: 'modeScreen',
  download: 'downloadScreen',
  mobile: 'mobileScreen',
  vr: 'vrScreen',
};

/**
 * showScreen(name):
 * Untuk apa? Ganti layar yang terlihat ke screen bernama `name`.
 * - Sembunyikan semua screen yang diketahui lalu tampilkan yang dipilih (tambah/hapus .hidden).
 *   KENAPA sembunyikan semua dulu? Karena app ini SPA 1 halaman (semua layar ada di DOM sekaligus),
 *   hanya 1 yang boleh terlihat.
 * - Dispatch event `${name}-screen-shown` KENAPA? Beri tahu pendengar (mis. timeline segmen di mode.js)
 *   agar me-render ulang saat layarnya tampil — tanpa import silang antar-modul halaman.
 * @param {'home'|'settings'|'mode'|'download'|'mobile'|'vr'} name
 */
export function showScreen(name) {
  Object.values(SCREEN_IDS).forEach((id) => {
    document.getElementById(id)?.classList.add('hidden'); // ?. KENAPA? 1 id hilang jangan crash semua.
  });

  document.getElementById(SCREEN_IDS[name])?.classList.remove('hidden');

  // Beri tahu pendengar (mis. timeline segmen di mode.js) agar me-render
  // ulang saat layarnya tampil — tanpa import silang antar-modul halaman.
  try {
    window.dispatchEvent(new CustomEvent(`${name}-screen-shown`));
  } catch { /* abaikan */ }
}

/**
 * backToModeSelection():
 * Untuk apa? Kembali ke layar pemilihan mode (tetap di modul yang sama).
 * - activeMode=null KENAPA? Tandai "tidak sedang memutar" agar polling remote berhenti bereaksi.
 * - clearScenes() KENAPA? Matikan video agar suara tidak jalan terus di background.
 */
export function backToModeSelection() {
  store.activeMode = null;
  unlockOrientation();
  try {
    cancelPendingRedirects();
  } catch { /* abaikan */ }
  clearScenes();
  closeStalePopups();
  showScreen('mode');
}

/**
 * backToModules():
 * Untuk apa? Kembali ke daftar modul (reset modul dan skenario aktif).
 * KENAPA reset semua (module, scenarios, map, id, mode)? Agar buka modul berikutnya mulai bersih,
 * tidak kebawa data modul lama (bug umum: video lama ikut ke-render).
 */
export function backToModules() {
  store.activeModule = null;
  store.scenarios = [];
  store.scenarioMap = new Map();
  store.activeScenarioId = null;
  store.activeMode = null;

  unlockOrientation();
  clearScenes();
  closeStalePopups();
  showScreen('home');
}

// closeStalePopups(): Untuk apa? Pastikan tidak ada popup/quiz yang nyangkut
// terlihat setelah pindah layar. KENAPA? Popup fixed (mode/remote/quiz) hidup di
// luar screen yang di-hidden, jadi showScreen saja tidak menutupnya.
function closeStalePopups() {
  store.awaitMobileGuide = false; // gerbang panduan ikut reset agar autoplay berikutnya tidak tertahan.
  for (const id of ['modePopup', 'remotePopup', 'mobileQuizPopup', 'mobileEndPopup', 'mobileGuideModal']) {
    document.getElementById(id)?.classList.add('hidden');
  }
}

// closeMobileGuide(): Untuk apa? Satu-satunya fungsi penutup modal panduan mobile.
// KENAPA fungsi tunggal? Agar tombol, klik backdrop, dan tombol kembali semua memanggil
// jalur yang sama — tidak ada state ganda yang bisa bikin stuck.
// KENAPA putar video di sini? Modal ini gerbang blokir: video di-pause selama modal
// terbuka (lihat awaitMobileGuide), jadi penutupan = sinyal "user siap, putar sekarang".
export function closeMobileGuide() {
  document.getElementById('mobileGuideModal')?.classList.add('hidden');
  if (store.awaitMobileGuide) {
    store.awaitMobileGuide = false;
    playActiveVideos();
  }
}

let mobileGuideWired = false; // wiring sekali saja. KENAPA? openMode dipanggil tiap segmen; tanpa flag, listener tombol menumpuk.

// wireMobileGuideOnce(): Untuk apa? Pasang listener tombol + backdrop + kembali sekali setelah DOM ada.
// KENAPA di sini (bukan init)? mobile-player.html di-inject via ?raw saat start; wiring di openMode
// menjamin elemen sudah ada. KENAPA guard flag? Agar tidak dobel listener tiap buka mode.
function wireMobileGuideOnce() {
  if (mobileGuideWired) return;
  const modal = document.getElementById('mobileGuideModal');
  const closeBtn = document.getElementById('mobileGuideClose');
  const backBtn = document.getElementById('mobileGuideBack');
  if (!modal || !closeBtn) return; // HTML belum ada -> coba lagi di openMode berikutnya, jangan crash.
  closeBtn.addEventListener('click', closeMobileGuide);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeMobileGuide(); // klik area gelap = tutup + putar.
  });
  // Jalan keluar darurat anti-stuck: kalau user tidak mau lanjut, kembali ke pilih
  // mode tanpa memutar video (flag dibersihkan agar autoplay tidak nyangkut).
  backBtn?.addEventListener('click', () => {
    store.awaitMobileGuide = false;
    document.getElementById('mobileGuideModal')?.classList.add('hidden');
    backToModeSelection();
  });
  mobileGuideWired = true;
}

// showMobileGuide(): Untuk apa? Gerbang blokir tiap masuk mobile mode: modal tampil
// dulu, video di-pause (renderActiveScenario menahan autoplay via awaitMobileGuide),
// dan video baru diputar saat user tekan "Mengerti, mulai" (closeMobileGuide).
// KENAPA tiap masuk (bukan sekali)? User bisa lupa cara menjawab/drag/gyro.
function showMobileGuide() {
  wireMobileGuideOnce();
  const modal = document.getElementById('mobileGuideModal');
  if (!modal) {
    store.awaitMobileGuide = false; // modal tidak ada -> jangan tahan video selamanya.
    return;
  }
  store.awaitMobileGuide = true; // tahan autoplay; dibersihkan oleh closeMobileGuide.
  try {
    document.querySelectorAll('.scenario-video').forEach((v) => v.pause());
  } catch { /* abaikan */ }
  modal.classList.remove('hidden');
}

// renderCalibrationScene(): Untuk apa? Render 2 scene kalibrasi (kiri+kanan) ke mount VR.
// - buildCalibrationSceneHtml({eye}) KENAPA panggil 2x? VR butuh 2 <a-scene> (1 per mata).
// - bindSceneEvents KENAPA? Agar tombol Kembali di dunia 3D bisa diklik.
// - applyCalibrationTarget('vr') KENAPA setelah render? Transform CSS hanya bisa diterapkan setelah elemen ada.
export function renderCalibrationScene() {
  const vrLeftMount = document.getElementById('vrLeftMount');
  const vrRightMount = document.getElementById('vrRightMount');

  vrLeftMount.innerHTML = buildCalibrationSceneHtml({ eye: 'left' });
  vrRightMount.innerHTML = buildCalibrationSceneHtml({ eye: 'right' });

  bindSceneEvents(vrLeftMount);
  bindSceneEvents(vrRightMount);
  applyCalibrationTarget('vr');
}

// openCalibrationScreen(): Untuk apa? Masuk ke mode kalibrasi khusus (bukan materi).
// - activeModule={id:'02-kalibrasi-vr', type:'calibration'} KENAPA modul palsu? Agar gaze.js & vr-player.js
//   tahu "ini mode kalibrasi" dan ubah perilaku tombol (confirm = kembali, bukan jawab kuis).
export function openCalibrationScreen() {
  store.activeModule = { id: '02-kalibrasi-vr', type: 'calibration' };
  store.activeMode = 'vr';
  store.previousCalibrationButtons = []; // reset edge-detection tombol.
  clearScenes();
  showScreen('vr');
  lockLandscape();
  renderCalibrationScene();
}

/**
 * openMode(mode, startId=null):
 * Untuk apa? Buka mode pemutaran ('vr' atau 'mobile') untuk modul yang aktif.
 * startId opsional: mulai dari segmen itu bila terbuka menurut progres;
 * selain itu (atau bila terkunci) jatuh ke segmen pertama.
 * - Cek activeModule/scenarios KENAPA? Jangan buka player kosong (akan error render).
 * - isUnlocked() KENAPA? Cegah user loncat via console ke segmen terkunci.
 * - applyLocalVideos/applyImageUris KENAPA dipanggil lagi di sini? Jaminan: petakan ulang video + gambar lokal
 *   yang sudah terunduh (menutup celah bila player dibuka lewat jalur yang melewatkan apply di home.js). Idempoten + ter-cache.
 */
export async function openMode(mode, startId = null) {
  if (!store.activeModule || !store.scenarios.length) {
    alert('Pilih modul terlebih dahulu.');
    return;
  }

  const moduleId = store.activeModule.id;
  const wanted = typeof startId === 'string' && startId ? startId : null; // pastikan string non-kosong, else null.
  const fallback = firstScenarioId(store.scenarios) ?? store.scenarios[0]?.id ?? null; // segmen pertama sebagai aman.
  const start = wanted && isUnlocked(moduleId, wanted, store.scenarios) ? wanted : fallback; // pakai wanted bila boleh, else fallback.

  store.activeMode = mode;
  store.activeScenarioId = start;
  store.shouldShowQuizImmediately = false; // reset flag kuis langsung.

  // Jaminan: petakan ulang video + gambar lokal yang sudah terunduh ke
  // objek skenario yang akan di-render (menutup celah bila player dibuka
  // lewat jalur yang melewatkan apply di home.js). Idempoten + ter-cache.
  try {
    await applyLocalVideos(store.scenarios);
    await applyImageUris(store.scenarios);
  } catch (error) {
    console.warn('Gagal memetakan media lokal saat masuk mode:', error?.message ?? error);
  }

  clearScenes();
  showScreen(mode === 'vr' ? 'vr' : 'mobile');
  // Gerbang blokir mobile: pasang flag SEBELUM render. KENAPA harus sebelum?
  // renderActiveScenario menjadwalkan autoplay (setTimeout 400ms) di dalamnya —
  // kalau flag dipasang setelah await render, jadwal itu sudah terlanjur dibuat
  // dan video tetap jalan sendiri di belakang modal (bug kemarin).
  if (mode === 'mobile') store.awaitMobileGuide = true;
  await renderActiveScenario(); // render segmen pertama. KENAPA await? Tunggu fade/transisi selesai.
  if (mode === 'mobile') showMobileGuide(); // tampilkan modal; video diputar saat "Mengerti" ditekan.
}

// Daftarkan handler navigasi ke scenario engine (untuk world-back-button).
// Berjalan saat modul ini di-import — selalu sebelum scene sempat di-render.
// KENAPA via setNavHandlers (bukan import langsung)? Agar scenario.js tidak import navigation.js
// dan navigation.js import scenario.js (circular). Solusi: scenario sediakan setter, navigation isi belakangan.
setNavHandlers({ backToModules, backToModeSelection });
