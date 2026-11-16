/**
 * scenario.js — scenario & quiz engine (controller).
 * Dipakai mobile-player.html + vr-player.html.
 *
 * File ini tetap memegang alur utama (handleOption -> renderActiveScenario ->
 * showQuiz -> handleOption). Bagian yang lepas dipindah ke modul khusus:
 * - scenario-state.js       : selector state skenario
 * - scenario-orientation.js : lock landscape / hint rotate
 * - scenario-overlays.js    : overlay terjadwal
 * - scenario-quiz-ui.js     : popup + status visual kuis
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
import { buildSceneHtml } from './scene-builders.js';
import { getActiveScenario, isFlatScenario } from './scenario-state.js';
import { lockLandscape, tryFlatLandscape, exitFlatLandscape} from './scenario-orientation.js';
import { attachTimedOverlays, detachTimedOverlays, hideTimedOverlays, } from './scenario-overlays.js';
import { renderMobileQuizPopup, resetOptionStates, setFeedback, colorSelectedOptions, } from './scenario-quiz-ui.js';
// import { testOnTap,  testOnFeedbackPrepared,  testOnRenderStart,  testOnRenderReady,  testOnVideoStart,} from '../testing/instrument.js'; // (dinonaktifkan sementara)

export { getActiveScenario, isFlatScenario };
export { lockLandscape, unlockOrientation } from './scenario-orientation.js';
export { hideTimedOverlays };
export { resetOptionStates, setFeedback, colorSelectedOptions };

// Handler navigasi (backToModules / backToModeSelection) didaftarkan oleh
let navHandlers = null;

// setNavHandlers: UNTUK APA? Menyimpan callback navigasi (backToModules/backToModeSelection) dari navigation.js.
// KENAPA? Agar scenario.js bisa pindah halaman tanpa import navigation (menghindari circular import).
export function setNavHandlers(handlers) {
  navHandlers = handlers;
}


//Fetch scenarios.json lalu isi store.scenarios/Map + set skenario pertama aktif.
export async function loadScenarios(scenarioUrl) {
  const response = await fetch(scenarioUrl);

  if (!response.ok) {
    throw new Error('Gagal membaca scenarios.json modul.');
  }

  store.scenarios = await response.json();
  store.scenarioMap = new Map(store.scenarios.map((scenario) => [scenario.id, scenario]));
  store.activeScenarioId = store.scenarios[0]?.id ?? null;
}

/** Sembunyikan gerbang START VR di kedua mata saat setelah pencet tombol start */
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
    option.addEventListener('click', (event) => {
      // testOnTap(event); // (dinonaktifkan sementara)
      handleOption(option);
    });

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
    gate.addEventListener('click', (event) => {
      // testOnVideoStart(event); // (dinonaktifkan sementara)
      startVrPlayback();
    });
  });
}

/* ------------------------------------------------------------------ */
/* Auto-fit kuis VR                                                    */
/* ------------------------------------------------------------------ */

/**
 * Ukur ukuran nyata blok <a-text> (sudah termasuk scale elemen).
 * Dipakai agar background opsi bisa mengikuti panjang/tinggi teks.
 */
function measureTextBlock(textEl) {
  const text = textEl?.components?.text;
  const font = text?.currentFont;
  const layout = text?.geometry?.layout;

  if (!text || !font || !layout || !text.geometry || !text.mesh) {
    return null;
  }

  const wrapPixels = text.data.wrapPixels
    || (0.5 + text.data.wrapCount) * font.widthFactor;
  const textScale = (text.data.width || 1) / wrapPixels;

  if (!Number.isFinite(textScale) || textScale <= 0) {
    return null;
  }

  // Lebar baris terpanjang diambil dari bounding box mesh teks (layout.width
  // selalu sama dengan lebar wrap, bukan lebar teks sesungguhnya).
  text.geometry.computeBoundingBox();
  const box = text.geometry.boundingBox;
  const rawWidth = box
    ? (box.max.x - box.min.x) * textScale
    : layout.width * textScale;
  const rawHeight = (layout.height + layout.descender) * textScale;

  const elementScale = textEl.object3D?.scale;
  const scaleX = Math.abs(elementScale?.x || 1);
  const scaleY = Math.abs(elementScale?.y || 1);

  return {
    width: Math.max(0.1, rawWidth * scaleX),
    height: Math.max(0.05, rawHeight * scaleY),
  };
}

