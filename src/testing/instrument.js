/**
 * instrument.js — penghubung antara aplikasi dan mesin pengukuran.
 *
 * Semua logika pengukuran ada di metrics.js. File ini hanya:
 * 1. Menentukan apakah test mode aktif (?test=1 atau localStorage).
 * 2. Memasang pengamat elemen <video>.
 * 3. Menyediakan fungsi hook yang dipanggil dari file aplikasi.
 *
 * Tidak ada efek apa pun kalau test mode tidak aktif.
 */
import { store } from '../js/store.js';
import {
  TEST_MODE_KEY,
  attachVideo,
  beginInteraction,
  beginVideoStart,
  initMetrics,
  isEnabled,
  markFeedbackPrepared,
  markRenderReady,
  markRenderStart,
} from './metrics.js';

let initialized = false;

/**
 * Aktif jika:
 * - URL punya ?test=1  -> aktif + diingat di localStorage
 * - URL punya ?test=0  -> nonaktif + hapus localStorage
 * - Selain itu, ikuti localStorage (berguna untuk APK yang sulit diberi query).
 */
export function isTestModeRequested() {
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('test');

    if (flag === '0') {
      localStorage.removeItem(TEST_MODE_KEY);
      return false;
    }

    if (flag === '1') {
      localStorage.setItem(TEST_MODE_KEY, '1');
      return true;
    }

    return localStorage.getItem(TEST_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function initTesting() {
  if (initialized) {
    return;
  }

  if (!isTestModeRequested()) {
    return;
  }

  initialized = true;
  initMetrics();
  installVideoObserver();

  // HUD dimuat dinamis supaya CSS/JS-nya tidak ikut ke bundle utama.
  import('./hud.js')
    .then(({ initHud }) => initHud())
    .catch((error) => console.warn('[GTL Test] HUD gagal dimuat:', error));

  console.info(
    '[GTL Test] Mode uji aktif.\n'
    + 'HUD: Ctrl+Shift+H untuk sembunyikan/tampilkan, Ctrl+Shift+E untuk ekspor.\n'
    + 'Console: __GTL_TEST__.csv() / __GTL_TEST__.summary() / __GTL_TEST__.reset().',
  );
}

/* ------------------------------------------------------------------ */
/* Pengamat video                                                      */
/* ------------------------------------------------------------------ */

function installVideoObserver() {
  const scan = (node) => {
    if (!node || node.nodeType !== 1) {
      return;
    }

    if (node.tagName === 'VIDEO') {
      attachVideo(node);
    }

    node.querySelectorAll?.('video').forEach((video) => attachVideo(video));
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach(scan);
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Video yang sudah ada sejak awal (mis. #mobileFlatVideo).
  scan(document.body);
}

/* ------------------------------------------------------------------ */
/* Hook input                                                          */
/* ------------------------------------------------------------------ */

/** Remote Bluetooth: dipanggil saat edge tombol terdeteksi di vr-player.js. */
export function testOnRemoteEdge() {
  if (!isEnabled() || store.activeMode !== 'vr') {
    return;
  }

  if (store.activeModule?.type === 'calibration') {
    return;
  }

  beginInteraction('remote', { scenario: 'answer' });
}

/** Keyboard fallback: Enter/Space di mode VR. */
export function testOnKeyboardInput(event) {
  if (!isEnabled() || store.activeMode !== 'vr') {
    return;
  }

  beginInteraction('keyboard', {
    scenario: 'answer',
    t0: event?.timeStamp,
  });
}

/** Klik canvas VR (fallback mouse/tap di laptop). */
export function testOnCanvasClick(event) {
  if (!isEnabled() || store.activeMode !== 'vr') {
    return;
  }

  beginInteraction('canvas', {
    scenario: 'answer',
    t0: event?.timeStamp,
  });
}

/**
 * Klik/tap opsi kuis atau gerbang START.
 * Dipanggil dari bindSceneEvents (opsi 3D & gate) dan renderMobileQuizPopup (HTML).
 */
export function testOnTap(event) {
  if (!isEnabled()) {
    return;
  }

  const target = event?.target;

  if (!target || typeof target.closest !== 'function') {
    return;
  }

  const gate = target.closest('.vr-start-gate');

  if (gate) {
    beginVideoStart(event);
    return;
  }

  // Mode picker juga memakai class .mobile-quiz-option; batasi ke popup kuis.
  const option = target.closest('#mobileQuizOptions .mobile-quiz-option, .quiz-option');

  if (!option) {
    return;
  }

  const source = (navigator.maxTouchPoints || 0) > 0 ? 'tap' : 'mouse';

  beginInteraction(source, {
    scenario: 'answer',
    t0: event?.timeStamp,
  });
}

/* ------------------------------------------------------------------ */
/* Hook proses                                                         */
/* ------------------------------------------------------------------ */

/** Setelah handleOption selesai mengubah warna + feedback (T1). */
export function testOnFeedbackPrepared() {
  markFeedbackPrepared();
}

/** Awal render segmen baru (T1 transisi, setelah jeda desain 1200 ms). */
export function testOnRenderStart() {
  markRenderStart();
}

/** Scene segmen baru selesai terpasang (T2 transisi). */
export function testOnRenderReady() {
  markRenderReady();
}

/** Tombol START VR ditekan (via remote, keyboard, canvas, atau klik gate). */
export function testOnVideoStart(event = null) {
  if (!isEnabled()) {
    return;
  }

  beginVideoStart(event);
}
