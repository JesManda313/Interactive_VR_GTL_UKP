// scenario.js: controller alur skenario & kuis (mobile + VR).
// Selector state, orientasi, overlay, dan UI kuis ada di modul scenario-*.js.
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
// import { testOnTap,  testOnFeedbackPrepared,  testOnRenderStart,  testOnRenderReady,  testOnVideoStart,} from '../testing/instrument.js';

export { getActiveScenario, isFlatScenario };
export { lockLandscape, unlockOrientation } from './scenario-orientation.js';
export { hideTimedOverlays };
export { resetOptionStates, setFeedback, colorSelectedOptions };

// navHandlers: callback navigasi dari navigation.js (hindari circular import).
let navHandlers = null;

// setNavHandlers(): simpan callback navigasi dari navigation.js.
export function setNavHandlers(handlers) {
  navHandlers = handlers;
}


// loadScenarios(): fetch scenarios.json lalu isi store + aktifkan skenario pertama.
export async function loadScenarios(scenarioUrl) {
  const response = await fetch(scenarioUrl);

  if (!response.ok) {
    throw new Error('Gagal membaca scenarios.json modul.');
  }

  store.scenarios = await response.json();
  store.scenarioMap = new Map(store.scenarios.map((scenario) => [scenario.id, scenario]));
  store.activeScenarioId = store.scenarios[0]?.id ?? null;
}

// hideVrStartGate(): sembunyikan gerbang START VR tanpa memutar video.
function hideVrStartGate() {
  document.querySelectorAll('.vr-start-gate').forEach((el) => {
    try {
      el.setAttribute('visible', 'false');
    } catch { /* abaikan */ }
  });
}

// startVrPlayback(): tutup gerbang START lalu putar video (dipanggil gaze.js + klik mouse).
export function startVrPlayback() {
  if (store.activeMode !== 'vr') return;
  hideVrStartGate();
  playActiveVideos();
}

// hideMobilePopups(): tutup popup kuis/akhir mobile agar tidak menutupi segmen baru.
export function hideMobilePopups() {
  document.getElementById('mobileQuizPopup')?.classList.add('hidden');
  document.getElementById('mobileEndPopup')?.classList.add('hidden');
}

// renderMobile360Scenario(): bangun scene A-Frame 360 mobile via buildSceneHtml.
// Keluar mode flat dulu (pause + sembunyi popup) agar resource tidak dobel.
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

// renderMobileFlatScenario(): tampilkan video flat fullscreen + judul/tag + tombol kembali.
// onclick di-assign ulang agar listener tidak menumpuk.
function renderMobileFlatScenario(scenario) {
  const mobileMount = document.getElementById('mobileSceneMount');
  const flatWrap = document.getElementById('mobileFlatWrap');
  const video = document.getElementById('mobileFlatVideo');
  if (!flatWrap || !video) {
    console.error('Elemen #mobileFlatWrap / #mobileFlatVideo tidak ditemukan.');
    return;
  }

  // Lepas scene 360 agar resource tidak dobel.
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

  // Assign ulang onclick agar listener tidak dobel.
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

  // Coba landscape tiap masuk segmen flat.
  tryFlatLandscape();
}

// bindSceneEvents(): wiring scene 3D (video ended, opsi kuis, tombol kembali dunia).
// Hover hanya ubah warna bila belum dipilih; kalibrasi kembali ke daftar modul.
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
      // testOnTap(event);
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

  // Gerbang START VR: fallback klik mouse/touch (HP VR lewat gaze.js).
  root.querySelectorAll('.vr-start-gate').forEach((gate) => {
    gate.addEventListener('click', (event) => {
      // testOnVideoStart(event); // (dinonaktifkan sementara)
      startVrPlayback();
    });
  });
}

// Auto-fit kuis VR.

// measureTextBlock(): ukur ukuran nyata <a-text> termasuk scale elemen (untuk background opsi).
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

  // Lebar nyata dari bounding box mesh; layout.width = lebar wrap, bukan lebar teks.
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

// applyVrQuizLayout(): susun opsi horizontal, background ikut teks, panel meninggi bila perlu.
// Return false bila font/layout belum siap (perlu dicoba lagi).
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

    // Padding + ukuran minimum agar tetap nyaman jadi target gaze.
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

  // Ruang untuk judul/pertanyaan di atas dan feedback di bawah.
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

// fitVrQuizLayout(): tunggu font A-Frame (textfontset) lalu ukur ulang, maks 40 percobaan.
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

// endRedirectTimer: guard agar redirect ke pilih mode tidak dobel.
let endRedirectTimer = null;

