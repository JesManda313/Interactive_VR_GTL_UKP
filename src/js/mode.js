/**
 * mode.js — logic for mode.html (#modeScreen).
 * Layar ini kini berisi jalur belajar (timeline segmen per modul):
 * ketuk node yang terbuka -> popup pilih VR / Mobile -> putar dari segmen itu.
 * Progres (ditonton/terakhir/terkunci) dihitung progress.js per modul.
 *
 * UNTUK APA FILE INI?
 * Menampilkan timeline belajar (mirip peta level game): segmen done/current/open/locked.
 * User pilih segmen -> muncul popup "mau VR atau Mobile?" -> openMode().
 */
import { backToModules, openMode } from './navigation.js'; // pindah layar + masuk player.
import { store } from './store.js'; // baca activeModule/scenarios.
import { safeText } from './utils.js'; // escape judul agar aman.
import {
  firstScenarioId,
  isUnlocked,
  resetProgress,
  scenarioStatus,
} from './progress.js'; // hitung kunci/buka + reset.

// pendingScenarioId: Untuk apa? Simpan segmen yang dipilih sambil menunggu user pilih VR/Mobile di popup.
// KENAPA perlu variabel sementara? Karena klik node dan klik tombol VR terjadi di 2 event berbeda.
let pendingScenarioId = null;

// TYPE_LABEL: Untuk apa? Ubah type teknis ('linear') jadi label manusia ('Video').
// STATUS_ICON: Untuk apa? Ikon status (✓ done, ▶ current, ○ open, 🔒 locked). KENAPA object? Lookup cepat tanpa if-else.
const TYPE_LABEL = { linear: 'Video', decision: 'Decision', consequence: 'Konsekuensi', end: 'Selesai' };
const STATUS_ICON = { done: '✓', current: '▶', open: '○', locked: '🔒' };

/**
 * mainPath(scenarios):
 * Untuk apa? Skenario jalur utama: semua kecuali konsekuensi loop-balik (punya returnTo).
 * KENAPA filter? Video hukuman tidak ditampilkan sebagai level utama (agar timeline lurus),
 * tapi sebagai anak di bawah induknya (lihat childrenOf).
 */
function mainPath(scenarios) {
  return (scenarios ?? []).filter((s) => !(s?.type === 'consequence' && s?.returnTo));
}

/**
 * childrenOf(scenarios, parentId):
 * Untuk apa? Anak konsekuensi yang kembali ke segmen induk ber-id parentId.
 * KENAPA? Untuk render sebagai sub-node di bawah decision yang menghukumnya.
 */
function childrenOf(scenarios, parentId) {
  return (scenarios ?? []).filter((s) => s?.returnTo === parentId);
}

/**
 * nodeHtml(scenarios, moduleId, scenario, index):
 * Untuk apa? Bangun HTML 1 baris timeline (node utama + anak konsekuensinya).
 * - st = scenarioStatus(...) -> tentukan locked atau tidak. KENAPA? Untuk kasih class is-locked + aria-disabled.
 * - kids = childrenOf(...).map(...) -> render anak. KENAPA nested? Agar user tahu ada video konsekuensi terkait.
 * - safeText() di semua id/judul KENAPA? Data dari JSON, cegah XSS + cegah pecah atribut bila ada kutip.
 * - padStart(2,'0') KENAPA? Nomor tampil 01, 02 (rapi seperti modul profesional).
 */
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

/**
 * renderSegmentPath():
 * Untuk apa? Render ulang timeline setiap kali layar mode ditampilkan.
 * - if (!list || !activeModule) return KENAPA? Jaga-jaga dipanggil sebelum modul dipilih.
 * - list.innerHTML = path.map(nodeHtml).join('') KENAPA 1x tulis? Lebih cepat daripada append per node.
 * - Pasang klik node terbuka -> selectSegment(). KENAPA hanya :not(.is-locked)? Node terkunci tidak boleh dibuka.
 * - Klik node terkunci -> efek shake + hint "Terkunci...". KENAPA? Feedback jelas kenapa tidak bisa diklik
 *   (bukan tombol rusak). Trik void offsetWidth KENAPA? Restart animasi CSS shake agar bisa goyang berkali-kali.
 */
export function renderSegmentPath() {
  const list = document.getElementById('segmentPath');
  if (!list || !store.activeModule) return;
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
      void button.offsetWidth; // paksa reflow agar animasi bisa diulang.
      button.classList.add('shake');
      const hint = document.getElementById('pathHint');
      if (hint) hint.textContent = 'Terkunci — tonton segmen sebelumnya dulu.';
    });
  });
}

/**
 * selectSegment(scenarioId):
 * Untuk apa? Pilih segmen -> buka popup pilih mode (VR/Mobile).
 * - find scenario KENAPA? Pastikan id valid.
 * - isUnlocked cek KENAPA dobel (padahal tombol locked sudah dicegah)? Agar tidak bisa diakali via console.
 * - pendingScenarioId = id + tampilkan popup. KENAPA simpan? Nanti tombol popup pakai ini untuk openMode().
 */
function selectSegment(scenarioId) {
  const scenarios = store.scenarios ?? [];
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return;
  if (!isUnlocked(store.activeModule?.id, scenarioId, scenarios)) return;
  pendingScenarioId = scenarioId;

  const title = document.getElementById('modePopupTitle');
  if (title) title.textContent = scenario.title ?? scenarioId;
  document.getElementById('modePopup')?.classList.remove('hidden');
}

// closePopup(): Untuk apa? Tutup popup + reset pending. KENAPA reset? Agar klik berikutnya tidak pakai id basi.
function closePopup() {
  pendingScenarioId = null;
  document.getElementById('modePopup')?.classList.add('hidden');
}

/**
 * initMode():
 * Untuk apa? Wire tombol-tombol milik mode.html (sekali saat start).
 * - #backToModules -> kembali daftar. - #popupVrMode/#popupMobileMode -> ambil pending id, tutup popup, openMode().
 *   KENAPA ambil dulu baru close? Karena close mereset pending jadi null.
 * - #restartModule -> resetProgress + render ulang + auto-pilih segmen pertama. KENAPA? Tombol "Mulai dari awal".
 * - window 'mode-screen-shown' -> renderSegmentPath. KENAPA? Render ulang tiap kali layar tampil
 *   (progres bisa berubah selama bermain; backToModeSelection tidak tahu soal mode.js).
 */
export function initMode() {
  document.getElementById('backToModules')?.addEventListener('click', backToModules);

  document.getElementById('popupVrMode')?.addEventListener('click', () => {
    const startId = pendingScenarioId;
    closePopup();
    openMode('vr', startId);
  });
  document.getElementById('popupMobileMode')?.addEventListener('click', () => {
    const startId = pendingScenarioId;
    closePopup();
    openMode('mobile', startId);
  });
  document.getElementById('popupCancel')?.addEventListener('click', closePopup);

  document.getElementById('restartModule')?.addEventListener('click', () => {
    if (!store.activeModule) return;
    resetProgress(store.activeModule.id);
    renderSegmentPath();
    const firstId = firstScenarioId(store.scenarios);
    if (firstId) selectSegment(firstId);
  });

  // Render ulang tiap kali layar mode ditampilkan (progres bisa berubah
  // selama bermain; backToModeSelection tidak tahu soal mode.js).
  window.addEventListener('mode-screen-shown', renderSegmentPath);
}
