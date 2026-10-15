/**
 * scenario.js — scenario & quiz engine.
 * Dipakai mobile-player.html + vr-player.html.
 * Quiz digabung di sini karena saling memanggil dengan engine
 * (handleOption -> renderActiveScenario -> showQuiz -> handleOption).
 */
import { store } from './store.js';
import { applyCalibrationTarget } from './calibration.js';
import { markWatched } from './progress.js';
import {
  clearScenes,
  ensureSharedVrVideo,
  pauseActiveVideos,
  playActiveVideos,
} from './video.js';
import {
  fadeOverlay,
  getFadeOverlay,
  getTransitionMessage,
  setFadeMessage,
} from './fade.js';
import { buildSceneHtml, listOverlayImages } from './scene-builders.js';
import { ScreenOrientation } from '@capacitor/screen-orientation';

// Handler navigasi (backToModules / backToModeSelection) didaftarkan oleh
// navigation.js via setNavHandlers — agar modul ini tidak import navigation
// (hindari circular import).
let navHandlers = null;

// setNavHandlers: UNTUK APA? Menyimpan callback navigasi (backToModules/backToModeSelection) dari navigation.js.
// KENAPA? Agar scenario.js bisa pindah halaman tanpa import navigation (menghindari circular import).
export function setNavHandlers(handlers) {
  navHandlers = handlers;
}

/** Ambil skenario untuk modul dan buat peta (Map) yang diindeks oleh id skenario. */
// loadScenarios: UNTUK APA? Fetch scenarios.json lalu isi store.scenarios/Map + set skenario pertama aktif.
// KENAPA? Peta Map membuat lompatan next/returnTo/consequence O(1) tanpa search array tiap navigasi.
export async function loadScenarios(scenarioUrl) {
  const response = await fetch(scenarioUrl);

  if (!response.ok) {
    throw new Error('Gagal membaca scenarios.json modul.');
  }

  store.scenarios = await response.json();
  store.scenarioMap = new Map(store.scenarios.map((scenario) => [scenario.id, scenario]));
  store.activeScenarioId = store.scenarios[0]?.id ?? null;
}

/** Kembalikan objek skenario aktif berdasarkan `activeScenarioId`. */
// getActiveScenario: UNTUK APA? Getter tunggal untuk segmen yang sedang tampil.
// KENAPA? Satu pintu akses mencegah id dan Map tidak sinkron tersebar di banyak file.
export function getActiveScenario() {
  return store.scenarioMap.get(store.activeScenarioId);
}

/**
 * TRUE jika skenario memakai video flat (projection: flat):
 * video tampil langsung fullscreen HP, tanpa videosphere/bioskop.
 * Selain itu (360 / kosong) dianggap 360.
 */
// isFlatScenario: UNTUK APA? Penentu cabang render flat (video <video>) vs 360 (A-Frame videosphere).
// KENAPA? Satu fungsi dipakai render + overlay + quiz agar keputusan konsisten (termasuk alias 2d/rectilinear).
export function isFlatScenario(scenario) {
  if (!scenario) return false;
  const projection = String(scenario.projection ?? scenario.videoType ?? '').toLowerCase();
  return projection === 'flat' || projection === '2d' || projection === 'rectilinear';
}

/** Sembunyikan gerbang START VR di kedua mata (dipakai saat kuis langsung tampil). */
// hideVrStartGate: UNTUK APA? Set visible=false semua .vr-start-gate tanpa memutar video.
// KENAPA? Dipakai saat kembali dari konsekuensi (kuis langsung tampil, video sudah habis).
function hideVrStartGate() {
  document.querySelectorAll('.vr-start-gate').forEach((el) => {
    try {
      el.setAttribute('visible', 'false');
    } catch { /* abaikan */ }
  });
}

/** START VR ditekan (tatap + tombol remote / klik): tutup gerbang, putar video. */
// startVrPlayback: UNTUK APA? Satu pintu mulai-putar VR: sembunyikan gate lalu play.
// KENAPA? Dipanggil gaze.js (remote) + klik mouse (uji laptop) agar perilaku identik.
export function startVrPlayback() {
  if (store.activeMode !== 'vr') return;
  hideVrStartGate();
  playActiveVideos();
}