// handleModuleEnd(): jeda video, bersihkan popup/overlay, fade pesan, lalu kembali ke pilih mode.
function handleModuleEnd() {
  if (endRedirectTimer) return;
  pauseActiveVideos();
  hideMobilePopups();
  hideTimedOverlays();

  const goBack = () => {
    endRedirectTimer = null;
    navHandlers?.backToModeSelection?.();
  };

  // Pesan penutup singkat agar transisi tidak terasa kepotong.
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

// cancelPendingRedirects(): batalkan timer auto-kembali saat user keluar player manual.
// Tanpa ini timer nyasar bisa memicu navigasi setelah layar berganti (popup stuck).
export function cancelPendingRedirects() {
  if (endRedirectTimer) {
    window.clearTimeout(endRedirectTimer);
    endRedirectTimer = null;
  }
  detachTimedOverlays();
}

// handleVideoEnded(): router alur setelah video habis, per scenario.type.
export function handleVideoEnded() {
  const currentScenario = getActiveScenario();

  if (!currentScenario) {
    return;
  }

  // Tandai segmen tuntas ditonton (progres opsional).
  try {
    markWatched(store.activeModule?.id, currentScenario.id);
  } catch { /* progres opsional, jangan ganggu alur */ }

  // Decision: video selesai -> tampilkan kuis (lanjut di handleOption).
  if (currentScenario.type === 'decision') {
    showQuiz();
    return;
  }

  // Consequence: ke next, atau kembali ke soal via returnTo (kuis langsung).
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

  // Linear: ke next bila ada, bila tidak modul selesai.
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

  // End: penanda akhir modul.
  if (currentScenario.type === 'end') {
    handleModuleEnd();
  }
}

// showQuiz(): tampilkan kuis (popup HTML bila mobile-flat, panel 3D bila 360/VR).
// Overlay ditutup dulu agar tidak menumpuk; end tanpa soal = modul selesai.
export function showQuiz() {
  // Tutup overlay terjadwal agar tidak menutupi kuis.
  hideTimedOverlays();
  const currentScenario = getActiveScenario();

  if (!currentScenario?.question || !Array.isArray(currentScenario.options)) {
    // end tanpa pertanyaan = modul selesai.
    if (currentScenario?.type === 'end') {
      handleModuleEnd();
    }
    return;
  }

  // Mobile flat: popup HTML di atas video.
  if (store.activeMode === 'mobile' && isFlatScenario(currentScenario)) {
    pauseActiveVideos();
    renderMobileQuizPopup(currentScenario, (event, button) => {
      // testOnTap(event);
      handleOption(button);
    });
    return;
  }

  document.querySelectorAll('.quiz-panel').forEach((panel) => {
    panel.setAttribute('visible', 'true');
  });
}

// handleOption(): nilai jawaban, beri warna + feedback, navigasi setelah 1200ms (jeda baca).
// consequence selalu menang; next hanya bila benar.
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

  // testOnFeedbackPrepared();

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

// renderActiveScenario(): orkestrasi render segmen (fade, scene VR/mobile, overlay, play/quiz).
// Timer + overlay lama dibersihkan dulu; shouldShowQuizImmediately untuk kembalian consequence.
export async function renderActiveScenario() {
  const scenario = getActiveScenario();

  if (!scenario) {
    return;
  }

  // testOnRenderStart();

  // Batalkan timer auto-kembali yang tertunda.
  if (endRedirectTimer) {
    window.clearTimeout(endRedirectTimer);
    endRedirectTimer = null;
  }

  // Reset overlay terjadwal untuk segmen baru.
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

    // Satu video dipakai bersama scene kiri dan kanan.
    const sharedVideo = ensureSharedVrVideo(scenario);
    sharedVideo.onended = handleVideoEnded;

    // VR: video di-pause tiap segmen (waktu pasang HP); bila kembali dari
    // konsekuensi kuis langsung tampil dan gate disembunyikan.
    const showGate = !store.shouldShowQuizImmediately;
    try {
      sharedVideo.pause();
    } catch { /* abaikan */ }

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
    // Split kiri-kanan butuh landscape (gagal diam-diam di browser).
    lockLandscape();
  }

  if (store.activeMode === 'mobile') {
    if (isFlatScenario(scenario)) {
      renderMobileFlatScenario(scenario);
    } else {
      renderMobile360Scenario(scenario);
    }
  }

  // Pasang overlay terjadwal ke video aktif.
  attachTimedOverlays(scenario);

  // testOnRenderReady();

  if (store.shouldShowQuizImmediately) {
    setTimeout(() => {
      pauseActiveVideos();
      showQuiz();
      store.shouldShowQuizImmediately = false;
    }, 500);
  } else if (store.activeMode !== 'vr' && !store.awaitMobileGuide) {
    // Mobile auto-play; VR menunggu tombol START. awaitMobileGuide menahan
    // video sampai panduan "Mengerti, mulai" ditutup.
    setTimeout(playActiveVideos, 400);
  }

  if (overlay) {
    setTimeout(() => {
      fadeOverlay(store.activeMode, 0);
    }, 1800);
  }
}