/**
 * Susun ulang opsi kuis VR: background mengikuti teks, opsi disusun horizontal,
 * dan panel ikut meninggi bila isinya tidak muat.
 * @returns {boolean} false bila font/layout belum siap (perlu dicoba lagi).
 */
function applyVrQuizLayout(panel, options) {
  const panelBg = panel.querySelector('.quiz-panel-bg');
  const panelAccent = panel.querySelector('.quiz-panel-accent');
  const titleEl = panel.querySelector('.quiz-panel-title');
  const questionEl = panel.querySelector('.quiz-question-text');
  const feedbackEl = panel.querySelector('.feedback-text');

  if (!panelBg) {
    return false;
  }

  const measured = [];

  for (const option of options) {
    const textEl = option.querySelector('.quiz-option-text');
    const bg = option.querySelector('.option-bg');
    const dims = measureTextBlock(textEl);

    if (!bg || !dims) {
      return false;
    }

    // Padding + ukuran minimum supaya kotak tetap nyaman jadi target gaze.
    const width = Math.max(1.1, dims.width + 0.34);
    const height = Math.max(0.5, dims.height + 0.24);

    bg.setAttribute('width', width.toFixed(3));
    bg.setAttribute('height', height.toFixed(3));
    measured.push({ option, width, height });
  }

  const titleDims = titleEl ? measureTextBlock(titleEl) : null;
  const questionDims = questionEl ? measureTextBlock(questionEl) : null;
  const feedbackDims = feedbackEl ? measureTextBlock(feedbackEl) : null;

  if ((titleEl && !titleDims) || (questionEl && !questionDims) || (feedbackEl && !feedbackDims)) {
    return false;
  }

  const baseWidth = Number(panel.dataset.baseWidth)
    || Number(panelBg.getAttribute('width'))
    || 2.5;
  const baseHeight = Number(panel.dataset.baseHeight)
    || Number(panelBg.getAttribute('height'))
    || 2.35;
  const optionGap = 0.12;
  const optionsWidth = measured.reduce((total, item) => total + item.width, 0)
    + optionGap * Math.max(0, measured.length - 1);
  const contentWidths = [
    optionsWidth,
    titleDims?.width ?? 0,
    questionDims?.width ?? 0,
    feedbackDims?.width ?? 0,
  ];
  const panelWidth = Math.max(baseWidth, Math.max(...contentWidths) + 0.5);
  panelBg.setAttribute('width', panelWidth.toFixed(3));
  panelAccent?.setAttribute('width', panelWidth.toFixed(3));

  const questionY = 0.62;
  const gapY = 0.12;
  const optionsHeight = Math.max(...measured.map(({ height }) => height));
  const optionsY = questionY
    - (questionDims ? questionDims.height : 0.22) / 2
    - gapY
    - optionsHeight / 2;
  let cursorX = -optionsWidth / 2;

  measured.forEach(({ option, width }) => {
    const x = cursorX + width / 2;
    option.setAttribute('position', `${x.toFixed(3)} ${optionsY.toFixed(3)} 0.04`);
    cursorX += width + optionGap;
  });

  const optionsBottom = optionsY - optionsHeight / 2;
  const feedbackHeight = feedbackDims?.height ?? 0;
  const feedbackY = optionsBottom - gapY - feedbackHeight / 2;

  if (feedbackEl) {
    feedbackEl.setAttribute('position', `0 ${feedbackY.toFixed(3)} 0.03`);
  }

  // Sediakan ruang untuk judul/pertanyaan di atas dan feedback di bawah.
  const topEdge = Math.max(
    baseHeight / 2,
    1.2 + (titleDims?.height ?? 0) / 2 + 0.08,
    questionY + (questionDims?.height ?? 0) / 2 + 0.12,
  );
  const feedbackBottom = feedbackY - feedbackHeight / 2;
  const requiredHeight = topEdge - feedbackBottom + 0.2;
  const panelHeight = Math.max(baseHeight, requiredHeight);

  panelBg.setAttribute('height', panelHeight.toFixed(3));
  panelBg.setAttribute(
    'position',
    `0 ${(topEdge - panelHeight / 2).toFixed(3)} 0`,
  );

  return true;
}