/** Sembunyikan popup HTML mobile (quiz + end). */
// hideMobilePopups: UNTUK APA? Menutup popup kuis/akhir mobile tiap ganti segmen.
// KENAPA? Agar popup segmen lama tidak bocor menutupi video segmen baru.
export function hideMobilePopups() {
  document.getElementById('mobileQuizPopup')?.classList.add('hidden');
  document.getElementById('mobileEndPopup')?.classList.add('hidden');
}

/* ---------- Landscape khusus video flat (Sony A6400) ---------- */

/** TRUE jika layar sedang portrait. */
// isPortraitNow: UNTUK APA? Deteksi orientasi portrait via matchMedia (fallback perbandingan tinggi/lebar).
// KENAPA? Dipakai updateRotateHintVisibility agar hint "putar HP" hanya muncul saat dibutuhkan.
function isPortraitNow() {
  if (window.matchMedia) {
    return window.matchMedia('(orientation: portrait)').matches;
  }
  return window.innerHeight >= window.innerWidth;
}

/** Tampilkan/sembunyikan hint "putar HP" (hanya saat flat aktif + portrait). */
// updateRotateHintVisibility: UNTUK APA? Toggle hint rotate hanya bila wrap flat terlihat + portrait.
// KENAPA? Hint yang selalu muncul mengganggu; syarat ganda menjaga UX fullscreen Sony A6400.
function updateRotateHintVisibility() {
  const wrap = document.getElementById('mobileFlatWrap');
  const hint = document.getElementById('mobileRotateHint');
  if (!wrap || !hint) return;
  const flatActive = !wrap.classList.contains('hidden');
  hint.classList.toggle('hidden', !(flatActive && isPortraitNow()));
}

/** Coba kunci ke landscape via plugin native (APK) dulu, fallback Web API (browser).
 * Dipakai flat (Sony) + VR (split kiri-kanan butuh landscape). */
export async function lockLandscape() {
  try {
    await ScreenOrientation.lock({ orientation: 'landscape' });
    return 'native';
  } catch { /* bukan APK / ditolak — lanjut fallback */ }
  try {
    if (screen.orientation?.lock) {
      await screen.orientation.lock('landscape');
      return 'web';
    }
  } catch { /* butuh gesture / tidak didukung */ }
  return 'gagal';
}

/** Buka kunci orientasi (native + web), abaikan bila tidak didukung. */
export async function unlockOrientation() {
  try {
    await ScreenOrientation.unlock();
  } catch { /* abaikan */ }
  try {
    if (screen.orientation?.unlock) screen.orientation.unlock();
  } catch { /* abaikan */ }
}

/** Coba kunci ke landscape (tanpa fullscreen; gagal diam-diam kalau belum ada gesture). */
// tryFlatLandscape: UNTUK APA? Percobaan auto-lock landscape tiap masuk segmen flat.
// KENAPA? Browser butuh gesture user; gagal diam-diam lalu hint putar-HP jadi fallback (tidak crash).
async function tryFlatLandscape() {
  updateRotateHintVisibility();
  await lockLandscape();
  updateRotateHintVisibility();
}

/** Tombol ⛶ dihapus: lock landscape hanya otomatis saat masuk segmen (butuh
 * gesture, boleh gagal diam-diam); user memutar HP manual via auto-rotate. */

/** Keluar dari landscape: unlock + keluar fullscreen. */
// exitFlatLandscape: UNTUK APA? Bersihkan lock orientasi + fullscreen + hint saat pindah ke 360/VR.
// KENAPA? Tanpa cleanup, HP terkunci landscape dan hint nyangkut di scene yang tidak butuh.
function exitFlatLandscape() {
  unlockOrientation();
  try {
    if (document.fullscreenElement) document.exitFullscreen()?.catch?.(() => {});
    else if (document.webkitFullscreenElement) document.webkitExitFullscreen?.();
  } catch { /* abaikan */ }
  document.getElementById('mobileRotateHint')?.classList.add('hidden');
}

