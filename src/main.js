// Bootstrap — inject page partials, then init per-page modules.
// Pages (html):  src/pages/home.html, settings.html, mode.html,
//                mobile-player.html, vr-player.html
// Logic (js):    src/js/home.js, settings.js, mode.js, vr-player.js
//                (+ domain: store, utils, calibration, video, fade,
//                scene-builders, scenario, navigation, gaze)
// Shared:        src/js/store.js, utils.js, calibration.js, video.js, fade.js,
//                scene-builders.js, scenario.js, navigation.js, gaze.js
import homeHtml from './pages/home.html?raw';
import settingsHtml from './pages/settings.html?raw';
import modeHtml from './pages/mode.html?raw';
import mobilePlayerHtml from './pages/mobile-player.html?raw';
import vrPlayerHtml from './pages/vr-player.html?raw';

// Suntik semua layar ke #appShell sebelum modul page di-init.
document.getElementById('appShell').innerHTML =
  homeHtml + settingsHtml + modeHtml + mobilePlayerHtml + vrPlayerHtml;

import { store } from './js/store.js';
import { triggerSelectFromGaze } from './js/gaze.js';
import { loadModules, initHome } from './js/home.js';
import { initSettings } from './js/settings.js';
import { initMode } from './js/mode.js';
import { initVrPlayer } from './js/vr-player.js';

initHome();
initSettings();
initMode();
initVrPlayer();

// DEBUGGING
window.addEventListener('gamepadconnected', (e) => console.log('✅ GAMEPAD:', e.gamepad.id, e.gamepad.buttons.length, 'tombol'));
window.addEventListener('keydown', (e) => console.log('✅ KEYDOWN:', e.key, e.code));
window.addEventListener('click', (e) => {
  console.log('✅ CLICK pada:', e.target.tagName, e.target.id || e.target.className);
  if (store.activeMode === 'vr' && e.target?.tagName === 'CANVAS') {
    console.log('[VR Remote] click canvas diterima, triggerSelectFromGaze()');
    triggerSelectFromGaze(e);
  }
});
document.addEventListener('pointerdown', (e) => console.log('✅ POINTERDOWN:', e.pointerType, e.clientX, e.clientY));

loadModules().catch((error) => {
  console.error(error);
  alert('Gagal membaca daftar modul. Cek public/content/modules.json');
});