/**
 * Pasang auto-fit kuis VR. Font A-Frame dimuat asinkron, jadi tunggu
 * textfontset lalu ukur ulang (dengan beberapa kali percobaan cadangan).
 */
function fitVrQuizLayout(root) {
  const panel = root?.querySelector?.('.quiz-panel-vr');

  if (!panel) {
    return;
  }

  const options = [...panel.querySelectorAll('.quiz-option')];

  if (!options.length) {
    return;
  }

  let attempts = 0;
  let retryTimer = null;
  let done = false;

  const run = () => {
    retryTimer = null;

    if (done) {
      return;
    }

    if (applyVrQuizLayout(panel, options)) {
      done = true;
      return;
    }

    attempts += 1;

    if (attempts < 40) {
      retryTimer = window.setTimeout(run, 250);
    }
  };

  panel.querySelectorAll(
    '.quiz-option-text, .quiz-question-text, .quiz-panel-title, .feedback-text',
  ).forEach((textEl) => {
    const text = textEl.components?.text;

    if (text?.currentFont && text?.geometry?.layout) {
      window.setTimeout(run, 0);
      return;
    }

    textEl.addEventListener('textfontset', run, { once: true });
  });

  run();
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

/**
 * cancelPendingRedirects():
 * Untuk apa? Batalkan timer auto-kembali yang masih tertunda saat user keluar player manual.
 * KENAPA? Tanpa ini, timer nyasar bisa memicu navigasi/animasi setelah layar berganti
 * (salah satu pemicu bug popup stuck di layar mode).
 */
export function cancelPendingRedirects() {
  if (endRedirectTimer) {
    window.clearTimeout(endRedirectTimer);
    endRedirectTimer = null;
  }
  detachTimedOverlays();
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
    renderMobileQuizPopup(currentScenario, (event, button) => {
      // testOnTap(event); // (dinonaktifkan sementara)
      handleOption(button);
    });
    return;
  }

  document.querySelectorAll('.quiz-panel').forEach((panel) => {
    panel.setAttribute('visible', 'true');
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

  // testOnFeedbackPrepared(); // (dinonaktifkan sementara)

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

  // testOnRenderStart(); // (dinonaktifkan sementara)

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
    fitVrQuizLayout(vrLeftMount);
    fitVrQuizLayout(vrRightMount);
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

  // testOnRenderReady(); // (dinonaktifkan sementara)

  if (store.shouldShowQuizImmediately) {
    setTimeout(() => {
      pauseActiveVideos();
      showQuiz();
      store.shouldShowQuizImmediately = false;
    }, 500);
  } else if (store.activeMode !== 'vr' && !store.awaitMobileGuide) {
    // Mobile (flat/360) auto-play; VR menunggu tombol START di environment.
    // KENAPA cek awaitMobileGuide? Gerbang panduan: video ditahan sampai user
    // tekan "Mengerti, mulai" (closeMobileGuide yang memutar). Tanpa cek ini,
    // video jalan duluan di belakang modal padahal user belum siap.
    setTimeout(playActiveVideos, 400);
  }

  if (overlay) {
    setTimeout(() => {
      fadeOverlay(store.activeMode, 0);
    }, 1800);
  }
}