if (typeof window !== 'undefined') {
  window.addEventListener('orientationchange', () => {
    setTimeout(updateRotateHintVisibility, 120);
  });
  window.addEventListener('resize', () => {
    updateRotateHintVisibility();
  });
  document.addEventListener('fullscreenchange', () => {
    updateRotateHintVisibility();
  });
  document.addEventListener('webkitfullscreenchange', () => {
    updateRotateHintVisibility();
  });
}

/** Render popup branching HTML di depan video flat. */
// renderMobileQuizPopup: UNTUK APA? Bangun tombol opsi HTML di atas video flat + bind klik ke handleOption.
// KENAPA? Mode flat tanpa A-Frame jadi kuis harus DOM; escape "<" mencegah injeksi dari scenarios.json.
function renderMobileQuizPopup(scenario) {
  const popup = document.getElementById('mobileQuizPopup');
  const questionEl = document.getElementById('mobileQuizQuestion');
  const optionsEl = document.getElementById('mobileQuizOptions');
  const feedbackEl = document.getElementById('mobileQuizFeedback');
  if (!popup || !questionEl || !optionsEl) return;

  document.getElementById('mobileEndPopup')?.classList.add('hidden');
  questionEl.textContent = scenario.question ?? '-';
  if (feedbackEl) {
    feedbackEl.textContent = 'Pilih salah satu jawaban.';
    feedbackEl.className = 'mobile-quiz-feedback';
  }

  optionsEl.innerHTML = (scenario.options ?? [])
    .map((option, index) => {
      const label = String(option.label ?? String.fromCharCode(65 + index)).replace(/</g, '&lt;');
      const text = String(option.text ?? '').replace(/</g, '&lt;');
      return `
        <button
          type="button"
          class="mobile-quiz-option"
          data-option-index="${index}"
          data-next="${String(option.next ?? '')}"
          data-consequence="${String(option.consequence ?? '')}"
          data-correct="${option.correct ? 'true' : 'false'}"
        ><span class="opt-label">${label}</span><span>${text}</span></button>
      `;
    })
    .join('');

  optionsEl.querySelectorAll('.mobile-quiz-option').forEach((button) => {
    button.addEventListener('click', () => handleOption(button));
  });

  popup.classList.remove('hidden');
}

/* ---------- Timed overlay (teks/gambar pada detik tertentu) ----------
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
function detachTimedOverlays() {
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
function attachTimedOverlays(scenario) {
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

/** Render scene 360 mobile (A-Frame videosphere) — perilaku lama. */
// renderMobile360Scenario: UNTUK APA? Bangun scene A-Frame 360 mobile via buildSceneHtml + bind event.
// KENAPA? Harus keluar dari mode flat dulu (unlock, pause flat, sembunyi popup) agar resource tidak dobel.
function renderMobile360Scenario(scenario) {
  const mobileMount = document.getElementById('mobileSceneMount');
  const flatWrap = document.getElementById('mobileFlatWrap');
  if (!mobileMount) {
    console.error('Elemen #mobileSceneMount tidak ditemukan di index.html');
    return;
  }

  exitFlatLandscape();
  flatWrap?.classList.add('hidden');
  try {
    document.getElementById('mobileFlatVideo')?.pause();
  } catch { /* abaikan */ }
  hideMobilePopups();

  mobileMount.classList.remove('hidden');
  mobileMount.innerHTML = buildSceneHtml({
    mode: 'mobile',
    eye: 'main',
    scenario,
  });

  bindSceneEvents(mobileMount);
}

