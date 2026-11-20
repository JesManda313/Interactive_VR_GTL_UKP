// scenario-overlays.js: overlay terjadwal (teks/gambar) pada detik tertentu.
// Data: scenario.overlays = [{ id, start, end (null = sampai habis), kind, text,
//   image, caption, images[], pos3d, textX/textY, rot, size, pos }].
// Flat: kartu DOM transparan; 360/VR: entity 3D per overlay.
import { store } from './store.js';
import { getActiveScenario, isFlatScenario } from './scenario-state.js';
import { listOverlayImages } from './scene-builders.js';

let timedOverlayGen = 0;
let timedHandlers = [];
const dismissedTimedIds = new Set();
let activeTimedId = null;

// hideTimedOverlays(): sembunyikan kartu DOM + entity 3D, reset activeTimedId.
// Dipanggil tiap ganti segmen/kuis agar overlay lama tidak menumpuk.
export function hideTimedOverlays() {
  document.getElementById('mobileTimedOverlay')?.classList.add('hidden');
  document.querySelectorAll('.timed-overlay').forEach((el) => {
    try {
      el.setAttribute('visible', 'false');
    } catch { /* abaikan */ }
  });
  activeTimedId = null;
}

// detachTimedOverlays(): lepas listener timeupdate + reset dismissed/active.
// Naikkan generasi agar callback video lama tidak melukis overlay segmen baru.
export function detachTimedOverlays() {
  timedOverlayGen += 1;
  timedHandlers.forEach(({ video, fn }) => {
    try {
      video.removeEventListener('timeupdate', fn);
    } catch { /* abaikan */ }
  });
  timedHandlers = [];
  dismissedTimedIds.clear();
  hideTimedOverlays();
}

// timed3dRoots(): root 3D overlay, kiri+kanan saat VR (stereoskopis), satu saat mobile 360.
function timed3dRoots() {
  if (store.activeMode === 'vr') {
    return [document.getElementById('vrLeftMount'), document.getElementById('vrRightMount')].filter(Boolean);
  }
  const mount = document.getElementById('mobileSceneMount');
  return mount ? [mount] : [];
}

// useDomTimedCard(): true bila overlay jadi kartu DOM; flat tanpa scene A-Frame.
function useDomTimedCard(scenario) {
  return store.activeMode === 'mobile' && !!scenario && isFlatScenario(scenario);
}

// paintTimedOverlay(): kartu DOM bila flat, toggle visible entity 3D bila 360/VR.
// Hanya satu overlay visible agar teks tidak bertumpuk; activeTimedId mencegah lukis ulang.
function paintTimedOverlay(overlay, scenario) {
  if (useDomTimedCard(scenario)) {
    paintDomTimedOverlay(overlay);
    activeTimedId = overlay.id ?? null;
    return;
  }

  const id = overlay.id ?? '';
  timed3dRoots().forEach((root) => {
    root.querySelectorAll('.timed-overlay').forEach((el) => {
      try {
        el.setAttribute('visible', el.dataset.overlayId === String(id) ? 'true' : 'false');
      } catch { /* abaikan */ }
    });
  });
  activeTimedId = overlay.id ?? null;
}

// escapeItalicHtml(): escape &, <, >, " sebelum disisipkan sebagai innerHTML.
function escapeItalicHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// richItalic(): ubah penanda *...* menjadi <i>...</i> setelah di-escape.
function richItalic(raw) {
  return escapeItalicHtml(raw).replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
}

// paintItalicText(): isi <p> kartu DOM via richItalic (innerHTML aman, guard el kosong).
function paintItalicText(el, raw) {
  if (!el) return;
  el.innerHTML = richItalic(raw ?? '');
}

