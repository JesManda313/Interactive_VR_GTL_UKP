/**
 * scenario.js — scenario & quiz engine.
 * Dipakai mobile-player.html + vr-player.html.
 * Quiz digabung di sini karena saling memanggil dengan engine
 * (handleOption -> renderActiveScenario -> showQuiz -> handleOption).
 */
import { store } from './store.js';
import { applyCalibrationTarget } from './calibration.js';
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

// Handler navigasi (backToModules / backToModeSelection) didaftarkan oleh
// navigation.js via setNavHandlers — agar modul ini tidak import navigation
// (hindari circular import).
let navHandlers = null;

export function setNavHandlers(handlers) {
  navHandlers = handlers;
}

/** Ambil skenario untuk modul dan buat peta (Map) yang diindeks oleh id skenario. */
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
export function getActiveScenario() {
  return store.scenarioMap.get(store.activeScenarioId);
}

/**
 * TRUE jika skenario memakai video flat (projection: flat):
 * video tampil langsung fullscreen HP, tanpa videosphere/bioskop.
 * Selain itu (360 / kosong) dianggap 360.
 */
export function isFlatScenario(scenario) {
  if (!scenario) return false;
  const projection = String(scenario.projection ?? scenario.videoType ?? '').toLowerCase();
  return projection === 'flat' || projection === '2d' || projection === 'rectilinear';
}

/** Sembunyikan popup HTML mobile (quiz + end). */
export function hideMobilePopups() {
  document.getElementById('mobileQuizPopup')?.classList.add('hidden');
  document.getElementById('mobileEndPopup')?.classList.add('hidden');
}

/* ---------- Landscape khusus video flat (Sony A6400) ---------- */

/** TRUE jika layar sedang portrait. */
function isPortraitNow() {
  if (window.matchMedia) {
    return window.matchMedia('(orientation: portrait)').matches;
  }
  return window.innerHeight >= window.innerWidth;
}

/** Tampilkan/sembunyikan hint "putar HP" (hanya saat flat aktif + portrait). */
function updateRotateHintVisibility() {
  const wrap = document.getElementById('mobileFlatWrap');
  const hint = document.getElementById('mobileRotateHint');
  if (!wrap || !hint) return;
  const flatActive = !wrap.classList.contains('hidden');
  hint.classList.toggle('hidden', !(flatActive && isPortraitNow()));
}

/** Coba kunci ke landscape (tanpa fullscreen; gagal diam-diam kalau belum ada gesture). */
async function tryFlatLandscape() {
  updateRotateHintVisibility();
  try {
    if (screen.orientation?.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch {
    // Abaikan: browser butuh gesture user dulu. Hint + tombol ⛶ jadi fallback.
  }
  updateRotateHintVisibility();
}

/** Dipanggil dari tombol (ada gesture): fullscreen + kunci landscape. */
async function forceFlatLandscape() {
  const wrap = document.getElementById('mobileFlatWrap');
  try {
    if (wrap?.requestFullscreen && !document.fullscreenElement) {
      await wrap.requestFullscreen();
    } else if (wrap?.webkitRequestFullscreen && !document.webkitFullscreenElement) {
      wrap.webkitRequestFullscreen();
    }
  } catch {
    // Fullscreen ditolak — lanjut ke orientation lock saja.
  }
  try {
    if (screen.orientation?.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch {
    // Abaikan: user tinggal putar HP manual.
  }
  updateRotateHintVisibility();
}

/** Keluar dari landscape: unlock + keluar fullscreen. */
function exitFlatLandscape() {
  try {
    if (screen.orientation?.unlock) screen.orientation.unlock();
  } catch { /* abaikan */ }
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
}

/** Render popup branching HTML di depan video flat. */
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

/** Render scene 360 mobile (A-Frame videosphere) — perilaku lama. */
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

  // Tombol landscape + hint (assign ulang agar tidak dobel listener).
  const rotateButton = document.getElementById('mobileFlatRotate');
  if (rotateButton) {
    rotateButton.onclick = () => forceFlatLandscape();
  }
  const rotateGoButton = document.getElementById('mobileRotateGo');
  if (rotateGoButton) {
    rotateGoButton.onclick = () => forceFlatLandscape();
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
}

/**
 * Handler ketika sebuah video skenario selesai diputar.
 * Menentukan langkah berikutnya berdasarkan `scenario.type`.
 */
let endRedirectTimer = null;

/** Video terakhir selesai -> langsung kembali ke halaman pilih mode modul tersebut. */
function handleModuleEnd() {
  if (endRedirectTimer) return;
  pauseActiveVideos();
  hideMobilePopups();

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
  const currentScenario = getActiveScenario();

  if (!currentScenario) {
    return;
  }

  if (currentScenario.type === 'decision') {
    showQuiz();
    return;
  }

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

  if (currentScenario.type === 'end') {
    handleModuleEnd();
  }
}

/** Tampilkan panel kuis untuk skenario aktif (jika ada pertanyaan dan opsi). */
export function showQuiz() {
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
    applyCalibrationTarget('vr');
  }

  if (store.activeMode === 'mobile') {
    if (isFlatScenario(scenario)) {
      renderMobileFlatScenario(scenario);
    } else {
      renderMobile360Scenario(scenario);
    }
  }

  if (store.shouldShowQuizImmediately) {
    setTimeout(() => {
      pauseActiveVideos();
      showQuiz();
      store.shouldShowQuizImmediately = false;
    }, 500);
  } else {
    setTimeout(playActiveVideos, 400);
  }

  if (overlay) {
    setTimeout(() => {
      fadeOverlay(store.activeMode, 0);
    }, 1800);
  }
}
