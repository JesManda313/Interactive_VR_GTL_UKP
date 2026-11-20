// mode.js: timeline segmen di #modeScreen; pilih node lalu putar lewat VR atau mobile.
import { backToModules, openMode } from './navigation.js'; // pindah layar + masuk player.
import { store } from './store.js'; // baca activeModule/scenarios.
import { safeText } from './utils.js'; // escape judul agar aman.
import { confirmRemoteBeforeVr } from './remote-gate.js'; // gerbang remote BT sebelum VR.
import {
  firstScenarioId,
  isUnlocked,
  resetProgress,
  scenarioStatus,
} from './progress.js'; // hitung kunci/buka + reset.

let pendingScenarioId = null; // segmen terpilih selama popup VR/Mobile terbuka.

const TYPE_LABEL = { linear: 'Video', decision: 'Decision', consequence: 'Konsekuensi', end: 'Selesai' }; // type teknis -> label tampilan.
const STATUS_ICON = { done: '✓', current: '▶', open: '○', locked: '🔒' }; // ikon status segmen.

// mainPath(scenarios): jalur utama, tanpa konsekuensi yang punya returnTo.
function mainPath(scenarios) {
  return (scenarios ?? []).filter((s) => !(s?.type === 'consequence' && s?.returnTo));
}

// childrenOf(scenarios, parentId): anak konsekuensi yang kembali ke segmen induk.
function childrenOf(scenarios, parentId) {
  return (scenarios ?? []).filter((s) => s?.returnTo === parentId);
}

// nodeHtml(scenarios, moduleId, scenario, index): HTML satu baris timeline beserta anak konsekuensinya.
function nodeHtml(scenarios, moduleId, scenario, index) {
  const st = scenarioStatus(moduleId, scenario.id, scenarios);
  const locked = st === 'locked';
  const kids = childrenOf(scenarios, scenario.id)
    .map((k) => {
      const ks = scenarioStatus(moduleId, k.id, scenarios);
      const kLocked = ks === 'locked';
      return `
        <button
          type="button"
          class="path-node path-child${kLocked ? ' is-locked' : ''}"
          data-scenario-id="${safeText(k.id)}"
          ${kLocked ? 'aria-disabled="true"' : ''}
        >
          <span class="path-badge">${STATUS_ICON[ks] ?? '•'}</span>
          <span class="path-text"><strong>${safeText(k.title ?? k.id)}</strong></span>
        </button>`;
    })
    .join('');

  return `
    <div class="path-row">
      <button
        type="button"
        class="path-node${locked ? ' is-locked' : ''}${st === 'current' ? ' is-current' : ''}"
        data-scenario-id="${safeText(scenario.id)}"
        ${locked ? 'aria-disabled="true"' : ''}
      >
        <span class="path-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="path-badge">${STATUS_ICON[st] ?? '•'}</span>
        <span class="path-text">
          <strong>${safeText(scenario.title ?? scenario.id)}</strong>
          <small>${safeText(TYPE_LABEL[scenario.type] ?? scenario.type ?? '')}</small>
        </span>
      </button>
      ${kids ? `<div class="path-children">${kids}</div>` : ''}
    </div>`;
}

// renderSegmentPath(): render ulang timeline tiap kali layar mode ditampilkan.
export function renderSegmentPath() {
  const list = document.getElementById('segmentPath');
  if (!list || !store.activeModule) return; // dipanggil sebelum modul dipilih.
  const scenarios = store.scenarios ?? [];
  const moduleId = store.activeModule.id;
  const path = mainPath(scenarios);

  list.innerHTML = path.length
    ? path.map((s, i) => nodeHtml(scenarios, moduleId, s, i)).join('')
    : '<p class="description">Belum ada segmen.</p>';

  list.querySelectorAll('.path-node:not(.is-locked)').forEach((button) => {
    button.addEventListener('click', () => selectSegment(button.dataset.scenarioId));
  });
  list.querySelectorAll('.path-node.is-locked').forEach((button) => {
    button.addEventListener('click', () => {
      button.classList.remove('shake');
      void button.offsetWidth; // paksa reflow agar animasi shake bisa diulang.
      button.classList.add('shake');
      const hint = document.getElementById('pathHint');
      if (hint) hint.textContent = 'Terkunci — tonton segmen sebelumnya dulu.';
    });
  });
}

// selectSegment(scenarioId): buka popup pilih VR/Mobile untuk segmen yang dipilih.
function selectSegment(scenarioId) {
  const scenarios = store.scenarios ?? [];
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return;
  if (!isUnlocked(store.activeModule?.id, scenarioId, scenarios)) return; // cegah buka segmen terkunci via console.
  pendingScenarioId = scenarioId;

  const title = document.getElementById('modePopupTitle');
  if (title) title.textContent = scenario.title ?? scenarioId;
  document.getElementById('modePopup')?.classList.remove('hidden');
}

// closePopup(): tutup popup dan reset segmen tertunda.
function closePopup() {
  pendingScenarioId = null;
  document.getElementById('modePopup')?.classList.add('hidden');
}

// wirePopupButtons(): pasang handler tombol popup; onclick dipakai agar aman dipanggil berulang.
function wirePopupButtons() {
  const vrBtn = document.getElementById('popupVrMode');
  if (vrBtn) {
    vrBtn.onclick = () => {
      const startId = pendingScenarioId;
      closePopup();
      confirmRemoteBeforeVr({
        onContinue: () => openMode('vr', startId),
      });
    };
  }
  const hpBtn = document.getElementById('popupMobileMode');
  if (hpBtn) {
    hpBtn.onclick = () => {
      const startId = pendingScenarioId;
      closePopup();
      openMode('mobile', startId);
    };
  }
  const cancelBtn = document.getElementById('popupCancel');
  if (cancelBtn) cancelBtn.onclick = closePopup;
  const backdrop = document.getElementById('modePopup');
  if (backdrop && !backdrop.dataset.backdropWired) {
    backdrop.dataset.backdropWired = '1';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closePopup();
    });
  }
}

// initMode(): wire tombol mode.html sekali saat start.
export function initMode() {
  document.getElementById('backToModules')?.addEventListener('click', backToModules);

  wirePopupButtons();

  document.getElementById('restartModule')?.addEventListener('click', () => {
    if (!store.activeModule) return;
    resetProgress(store.activeModule.id);
    renderSegmentPath();
    const firstId = firstScenarioId(store.scenarios);
    if (firstId) selectSegment(firstId);
  });

  // render + wiring ulang tiap layar mode tampil, karena progres bisa berubah selama bermain.
  window.addEventListener('mode-screen-shown', () => {
    closePopup();
    renderSegmentPath();
    wirePopupButtons();
  });
}