// paintDomTimedOverlay(): kartu DOM flat, kelas posisi/ukuran + gambar + teks/caption.
function paintDomTimedOverlay(overlay) {
  const box = document.getElementById('mobileTimedOverlay');
  if (!box) return;

  box.classList.remove('hidden', 'pos-atas', 'pos-bawah', 'sz-besar', 'sz-judul');
  box.classList.add('style-flat', overlay.pos === 'atas' ? 'pos-atas' : 'pos-bawah');
  if (overlay.size === 'besar') box.classList.add('sz-besar');
  if (overlay.size === 'judul') box.classList.add('sz-judul');
  // Gambar multi tampil berdampingan (koordinat manual diabaikan di DOM).
  const wrap = box.querySelector('#mobileTimedImgs');
  if (wrap) {
    wrap.innerHTML = '';
    for (const im of listOverlayImages(overlay)) {
      if (!im.src) continue;
      const el = document.createElement('img');
      el.src = im.src;
      el.alt = '';
      el.className = 'mobile-timed-img';
      wrap.appendChild(el);
    }
  }
  const txt = box.querySelector('p');
  if (txt) paintItalicText(txt, overlay.kind === 'image' ? (overlay.caption ?? '') : (overlay.text ?? ''));
}

// tickTimedOverlays(): cek currentTime tiap timeupdate, lukis overlay yang jendelanya cocok.
// Guard generasi + skenario aktif menolak callback basi; dismissed = ditutup tombol X.
function tickTimedOverlays(video, scenario, gen) {
  if (gen !== timedOverlayGen) return;
  const current = getActiveScenario();
  if (!current || current !== scenario) return;
  const t = Number(video.currentTime);
  if (!Number.isFinite(t)) return;

  const list = Array.isArray(scenario.overlays) ? scenario.overlays : [];
  const hit = list.find((o) => {
    const start = Number(o.start ?? 0);
    const end = o.end == null ? Infinity : Number(o.end);
    return t >= start && t <= end && !dismissedTimedIds.has(o.id);
  });

  if (!hit) {
    // Keluar jendela: izinkan tampil lagi bila masuk kembali (seek ulang).
    list.forEach((o) => {
      const start = Number(o.start ?? 0);
      const end = o.end == null ? Infinity : Number(o.end);
      if (t < start || t > end) dismissedTimedIds.delete(o.id);
    });
    hideTimedOverlays();
    return;
  }

  if (hit.id !== activeTimedId) paintTimedOverlay(hit, scenario);
}

/** Pasang timeupdate pada video aktif + preload gambar overlay. */
// attachTimedOverlays: UNTUK APA? Reset lama, preload gambar, lalu pasang listener timeupdate ke video yang tepat.
// KENAPA? Pilih target (VR bersama / flat / videosphere) agar overlay sinkron; preload cegah gambar telat muncul.
export function attachTimedOverlays(scenario) {
  detachTimedOverlays();
  const list = Array.isArray(scenario?.overlays) ? scenario.overlays : [];
  if (!list.length) return;
  const gen = timedOverlayGen;

  // Preload agar muncul tepat waktu (semua gambar, termasuk array multi).
  list.forEach((o) => {
    for (const im of listOverlayImages(o)) {
      if (!im.src) continue;
      try {
        const pre = new Image();
        pre.src = im.src;
      } catch { /* abaikan */ }
    }
  });

  const videos = store.activeMode === 'vr'
    ? [document.getElementById('sharedVrVideo')].filter(Boolean)
    : store.activeMode === 'mobile' && scenario && isFlatScenario(scenario)
      ? [document.getElementById('mobileFlatVideo')].filter(Boolean)
      : [...document.querySelectorAll('#mobileSceneMount .scenario-video')];

  videos.forEach((video) => {
    const fn = () => tickTimedOverlays(video, scenario, gen);
    video.addEventListener('timeupdate', fn);
    timedHandlers.push({ video, fn });
  });

  const closeBtn = document.getElementById('mobileTimedClose');
  if (closeBtn) {
    closeBtn.onclick = () => {
      if (activeTimedId) dismissedTimedIds.add(activeTimedId);
      hideTimedOverlays();
    };
  }
}