/** Render video flat fullscreen (Sony A6400) — tanpa A-Frame. */
// renderMobileFlatScenario: UNTUK APA? Tampilkan <video> fullscreen + judul/tag + tombol kembali/rotate.
// KENAPA? Flat tanpa videosphere hemat resource; onclick di-assign ulang agar listener tidak menumpuk.
function renderMobileFlatScenario(scenario) {
  const mobileMount = document.getElementById('mobileSceneMount');
  const flatWrap = document.getElementById('mobileFlatWrap');
  const video = document.getElementById('mobileFlatVideo');
  if (!flatWrap || !video) {
    console.error('Elemen #mobileFlatWrap / #mobileFlatVideo tidak ditemukan.');
    return;
  }

  // Matikan scene 360 agar tidak dobel resource.
  if (mobileMount) {
    mobileMount.innerHTML = '';
    mobileMount.classList.add('hidden');
  }

  hideMobilePopups();
  flatWrap.classList.remove('hidden');

  const titleEl = document.getElementById('mobileFlatTitle');
  const tagEl = document.getElementById('mobileFlatTag');
  if (titleEl) titleEl.textContent = scenario.title ?? '-';
  if (tagEl) {
    const kind = scenario.type === 'decision' ? 'Decision point' : (scenario.type ?? 'Video');
    tagEl.textContent = `${kind} • fullscreen HP`;
  }

  if (video.getAttribute('src') !== scenario.video) {
    try { video.pause(); } catch { /* abaikan */ }
    video.setAttribute('src', scenario.video);
    video.load();
  }
  video.onended = handleVideoEnded;
  video.onerror = () => {
    console.warn('Video flat gagal dimuat:', video.getAttribute('src'));
  };

  // Tombol kembali (assign ulang agar tidak dobel listener).
  const backButton = document.getElementById('mobileFlatBack');
  if (backButton) {
    backButton.onclick = () => {
      exitFlatLandscape();
      navHandlers?.backToModeSelection?.();
    };
  }
  const endBackButton = document.getElementById('mobileEndBack');
  if (endBackButton) {
    endBackButton.onclick = () => {
      exitFlatLandscape();
      navHandlers?.backToModeSelection?.();
    };
  }

  // Otomatis coba landscape setiap masuk segmen flat Sony.
  tryFlatLandscape();
}

/**
 * Pasang event listener untuk video, opsi kuis, dan tombol kembali di root scene.
 * - Video: ended/error
 * - Quiz options: click, mouseenter, mouseleave
 * - World back button: click -> kembali ke pemilihan mode
 */
// bindSceneEvents: UNTUK APA? Wiring scene 3D: ended video, klik/hover opsi kuis, tombol kembali dunia.
// KENAPA? Hover hanya ubah warna bila belum dipilih; kalibrasi bedakan kembali ke modul vs pilih mode.
export function bindSceneEvents(root) {
  const videos = [...root.querySelectorAll('.scenario-video')];

  videos.forEach((video) => {
    video.addEventListener('ended', handleVideoEnded);
    video.addEventListener('error', () => {
      console.warn('Video gagal dimuat:', video.getAttribute('src'));
    });
  });

  const options = root.querySelectorAll('.quiz-option');

  options.forEach((option) => {
    option.addEventListener('click', () => handleOption(option));

    option.addEventListener('mouseenter', () => {
      const bg = option.querySelector('.option-bg');

      if (bg) {
        bg.setAttribute('color', '#3f6f8d');
      }
    });

    option.addEventListener('mouseleave', () => {
      const bg = option.querySelector('.option-bg');

      if (bg && !option.dataset.selected) {
        bg.setAttribute('color', '#6f9fbd');
      }
    });
  });

  root.querySelectorAll('.world-back-button').forEach((button) => {
    button.addEventListener('click', () => {
      if (store.activeModule?.type === 'calibration') {
        navHandlers?.backToModules?.();
        return;
      }

      navHandlers?.backToModeSelection?.();
    });
  });

  // Gerbang START VR: klik mouse/touch sebagai fallback uji laptop
  // (di HP VR pemicunya tatap + tombol remote via gaze.js).
  root.querySelectorAll('.vr-start-gate').forEach((gate) => {
    gate.addEventListener('click', () => {
      startVrPlayback();
    });
  });
}

/**
 * Handler ketika sebuah video skenario selesai diputar.
 * Menentukan langkah berikutnya berdasarkan `scenario.type`.
 */
let endRedirectTimer = null;

