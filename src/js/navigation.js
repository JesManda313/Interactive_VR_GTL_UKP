// navigation.js: pindah layar dan masuk mode putar (dipakai home, settings, mode, dan kedua player).
import { store } from './store.js'; // activeModule/activeMode; navigasi reset state saat pindah layar.
import { applyCalibrationTarget } from './calibration.js'; // terapkan geser mata setelah scene kalibrasi dibuat.
import { clearScenes, playActiveVideos } from './video.js'; // bersihkan scene/video lama; playActiveVideos untuk gerbang panduan mobile.
import { buildCalibrationSceneHtml } from './scene-builders.js'; // bangun HTML A-Frame kalibrasi.
import { bindSceneEvents, lockLandscape, renderActiveScenario, setNavHandlers, unlockOrientation, cancelPendingRedirects } from './scenario.js'; // render engine + kunci orientasi + handler balik (setter agar tidak circular).
import { applyImageUris, applyLocalVideos } from './download-manager.js'; // petakan file lokal yang sudah diunduh ke scenario.video.
import { firstScenarioId, isUnlocked } from './progress.js'; // tentukan segmen mulai yang boleh dibuka.

// SCREEN_IDS: nama layar logis -> id DOM.
const SCREEN_IDS = {
  home: 'homeScreen',
  settings: 'settingsScreen',
  mode: 'modeScreen',
  download: 'downloadScreen',
  mobile: 'mobileScreen',
  vr: 'vrScreen',
};

// showScreen(name): sembunyikan semua layar lalu tampilkan satu layar target.
export function showScreen(name) {
  Object.values(SCREEN_IDS).forEach((id) => {
    document.getElementById(id)?.classList.add('hidden'); // guard null: satu id hilang tidak boleh menghentikan semua.
  });

  document.getElementById(SCREEN_IDS[name])?.classList.remove('hidden');

  // beri tahu pendengar (mis. timeline segmen) agar render ulang saat layar tampil.
  try {
    window.dispatchEvent(new CustomEvent(`${name}-screen-shown`));
  } catch { /* abaikan */ }
}

// backToModeSelection(): kembali ke layar pemilihan mode tanpa memutar video.
export function backToModeSelection() {
  store.activeMode = null; // tandai tidak sedang memutar agar polling remote berhenti.
  unlockOrientation();
  try {
    cancelPendingRedirects();
  } catch { /* abaikan */ }
  clearScenes(); // matikan video agar suara tidak jalan di background.
  closeStalePopups();
  showScreen('mode');
}

// backToModules(): kembali ke daftar modul dan reset state modul aktif.
export function backToModules() {
  store.activeModule = null; // reset semua agar modul berikutnya mulai bersih.
  store.scenarios = [];
  store.scenarioMap = new Map();
  store.activeScenarioId = null;
  store.activeMode = null;

  unlockOrientation();
  clearScenes();
  closeStalePopups();
  showScreen('home');
}

// closeStalePopups(): tutup popup fixed yang tidak ikut tersembunyi saat pindah layar.
function closeStalePopups() {
  store.awaitMobileGuide = false; // gerbang panduan ikut reset agar autoplay berikutnya tidak tertahan.
  for (const id of ['modePopup', 'remotePopup', 'mobileQuizPopup', 'mobileEndPopup', 'mobileGuideModal']) {
    document.getElementById(id)?.classList.add('hidden');
  }
}

// closeMobileGuide(): tutup modal panduan mobile dan putar video yang tertahan.
export function closeMobileGuide() {
  document.getElementById('mobileGuideModal')?.classList.add('hidden');
  if (store.awaitMobileGuide) {
    store.awaitMobileGuide = false;
    playActiveVideos();
  }
}

let mobileGuideWired = false; // wiring sekali saja agar listener tidak menumpuk tiap openMode.

