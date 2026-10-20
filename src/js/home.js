/**
 * home.js — logic for home.html (#homeScreen).
 * Owns: module list fetch + render + open module.
 * Cross-page actions delegate to navigation.js / scenario.js.
 *
 * UNTUK APA FILE INI?
 * Halaman pertama: ambil daftar modul dari modules.json, tampilkan sebagai kartu,
 * dan saat diklik -> muat skenario modul itu, cek unduhan, lalu arahkan ke layar berikutnya.
 */
import { MODULES_URL, store } from './store.js'; // URL JSON + memori global.
import { safeText, showToast } from './utils.js'; // escape HTML agar judul aman.
import { loadScenarios } from './scenario.js'; // muat scenarios.json modul terpilih.
import { applyImageUris, applyLocalVideos, collectImageRemotes, getDownloadProgress, isDownloading, missingRemotes, overlayImagesResolved, purgeOrphanDownloads, runDownloadFlow } from './download-manager.js'; // cek/petakan file lokal hasil unduhan.
import { backToModules, openCalibrationScreen, showScreen } from './navigation.js'; // pindah layar.
import { confirmRemoteBeforeVr } from './remote-gate.js'; // gerbang remote BT sebelum kalibrasi VR.

/**
 * loadModules():
 * Untuk apa? Ambil manifest modul dari server dan render daftar modul.
 * - fetch(MODULES_URL) KENAPA? Daftar modul bisa diubah tanpa rebuild APK (cukup edit JSON).
 * - !response.ok -> throw KENAPA? Agar main.js bisa catch + alert "cek modules.json".
 * - store.modules = await response.json() KENAPA simpan di store? Agar openModule bisa find by id tanpa fetch ulang.
 */
export async function loadModules() {
  const response = await fetch(MODULES_URL);

  if (!response.ok) {
    throw new Error('Gagal membaca modules.json');
  }

  store.modules = await response.json();
  renderModuleList(); // langsung tampilkan setelah data datang.
}

/**
 * renderModuleList():
 * Untuk apa? Render daftar modul ke UI. Setiap modul menjadi sebuah tombol.
 * Menggunakan `safeText` untuk mencegah penyisipan HTML yang tidak aman (XSS dari JSON).
 * - if (!moduleList) return KENAPA? Jaga-jaga HTML belum ada (mis. test) -> jangan crash.
 * - if kosong -> pesan "Belum ada modul". KENAPA? Feedback jelas, bukan layar putih kosong.
 * - .map(...).join('') KENAPA? Bangun semua kartu sekaligus (1x innerHTML) lebih cepat daripada append per kartu.
 * - data-module-id KENAPA? Untuk tahu kartu mana diklik tanpa closure per modul.
 * - isCalibration ? '⌁' : '360°' KENAPA? Ikon beda agar modul setting tidak dikira materi.
 */
export function renderModuleList(query = '') {
  const moduleList = document.getElementById('moduleList');
  if (!moduleList) return;

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

  // Pasang klik tiap kartu -> openModule(id). KENAPA query setelah innerHTML? Karena tombol baru dibuat, listener lama hilang.
  moduleList.querySelectorAll('.module-card').forEach((button) => {
    button.addEventListener('click', () => {
      openModule(button.dataset.moduleId);
    });
  });
}

/**
 * openModule(moduleId):
 * Untuk apa? Buka modul by id: set active module, perbarui UI mode.html, muat skenarionya, lalu tampilkan pilihan mode.
 * ALUR:
 * 1. find modul -> bila tidak ada alert. KENAPA? Cegah id palsu dari console.
 * 2. Jika type calibration -> langsung openCalibrationScreen (tidak butuh scenarios.json/download).
 *    KENAPA? Kalibrasi adalah setting, bukan materi video.
 * 3. Update judul/deskripsi di mode.html agar user tahu modul apa yang dibuka.
 * 4. loadScenarios(scenarioUrl) -> isi store.scenarios.
 * 5. purgeOrphanDownloads (hapus file yatim) + applyLocalVideos + applyImageUris
 *    KENAPA? Petakan file yang sudah diunduh sebelumnya ke scenario.video/localImage agar bisa offline.
 * 6. Cek missing (video + gambar). Bila ada kurang -> showScreen('download') + runDownloadFlow (blokir ala PUBG).
 *    KENAPA blokir? Agar user tidak masuk materi dengan video rusak/hilang.
 * 7. Bila lengkap -> showScreen('mode') (timeline segmen).
 */
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

  // Guard 4a: modul materi lain ditolak saat ada unduhan berjalan (kalibrasi bebas).
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

  // Bersihkan file yatim (fileId tak lagi dirujuk, mis. file pilot lama),
  // petakan video + gambar lokal yang sudah terunduh, lalu tahan di layar
  // download bila masih ada paket yang kurang.
  await purgeOrphanDownloads(store.scenarios);
  await applyLocalVideos(store.scenarios);
  await applyImageUris(store.scenarios);
  const missing = await missingRemotes(store.scenarios);
  const missingImages = (await collectImageRemotes(store.scenarios))
    .filter((g) => !g.overlays.every((o) => overlayImagesResolved(o)));

  if (missing.length || missingImages.length) {
    showScreen('download');
    runDownloadFlow(store.scenarios, {
      moduleId: selectedModule.id,
      onDone: () => showScreen('mode'), // selesai -> ke timeline.
      onBack: () => backToModules(), // kembali -> detach, job lanjut background.
    });
    return;
  }

  showScreen('mode');
}

/**
 * initHome():
 * Untuk apa? Wire listener milik home.html (sekali saat start).
 * Topbar profile/settings sudah dihapus — kalibrasi hanya via kartu modul.
 * Listener download-progress di sini untuk refresh badge progres di daftar modul.
 */
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
