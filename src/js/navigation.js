/**
 * navigation.js — pindah layar & entry mode.
 * Dipakai home.html, settings.html, mode.html + world-back-button di kedua player.
 */
import { store } from './store.js';
import { applyCalibrationTarget } from './calibration.js';
import { clearScenes } from './video.js';
import { buildCalibrationSceneHtml } from './scene-builders.js';
import { bindSceneEvents, renderActiveScenario, setNavHandlers } from './scenario.js';

const SCREEN_IDS = {
  home: 'homeScreen',
  settings: 'settingsScreen',
  mode: 'modeScreen',
  mobile: 'mobileScreen',
  vr: 'vrScreen',
};

/**
 * Ganti layar yang terlihat ke screen bernama `name`.
 * Menyembunyikan semua screen yang diketahui lalu menampilkan yang dipilih.
 * @param {'home'|'settings'|'mode'|'mobile'|'vr'} name
 */
export function showScreen(name) {
  Object.values(SCREEN_IDS).forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });

  document.getElementById(SCREEN_IDS[name])?.classList.remove('hidden');
}

/** Kembali ke layar pemilihan mode (tetap di modul yang sama). */
export function backToModeSelection() {
  store.activeMode = null;
  clearScenes();
  showScreen('mode');
}

/** Kembali ke daftar modul (reset modul dan skenario aktif). */
export function backToModules() {
  store.activeModule = null;
  store.scenarios = [];
  store.scenarioMap = new Map();
  store.activeScenarioId = null;
  store.activeMode = null;

  clearScenes();
  showScreen('home');
}

export function renderCalibrationScene() {
  document.getElementById('vrScenarioTitle').textContent = 'Kalibrasi Headset VR';

  const vrLeftMount = document.getElementById('vrLeftMount');
  const vrRightMount = document.getElementById('vrRightMount');

  vrLeftMount.innerHTML = buildCalibrationSceneHtml({ eye: 'left' });
  vrRightMount.innerHTML = buildCalibrationSceneHtml({ eye: 'right' });

  bindSceneEvents(vrLeftMount);
  bindSceneEvents(vrRightMount);
  applyCalibrationTarget('vr');
}

export function openCalibrationScreen() {
  store.activeModule = { id: '02-kalibrasi-vr', type: 'calibration' };
  store.activeMode = 'vr';
  store.previousCalibrationButtons = [];
  clearScenes();
  showScreen('vr');
  renderCalibrationScene();
}

/**
 * Buka mode pemutaran ('vr' atau 'mobile') untuk modul yang aktif.
 * Memastikan skenario tersedia, reset state, dan render skenario pertama.
 */
export async function openMode(mode) {
  if (!store.activeModule || !store.scenarios.length) {
    alert('Pilih modul terlebih dahulu.');
    return;
  }

  store.activeMode = mode;
  store.activeScenarioId = store.scenarios[0]?.id ?? null;
  store.shouldShowQuizImmediately = false;

  clearScenes();
  showScreen(mode === 'vr' ? 'vr' : 'mobile');
  await renderActiveScenario();
}

// Daftarkan handler navigasi ke scenario engine (untuk world-back-button).
// Berjalan saat modul ini di-import — selalu sebelum scene sempat di-render.
setNavHandlers({ backToModules, backToModeSelection });
