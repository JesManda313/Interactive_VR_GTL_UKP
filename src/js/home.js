// home.js — tampilkan daftar modul dari modules.json dan buka modul yang diklik.
import { MODULES_URL, store } from './store.js'; // URL JSON + memori global.
import { safeText, showToast } from './utils.js'; // escape HTML agar judul aman.
import { loadScenarios } from './scenario.js'; // muat scenarios.json modul terpilih.
import { applyImageUris, applyLocalVideos, collectImageRemotes, getDownloadProgress, isDownloading, missingRemotes, overlayImagesResolved, purgeOrphanDownloads, runDownloadFlow } from './download-manager.js'; // cek/petakan file lokal hasil unduhan.
import { backToModules, openCalibrationScreen, showScreen } from './navigation.js'; // pindah layar.
import { confirmRemoteBeforeVr } from './remote-gate.js'; // gerbang remote BT sebelum kalibrasi VR.

// loadModules(): ambil manifest modul dari server lalu render daftar.
// Dari server agar daftar bisa diubah tanpa rebuild APK; error dilempar agar main.js bisa alert.
export async function loadModules() {
  const response = await fetch(MODULES_URL);

  if (!response.ok) {
    throw new Error('Gagal membaca modules.json');
  }

  store.modules = await response.json();
  renderModuleList(); // langsung tampilkan setelah data datang.
}

// renderModuleList(): render kartu modul (judul di-escape safeText) + filter kata kunci.
// Dibangun sekali via map().join('') agar hanya 1x innerHTML, lalu listener dipasang per kartu.
export function renderModuleList(query = '') {
  const moduleList = document.getElementById('moduleList');
  if (!moduleList) return; // HTML belum ada (mis. test) -> jangan crash.

  if (!store.modules.length) {
    moduleList.innerHTML = '<p>Belum ada modul tersedia.</p>';
    return;
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? store.modules.filter((module) =>
        [module.title, module.subtitle, module.description, module.id]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q)),
      )
    : store.modules;

  if (!filtered.length) {
    moduleList.innerHTML = `<p>Tidak ada modul yang cocok dengan "${safeText(query.trim())}".</p>`;
    return;
  }

  moduleList.innerHTML = filtered
    .map((module, index) => {
      const isCalibration = module.type === 'calibration';
      const prog = getDownloadProgress?.();
      const badge = prog && prog.moduleId === module.id
        ? `<small class="dl-badge">Mengunduh ${prog.percent}%</small>`
        : '';
      return `
        <button class="module-card recommendation-card" data-module-id="${safeText(module.id)}" data-index="${String(index + 1).padStart(2, '0')}">
          <span class="module-card-art" aria-hidden="true">${isCalibration ? '⌁' : '360°'}</span>
          <div class="module-body">
            <strong>${safeText(module.title)}</strong>
            <p>${safeText(module.subtitle ?? module.description ?? '')}</p>
            ${badge}
            <small>
              ${isCalibration ? 'Pengaturan mata kiri dan kanan' : `${safeText(module.totalSegments ?? '-')} segmen • ${safeText(module.totalDecisionPoints ?? '-')} decision point`}
            </small>
          </div>
          <span class="module-arrow">→</span>
        </button>
      `;
    })
    .join('');

  // Listener dipasang setelah innerHTML karena tombol lama ikut terhapus.
  moduleList.querySelectorAll('.module-card').forEach((button) => {
    button.addEventListener('click', () => {
      openModule(button.dataset.moduleId);
    });
  });
}

// openModule(): buka modul by id -> set activeModule, muat skenario, cek unduhan, pindah layar.
// Modul kalibrasi langsung ke layar kalibrasi (tanpa scenarios.json/unduhan) karena hanya setting.
export async function openModule(moduleId) {
  const selectedModule = store.modules.find((module) => module.id === moduleId);

  if (!selectedModule) {
    alert('Modul tidak ditemukan.');
    return;
  }

  store.activeModule = selectedModule;

  if (store.activeModule.type === 'calibration') {
    confirmRemoteBeforeVr({
      onContinue: () => openCalibrationScreen(),
    });
    return;
  }

  // Tolak modul lain saat unduhan berjalan (kalibrasi bebas).
  if (isDownloading()) {
    const prog = getDownloadProgress();
    if (prog && prog.moduleId !== selectedModule.id) {
      showToast(`Unduhan modul lain masih berjalan (${prog.percent}%) — tunggu selesai dulu`);
      return;
    }
  }

  document.getElementById('selectedModuleTitle').textContent = store.activeModule.title;
  document.getElementById('selectedModuleDescription').textContent =
    store.activeModule.description ?? store.activeModule.subtitle ?? '-';
  document.getElementById('selectedModuleSegments').textContent =
    `${store.activeModule.totalSegments ?? '-'} segmen`;
  document.getElementById('selectedModuleDecisions').textContent =
    `${store.activeModule.totalDecisionPoints ?? '-'} decision point`;

  await loadScenarios(store.activeModule.scenarioUrl);

  // Bersihkan file yatim, petakan video/gambar yang sudah terunduh, lalu cek kekurangan paket.
  await purgeOrphanDownloads(store.scenarios);
  await applyLocalVideos(store.scenarios);
  await applyImageUris(store.scenarios);
  const missing = await missingRemotes(store.scenarios);
  const missingImages = (await collectImageRemotes(store.scenarios))
    .filter((g) => !g.overlays.every((o) => overlayImagesResolved(o)));

  if (missing.length || missingImages.length) { // tahan di layar download agar materi tidak dibuka dengan file rusak.
    showScreen('download');
    runDownloadFlow(store.scenarios, {
      moduleId: selectedModule.id,
      onDone: () => showScreen('mode'), // selesai -> ke timeline.
      onBack: () => backToModules(), // kembali -> job lanjut di background.
    });
    return;
  }

  showScreen('mode');
}

// initHome(): pasang listener pencarian + refresh badge progres unduhan (dibatasi 2s sekali).
export function initHome() {
  const searchInput = document.getElementById('moduleSearch');
  searchInput?.addEventListener('input', () => {
    renderModuleList(searchInput.value);
  });

  let lastBadgeRender = 0;
  let lastPercent = -1;
  window.addEventListener('download-progress', (e) => {
    if (document.getElementById('homeScreen')?.classList.contains('hidden')) return;
    const pct = e?.detail?.percent ?? -1;
    const now = Date.now();
    if (pct === lastPercent || now - lastBadgeRender < 2000) return;
    lastPercent = pct;
    lastBadgeRender = now;
    renderModuleList(searchInput?.value ?? '');
  });
}
