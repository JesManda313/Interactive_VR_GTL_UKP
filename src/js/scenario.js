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
    }

    return;
  }

  if (currentScenario.type === 'linear') {
    if (currentScenario.next && store.scenarioMap.has(currentScenario.next)) {
      store.activeScenarioId = currentScenario.next;
      renderActiveScenario();
    }

    return;
  }

  if (currentScenario.type === 'end') {
    showQuiz();
  }
}

/** Tampilkan panel kuis untuk skenario aktif (jika ada pertanyaan dan opsi). */
export function showQuiz() {
  const currentScenario = getActiveScenario();

  if (!currentScenario?.question || !Array.isArray(currentScenario.options)) {
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
}

/** Tampilkan pesan umpan balik di panel kuis (teks + warna). */
export function setFeedback(message, color = '#fef08a') {
  document.querySelectorAll('.feedback-text').forEach((text) => {
    text.setAttribute('value', message);
    text.setAttribute('color', color);
  });
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

    document.getElementById('vrScenarioTitle').textContent = scenario.title;

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
    const mobileMount = document.getElementById('mobileSceneMount');
    if (!mobileMount) {
      console.error('Elemen #mobileSceneMount tidak ditemukan di index.html');
      return;
    }


    mobileMount.innerHTML = buildSceneHtml({
      mode: 'mobile',
      eye: 'main',
      scenario,
    });

    bindSceneEvents(mobileMount);
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
