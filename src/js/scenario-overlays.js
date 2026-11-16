/**
 * scenario-overlays.js — overlay terjadwal (teks/gambar pada detik tertentu).
 *
 * Modul ini hanya mengurus timing + paint overlay. Tidak mengimpor controller
 * scenario.js; state dibaca lewat scenario-state.js.
 *
 * Data: scenario.overlays = [{ id, start, end (null = sampai habis),
 *   kind: 'text'|'image', text, image, localImage, caption,
 *   images: [{ image, imageRemote, localImage, x, y, w }] (multi + koordinat
 *     manual meter; x,y null = otomatis berdampingan; w null = default),
 *   pos3d: [x, y, z] opsional (posisi bebas entity, video 360 mobile + VR),
 *   textX/textY opsional (offset teks lokal entity, video 360 mobile + VR),
 *   rot: [x, y, z] derajat opsional (putaran teks + kotaknya, video 360),
 *   \n manual di text/caption untuk pecah baris (maks 2 baris disarankan),
 *   size: 'normal'|'besar'|'judul', pos: 'bawah'|'atas' }].
 * Mobile-flat: kartu DOM transparan (#mobileTimedOverlay + #mobileTimedImgs).
 * 360/VR: entity 3D per overlay (lihat buildTimedOverlaysHtml). */
import { store } from './store.js';
import { getActiveScenario, isFlatScenario } from './scenario-state.js';
import { listOverlayImages } from './scene-builders.js';

let timedOverlayGen = 0;
let timedHandlers = [];
const dismissedTimedIds = new Set();
let activeTimedId = null;

/** Sembunyikan semua kartu overlay terjadwal (mobile + kedua mata VR). */
// hideTimedOverlays: UNTUK APA? Sembunyikan kartu DOM + entity 3D .timed-overlay dan reset activeTimedId.
// KENAPA? Dipanggil tiap ganti segmen/quiz agar overlay lama tidak menumpuk di layar baru.
export function hideTimedOverlays() {
  document.getElementById('mobileTimedOverlay')?.classList.add('hidden');
  document.querySelectorAll('.timed-overlay').forEach((el) => {
    try {
      el.setAttribute('visible', 'false');
    } catch { /* abaikan */ }
  });
  activeTimedId = null;
}

/** Lepas semua listener timeupdate overlay (dipanggil tiap ganti segmen). */
// detachTimedOverlays: UNTUK APA? Naikkan generasi + removeEventListener timeupdate + reset dismissed/active.
// KENAPA? Generasi mencegah callback video lama melukis overlay segmen baru (balapan async ganti segmen).
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

/** Root scene 3D yang menampung entity overlay (VR dua mata / mobile-360). */
// timed3dRoots: UNTUK APA? Kembalikan daftar root 3D: kiri+kanan saat VR, satu mount saat mobile-360.
// KENAPA? Overlay 3D harus dilukis di kedua mata VR agar stereoskopis, cukup satu di mobile.
function timed3dRoots() {
  if (store.activeMode === 'vr') {
    return [document.getElementById('vrLeftMount'), document.getElementById('vrRightMount')].filter(Boolean);
  }
  const mount = document.getElementById('mobileSceneMount');
  return mount ? [mount] : [];
}

/** TRUE bila overlay tampil sebagai kartu DOM (hanya mobile-flat). */
// useDomTimedCard: UNTUK APA? Saklar jalur render overlay: kartu DOM vs entity 3D.
// KENAPA? Flat tidak punya scene A-Frame sehingga teks/gambar harus kartu HTML transparan.
function useDomTimedCard(scenario) {
  return store.activeMode === 'mobile' && !!scenario && isFlatScenario(scenario);
}

/** Isi + tampilkan satu overlay: kartu DOM transparan (flat) atau entity 3D. */
// paintTimedOverlay: UNTUK APA? Dispatcher: kartu DOM bila flat, toggle visible entity 3D bila 360/VR.
// KENAPA? Hanya satu overlay yang visible agar teks tidak bertumpuk; simpan activeTimedId anti lukis ulang.
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

/** Kartu DOM flat: teks putih tanpa kotak, di strip bawah bingkai video. */
// escapeItalicHtml: UNTUK APA? Escape &, <, >, " sebelum disisipkan sebagai innerHTML.
// KENAPA? Mencegah XSS/HTML rusak dari teks scenarios.json sekaligus menjaga penanda *italic* aman.
function escapeItalicHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Ubah penanda *...* di scenarios.json menjadi <i>...</i> (sudah di-escape). */
// richItalic: UNTUK APA? Konversi *kata Inggris* menjadi tag <i> setelah escape.
// KENAPA? Penulis konten cukup tulis *...* tanpa HTML mentah; regex hindari \n agar baris aman.
function richItalic(raw) {
  return escapeItalicHtml(raw).replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
}

/** Isi elemen <p> overlay dengan dukungan italic Inggris. */
// paintItalicText: UNTUK APA? Isi <p> kartu DOM via richItalic (innerHTML aman).
// KENAPA? Dibungkus fungsi agar pemakaian kartu DOM konsisten dan guard el kosong anti crash.
function paintItalicText(el, raw) {
  if (!el) return;
  el.innerHTML = richItalic(raw ?? '');
}

// paintDomTimedOverlay: UNTUK APA? Render kartu DOM flat: kelas posisi/ukuran + gambar + teks/caption.
// KENAPA? Satu fungsi menampung varian pos (atas/bawah) dan size agar tampilan responsif tanpa kotak.
function paintDomTimedOverlay(overlay) {
  const box = document.getElementById('mobileTimedOverlay');
  if (!box) return;

  box.classList.remove('hidden', 'pos-atas', 'pos-bawah', 'sz-besar', 'sz-judul');
  box.classList.add('style-flat', overlay.pos === 'atas' ? 'pos-atas' : 'pos-bawah');
  if (overlay.size === 'besar') box.classList.add('sz-besar');
  if (overlay.size === 'judul') box.classList.add('sz-judul');
  // Render semua gambar (multi + koordinat manual diabaikan di DOM:
  // tampil berdampingan responsif).
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

/** Cek posisi video terhadap semua jendela overlay skenario aktif. */
// tickTimedOverlays: UNTUK APA? Dipanggil tiap timeupdate: cari overlay yang jendelanya memuat currentTime lalu lukis.
// KENAPA? Guard generasi + skenario aktif mencegah callback basi; dismissed memungkinkan tombol X menutup sekali.
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