/** Video terakhir selesai -> langsung kembali ke halaman pilih mode modul tersebut. */
// handleModuleEnd: UNTUK APA? Akhiri modul: jeda video, sembunyi popup/overlay, fade pesan lalu kembali pilih mode.
// KENAPA? Guard endRedirectTimer cegah dobel redirect; try/catch fade agar tetap kembali bila overlay hilang.
function handleModuleEnd() {
  if (endRedirectTimer) return;
  pauseActiveVideos();
  hideMobilePopups();
  hideTimedOverlays();

  const goBack = () => {
    endRedirectTimer = null;
    navHandlers?.backToModeSelection?.();
  };

  // Tampilkan pesan penutup sebentar agar transisi tidak terasa kepotong.
  try {
    const overlay = getFadeOverlay(store.activeMode);
    if (overlay) {
      setFadeMessage(store.activeMode, 'Modul selesai — kembali ke pilih mode…');
      fadeOverlay(store.activeMode, 1);
      endRedirectTimer = window.setTimeout(() => {
        fadeOverlay(store.activeMode, 0);
        goBack();
      }, 1400);
      return;
    }
  } catch { /* abaikan, langsung kembali */ }

  endRedirectTimer = window.setTimeout(goBack, 600);
}

export function handleVideoEnded() {
  // handleVideoEnded: UNTUK APA? Router alur setelah video habis berdasarkan scenario.type.
  // KENAPA? Tiap tipe beda: decision tampilkan kuis; consequence/linear ikuti next/returnTo; end tutup modul.
  const currentScenario = getActiveScenario();

  if (!currentScenario) {
    return;
  }

  // Video habis = segmen tuntas ditonton -> catat progres modul.
  try {
    markWatched(store.activeModule?.id, currentScenario.id);
  } catch { /* progres opsional, jangan ganggu alur */ }

  // Cabang decision: video selesai berarti waktunya memilih -> tampilkan kuis (lanjut di handleOption).
  if (currentScenario.type === 'decision') {
    showQuiz();
    return;
  }

  // Cabang consequence: video akibat selesai -> ke next, atau kembali ke soal (returnTo + quiz langsung).
  if (currentScenario.type === 'consequence') {
    if (currentScenario.next && store.scenarioMap.has(currentScenario.next)) {
      store.activeScenarioId = currentScenario.next;
      renderActiveScenario();
      return;
    }

    if (currentScenario.returnTo && store.scenarioMap.has(currentScenario.returnTo)) {
      store.activeScenarioId = currentScenario.returnTo;
      store.shouldShowQuizImmediately = true;
      renderActiveScenario();
      return;
    }

    // Konsekuensi tanpa lanjutan = akhir modul.
    handleModuleEnd();
    return;
  }

  // Cabang linear: video bersambung -> ke next bila ada, bila tidak berarti modul selesai.
  if (currentScenario.type === 'linear') {
    if (currentScenario.next && store.scenarioMap.has(currentScenario.next)) {
      store.activeScenarioId = currentScenario.next;
      renderActiveScenario();
      return;
    }

    // Linear tanpa next = video terakhir modul.
    handleModuleEnd();
    return;
  }

  // Cabang end: penanda akhir modul -> langsung tutup dan kembali ke pilih mode.
  if (currentScenario.type === 'end') {
    handleModuleEnd();
  }
}

/** Tampilkan panel kuis untuk skenario aktif (jika ada pertanyaan dan opsi). */
// showQuiz: UNTUK APA? Tampilkan kuis: popup HTML bila mobile-flat, panel 3D visible bila 360/VR.
// KENAPA? Tutup overlay dulu anti tumpuk; skenario end tanpa soal langsung dianggap modul selesai.
export function showQuiz() {
  // Quiz menutup overlay terjadwal agar tidak saling menutupi.
  hideTimedOverlays();
  const currentScenario = getActiveScenario();

  if (!currentScenario?.question || !Array.isArray(currentScenario.options)) {
    // Skenario 'end' tanpa pertanyaan = modul selesai -> kembali ke pilih mode.
    if (currentScenario?.type === 'end') {
      handleModuleEnd();
    }
    return;
  }

  // Mobile + video flat (Sony A6400): popup HTML di depan video.
  if (store.activeMode === 'mobile' && isFlatScenario(currentScenario)) {
    pauseActiveVideos();
    renderMobileQuizPopup(currentScenario);
    return;
  }

  document.querySelectorAll('.quiz-panel').forEach((panel) => {
    panel.setAttribute('visible', 'true');
  });
}

