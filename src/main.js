import homeHtml from './pages/home.html?raw'; // ?raw: impor HTML sebagai string, bukan komponen.
import settingsHtml from './pages/settings.html?raw';
import modeHtml from './pages/mode.html?raw';
import downloadHtml from './pages/download.html?raw';
import mobilePlayerHtml from './pages/mobile-player.html?raw';
import vrPlayerHtml from './pages/vr-player.html?raw';

// Suntik semua layar ke #appShell sebelum init (init* mencari elemen by id).
document.getElementById('appShell').innerHTML =
  homeHtml + settingsHtml + modeHtml + downloadHtml + mobilePlayerHtml + vrPlayerHtml;

import { store } from './js/store.js'; // state global (cek activeMode).
import { BUILD_VERSION } from './js/version.js'; // label versi build.
import { triggerSelectFromGaze } from './js/gaze.js'; // klik via tatapan (remote/keyboard).
import { loadModules, initHome } from './js/home.js'; // daftar modul + wiring home.
import { initSettings } from './js/settings.js'; // wiring settings.
import { initMode } from './js/mode.js'; // wiring timeline + popup mode.
import { initVrPlayer } from './js/vr-player.js'; // polling gamepad bluetooth.
import { testOnKeyboardInput, testOnCanvasClick } from './testing/instrument.js';

initHome(); // pasang listener tombol home (sekali saat start).
initSettings(); // pasang listener settings.
initMode(); // pasang listener mode + timeline.
initVrPlayer(); // mulai loop baca remote bluetooth.
// initTesting(); // aktifkan bila HUD pengujian diperlukan.

// Tampilkan versi build agar APK di HP mudah dibedakan.
document.getElementById('buildVersion').textContent = BUILD_VERSION;

// Log debug + fallback demo: keyboard (Enter/Space) dan klik canvas
// memicu triggerSelectFromGaze saat mode VR, untuk laptop tanpa remote asli.
window.addEventListener('gamepadconnected', (e) => console.log('✅ GAMEPAD:', e.gamepad.id, e.gamepad.buttons.length, 'tombol'));
window.addEventListener('keydown', (e) => {
  console.log('✅ KEYDOWN:', e.key, e.code);
  // Fallback keyboard: Enter/Space = confirm.
  const isConfirm = e.key === 'Enter' || e.key === ' '
    || ['Enter', 'Space', 'NumpadEnter', 'DPAD_CENTER'].includes(e.code);
  if (!e.repeat && store.activeMode === 'vr' && isConfirm) { // !e.repeat: tahan tombol jangan jadi klik berulang.
    console.log('[VR Remote] keydown confirm diterima, triggerSelectFromGaze()');
    testOnKeyboardInput(e);
    triggerSelectFromGaze(e);
  }
});
window.addEventListener('click', (e) => {
  console.log(' CLICK pada:', e.target.tagName, e.target.id || e.target.className);
  if (store.activeMode === 'vr' && e.target?.tagName === 'CANVAS') { // hanya canvas VR agar klik tombol UI tidak dobel trigger.
    console.log('[VR Remote] click canvas diterima, triggerSelectFromGaze()');
    testOnCanvasClick(e);
    triggerSelectFromGaze(e);
  }
});
document.addEventListener('pointerdown', (e) => console.log('✅ POINTERDOWN:', e.pointerType, e.clientX, e.clientY));

// Muat modules.json; alert bila gagal agar layar tidak kosong tanpa penjelasan.
loadModules().catch((error) => {
  console.error(error);
  alert('Gagal membaca daftar modul. Cek public/content/modules.json');
});