// wireMobileGuideOnce(): pasang listener modal panduan mobile sekali setelah DOM tersedia.
function wireMobileGuideOnce() {
  if (mobileGuideWired) return;
  const modal = document.getElementById('mobileGuideModal');
  const closeBtn = document.getElementById('mobileGuideClose');
  const backBtn = document.getElementById('mobileGuideBack');
  if (!modal || !closeBtn) return; // HTML belum ada: coba lagi di openMode berikutnya.
  closeBtn.addEventListener('click', closeMobileGuide);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeMobileGuide(); // klik backdrop = tutup.
  });
  // kembali ke pilih mode tanpa memutar video.
  backBtn?.addEventListener('click', () => {
    store.awaitMobileGuide = false;
    document.getElementById('mobileGuideModal')?.classList.add('hidden');
    backToModeSelection();
  });
  mobileGuideWired = true;
}

// showMobileGuide(): tampilkan modal panduan dan tahan autoplay sampai user menekan "Mengerti".
function showMobileGuide() {
  wireMobileGuideOnce();
  const modal = document.getElementById('mobileGuideModal');
  if (!modal) {
    store.awaitMobileGuide = false; // modal tidak ada: jangan tahan video selamanya.
    return;
  }
  store.awaitMobileGuide = true; // tahan autoplay; dibersihkan oleh closeMobileGuide.
  try {
    document.querySelectorAll('.scenario-video').forEach((v) => v.pause());
  } catch { /* abaikan */ }
  modal.classList.remove('hidden');
}

// renderCalibrationScene(): render dua scene kalibrasi (kiri dan kanan) ke mount VR.
export function renderCalibrationScene() {
  const vrLeftMount = document.getElementById('vrLeftMount');
  const vrRightMount = document.getElementById('vrRightMount');

  vrLeftMount.innerHTML = buildCalibrationSceneHtml({ eye: 'left' });
  vrRightMount.innerHTML = buildCalibrationSceneHtml({ eye: 'right' });

  bindSceneEvents(vrLeftMount); // agar tombol Kembali di dunia 3D bisa diklik.
  bindSceneEvents(vrRightMount);
  applyCalibrationTarget('vr'); // setelah render: transform CSS butuh elemen sudah ada.
}

// openCalibrationScreen(): masuk ke mode kalibrasi khusus (bukan materi).
export function openCalibrationScreen() {
  store.activeModule = { id: '02-kalibrasi-vr', type: 'calibration' }; // modul palsu agar gaze.js/vr-player.js tahu ini kalibrasi.
  store.activeMode = 'vr';
  store.previousCalibrationButtons = []; // reset edge-detection tombol.
  clearScenes();
  showScreen('vr');
  lockLandscape();
  renderCalibrationScene();
}

// openMode(mode, startId): buka player VR/mobile untuk modul aktif, mulai dari segmen startId bila terbuka.
export async function openMode(mode, startId = null) {
  if (!store.activeModule || !store.scenarios.length) {
    alert('Pilih modul terlebih dahulu.');
    return;
  }

  const moduleId = store.activeModule.id;
  const wanted = typeof startId === 'string' && startId ? startId : null;
  const fallback = firstScenarioId(store.scenarios) ?? store.scenarios[0]?.id ?? null; // segmen pertama sebagai cadangan.
  const start = wanted && isUnlocked(moduleId, wanted, store.scenarios) ? wanted : fallback; // tolak segmen terkunci.

  store.activeMode = mode;
  store.activeScenarioId = start;
  store.shouldShowQuizImmediately = false; // reset flag kuis langsung.

  // petakan ulang media lokal (idempoten) untuk jalur yang melewatkan apply di home.js.
  try {
    await applyLocalVideos(store.scenarios);
    await applyImageUris(store.scenarios);
  } catch (error) {
    console.warn('Gagal memetakan media lokal saat masuk mode:', error?.message ?? error);
  }

  clearScenes();
  showScreen(mode === 'vr' ? 'vr' : 'mobile');
  if (mode === 'mobile') store.awaitMobileGuide = true; // sebelum render: autoplay dijadwalkan di dalamnya (setTimeout 400ms).
  await renderActiveScenario(); // tunggu render + transisi selesai.
  if (mode === 'mobile') showMobileGuide(); // modal tampil; video diputar saat "Mengerti" ditekan.
}

// daftarkan handler kembali ke scenario engine lewat setter agar tidak circular.
setNavHandlers({ backToModules, backToModeSelection });