/** Reset status visual semua opsi kuis (hapus seleksi dan set warna default). */
// resetOptionStates: UNTUK APA? Kembalikan semua opsi 3D + HTML ke netral sebelum penilaian baru.
// KENAPA? Dipanggil awal handleOption agar warna/selected jawaban lama tidak terbawa ke soal berikutnya.
export function resetOptionStates() {
  document.querySelectorAll('.quiz-option').forEach((option) => {
    option.dataset.selected = '';

    const bg = option.querySelector('.option-bg');

    if (bg) {
      bg.setAttribute('color', '#6f9fbd');
    }
  });

  document.querySelectorAll('.mobile-quiz-option').forEach((option) => {
    option.classList.remove('correct', 'wrong');
    option.disabled = false;
  });
}

/** Tampilkan pesan umpan balik di panel kuis (teks + warna). */
// setFeedback: UNTUK APA? Tulis pesan benar/salah ke teks 3D + popup HTML mobile.
// KENAPA? Guard popup hidden agar pesan lama tidak menimpa popup yang sedang tertutup; warna kuning default netral.
export function setFeedback(message, color = '#fef08a') {
  document.querySelectorAll('.feedback-text').forEach((text) => {
    text.setAttribute('value', message);
    text.setAttribute('color', color);
  });

  const mobileFeedback = document.getElementById('mobileQuizFeedback');
  if (mobileFeedback && !document.getElementById('mobileQuizPopup')?.classList.contains('hidden')) {
    mobileFeedback.textContent = message;
    mobileFeedback.className = `mobile-quiz-feedback${color === '#bbf7d0' ? ' good' : color === '#fecaca' ? ' bad' : ''}`;
  }
}

/** Beri warna pada opsi yang dipilih: hijau jika benar, merah jika salah. */
// colorSelectedOptions: UNTUK APA? Tandai opsi terpilih (hijau benar / merah salah) di 3D + HTML lalu kunci HTML.
// KENAPA? Kunci disabled mencegah tap dobel selama jeda 1200ms sebelum navigasi segmen berikutnya.
export function colorSelectedOptions(index, correct) {
  document.querySelectorAll(`.quiz-option[data-option-index="${index}"]`).forEach((option) => {
    option.dataset.selected = 'true';

    const bg = option.querySelector('.option-bg');

    if (bg) {
      bg.setAttribute('color', correct ? '#16a34a' : '#dc2626');
    }
  });

  document.querySelectorAll(`.mobile-quiz-option[data-option-index="${index}"]`).forEach((option) => {
    option.classList.add(correct ? 'correct' : 'wrong');
  });
  // Kunci semua opsi HTML agar tidak bisa tap dobel selama transisi.
  document.querySelectorAll('.mobile-quiz-option').forEach((option) => {
    option.disabled = true;
  });
}

/**
 * Tangani aksi ketika opsi kuis dipilih: tampilkan umpan balik, lalu navigasi ke skenario berikutnya
 * atau ke skenario konsekuensi sesuai properti `next` / `consequence` pada opsi.
 */
// handleOption: UNTUK APA? Nilai jawaban (benar/salah), beri warna+feedback, lalu navigasi setelah 1200ms.
// KENAPA? consequence selalu menang (tampilkan akibat salah); next hanya bila benar — jeda memberi waktu baca feedback.
export function handleOption(optionEntity) {
  const optionIndex = optionEntity.dataset.optionIndex;
  const correct = optionEntity.dataset.correct === 'true';
  const nextScenario = optionEntity.dataset.next;
  const consequenceScenario = optionEntity.dataset.consequence;

  resetOptionStates();
  colorSelectedOptions(optionIndex, correct);

  setFeedback(
    correct
      ? 'Jawaban benar. Lanjut ke tahap berikutnya.'
      : 'Jawaban salah. Tampilkan konsekuensi, lalu kembali ke pertanyaan.',
    correct ? '#bbf7d0' : '#fecaca'
  );

  window.setTimeout(() => {
    if (consequenceScenario && store.scenarioMap.has(consequenceScenario)) {
      store.activeScenarioId = consequenceScenario;
      renderActiveScenario();
      return;
    }

    if (correct && nextScenario && store.scenarioMap.has(nextScenario)) {
      store.activeScenarioId = nextScenario;
      renderActiveScenario();
      return;
    }
  }, 1200);
}

