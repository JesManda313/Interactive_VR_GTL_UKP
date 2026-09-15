/**
 * home.js — logic for home.html (#homeScreen).
 * Owns: module list fetch + render + open module.
 * Cross-page actions delegate to navigation.js / scenario.js.
 */
import { MODULES_URL, store } from './store.js';
import { safeText } from './utils.js';
import { loadScenarios } from './scenario.js';
import { openCalibrationScreen, showScreen } from './navigation.js';

/** Ambil manifest modul dari server dan render daftar modul. */
export async function loadModules() {
  const response = await fetch(MODULES_URL);

  if (!response.ok) {
    throw new Error('Gagal membaca modules.json');
  }

  store.modules = await response.json();
  renderModuleList();
}

/**
 * Render daftar modul ke dalam UI. Setiap modul menjadi sebuah tombol.
 * Menggunakan `safeText` untuk mencegah penyisipan HTML yang tidak aman.
 */
export function renderModuleList() {
  const moduleList = document.getElementById('moduleList');
  if (!moduleList) return;

  if (!store.modules.length) {
    moduleList.innerHTML = '<p>Belum ada modul tersedia.</p>';
    return;
  }

  moduleList.innerHTML = store.modules
    .map((module, index) => {
      const isCalibration = module.type === 'calibration';
      return `
        <button class="module-card recommendation-card" data-module-id="${safeText(module.id)}" data-index="${String(index + 1).padStart(2, '0')}">
          <span class="module-card-art" aria-hidden="true">${isCalibration ? '⌁' : '360°'}</span>
          <div class="module-body">
            <strong>${safeText(module.title)}</strong>
            <p>${safeText(module.subtitle ?? module.description ?? '')}</p>
            <small>
              ${isCalibration ? 'Pengaturan mata kiri dan kanan' : `${safeText(module.totalSegments ?? '-')} segmen • ${safeText(module.totalDecisionPoints ?? '-')} decision point`}
            </small>
          </div>
          <span class="module-arrow">→</span>
        </button>
      `;
    })
    .join('');

  moduleList.querySelectorAll('.module-card').forEach((button) => {
    button.addEventListener('click', () => {
      openModule(button.dataset.moduleId);
    });
  });
}

/**
 * Buka modul berdasarkan id: set active module, perbarui UI mode.html,
 * muat skenarionya, lalu tampilkan pilihan mode.
 */
export async function openModule(moduleId) {
  const selectedModule = store.modules.find((module) => module.id === moduleId);

  if (!selectedModule) {
    alert('Modul tidak ditemukan.');
    return;
  }

  store.activeModule = selectedModule;

  if (store.activeModule.type === 'calibration') {
    openCalibrationScreen();
    return;
  }

  document.getElementById('selectedModuleTitle').textContent = store.activeModule.title;
  document.getElementById('selectedModuleDescription').textContent =
    store.activeModule.description ?? store.activeModule.subtitle ?? '-';
  document.getElementById('selectedModuleSegments').textContent =
    `${store.activeModule.totalSegments ?? '-'} segmen`;
  document.getElementById('selectedModuleDecisions').textContent =
    `${store.activeModule.totalDecisionPoints ?? '-'} decision point`;

  await loadScenarios(store.activeModule.scenarioUrl);

  showScreen('mode');
}

/** Wire tombol-tombol milik home.html. */
export function initHome() {
  document.getElementById('openSettingsButton')?.addEventListener('click', () => {
    openCalibrationScreen();
  });
}