/**
 * Render skenario aktif ke layar sesuai mode (VR atau mobile).
 * Menangani pembuatan scene, pemasangan video, binding event, dan transisi.
 */
// renderActiveScenario: UNTUK APA? Orkestrasi render segmen: fade, clear, bangun VR/mobile, overlay, lalu play/quiz.
// KENAPA? Batalkan timer + detach overlay dulu agar segmen baru bersih; shouldShowQuizImmediately untuk kembalian consequence.
export async function renderActiveScenario() {
  const scenario = getActiveScenario();

  if (!scenario) {
    return;
  }

  // Batalkan timer auto-kembali yang tertunda (mis. user pindah segmen manual).
  if (endRedirectTimer) {
    window.clearTimeout(endRedirectTimer);
    endRedirectTimer = null;
  }

  // Reset mesin overlay terjadwal untuk segmen baru.
  detachTimedOverlays();

  const overlay = getFadeOverlay(store.activeMode);
  if (overlay) {
    setFadeMessage(store.activeMode, await getTransitionMessage(scenario));
    await fadeOverlay(store.activeMode, 1);
  }

  clearScenes();

  if (store.activeMode === 'vr') {
    const vrLeftMount = document.getElementById('vrLeftMount');
    const vrRightMount = document.getElementById('vrRightMount');
    if (!vrLeftMount || !vrRightMount) {
      console.error('Elemen #vrLeftMount atau #vrRightMount tidak ditemukan di index.html');
      return;
    }

    // 1 video yang dipakai bersama oleh scene kiri dan kanan.
    const sharedVideo = ensureSharedVrVideo(scenario);
    sharedVideo.onended = handleVideoEnded;

    // Gerbang START: tiap segmen VR di-pause di awal (waktu pasang HP ke
    // kacamata). Kecuali kembali dari konsekuensi (shouldShowQuizImmediately):
    // kuis langsung tampil, gate disembunyikan.
    const showGate = !store.shouldShowQuizImmediately;
    try {
      sharedVideo.pause();
    } catch { /* abaikan */ }

    // Tampilan kiri dan kanan.
    vrLeftMount.innerHTML = buildSceneHtml({
      mode: 'vr',
      eye: 'left',
      scenario,
    });

    vrRightMount.innerHTML = buildSceneHtml({
      mode: 'vr',
      eye: 'right',
      scenario,
    });

    bindSceneEvents(vrLeftMount);
    bindSceneEvents(vrRightMount);
    if (!showGate) hideVrStartGate();
    applyCalibrationTarget('vr');
    // Layar split kiri-kanan butuh landscape: kunci otomatis (gagal diam-diam di browser).
    lockLandscape();
  }

  if (store.activeMode === 'mobile') {
    if (isFlatScenario(scenario)) {
      renderMobileFlatScenario(scenario);
    } else {
      renderMobile360Scenario(scenario);
    }
  }

  // Pasang overlay terjadwal (teks/gambar detik tertentu) ke video aktif.
  attachTimedOverlays(scenario);

  if (store.shouldShowQuizImmediately) {
    setTimeout(() => {
      pauseActiveVideos();
      showQuiz();
      store.shouldShowQuizImmediately = false;
    }, 500);
  } else if (store.activeMode !== 'vr') {
    // Mobile (flat/360) auto-play; VR menunggu tombol START di environment.
    setTimeout(playActiveVideos, 400);
  }

  if (overlay) {
    setTimeout(() => {
      fadeOverlay(store.activeMode, 0);
    }, 1800);
  }
}
