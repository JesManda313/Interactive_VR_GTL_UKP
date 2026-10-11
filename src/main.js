// Bootstrap — inject page partials, then init per-page modules.
// Pages (html):  src/pages/home.html, settings.html, mode.html,
//                download.html, mobile-player.html, vr-player.html
// Logic (js):    src/js/home.js, settings.js, mode.js, vr-player.js
//                (+ domain: store, utils, calibration, video, fade,
//                scene-builders, scenario, navigation, gaze,
//                download-manager)
//
// PENJELASAN FILE main.js (Bahasa Indonesia):
// Untuk apa? Titik masuk aplikasi (entry point Vite). Tugasnya:
// 1. Suntik semua potongan HTML halaman ke #appShell (SPA 1 file).
// 2. Init modul tiap halaman (initHome/Settings/Mode/VrPlayer).
// 3. Tampilkan versi build + pasang listener debug global + muat daftar modul.
// Kenapa suntik HTML via import ?raw? Agar dev tetap bisa edit file HTML terpisah rapi,
// tapi saat build jadi 1 bundle (penting untuk APK offline, tidak ada fetch HTML terpisah).
import homeHtml from './pages/home.html?raw'; // ?raw KENAPA? Import sebagai string mentah, bukan sebagai komponen.
import settingsHtml from './pages/settings.html?raw';
import modeHtml from './pages/mode.html?raw';
import downloadHtml from './pages/download.html?raw';
import mobilePlayerHtml from './pages/mobile-player.html?raw';
import vrPlayerHtml from './pages/vr-player.html?raw';

// Suntik semua layar ke #appShell sebelum modul page di-init.
// KENAPA harus sebelum init? Karena init* mencari tombol by getElementById — elemen harus sudah ada dulu.
document.getElementById('appShell').innerHTML =
  homeHtml + settingsHtml + modeHtml + downloadHtml + mobilePlayerHtml + vrPlayerHtml;

import { store } from './js/store.js'; // memori global (dibaca untuk cek activeMode di listener bawah).
import { BUILD_VERSION } from './js/version.js'; // string versi untuk label.
import { triggerSelectFromGaze } from './js/gaze.js'; // klik via tatapan (dipakai remote/keyboard).
import { loadModules, initHome } from './js/home.js'; // muat daftar modul + wiring home.
import { initSettings } from './js/settings.js'; // wiring settings.
import { initMode } from './js/mode.js'; // wiring timeline + popup mode.
import { initVrPlayer } from './js/vr-player.js'; // polling gamepad bluetooth.

initHome(); // pasang listener tombol home. KENAPA di sini? Sekali saat start.
initSettings(); // pasang listener settings.
initMode(); // pasang listener mode + timeline.
initVrPlayer(); // mulai loop baca remote bluetooth.

// Penanda build agar APK di HP bisa dibedakan versinya.
// KENAPA? Lihat penjelasan version.js — hindari kebingungan APK lama vs baru.
document.getElementById('buildVersion').textContent = BUILD_VERSION;

// DEBUGGING global — boleh dihapus saat rilis final, tapi sangat membantu sidang/demo:
// - gamepadconnected: pastikan remote bluetooth terbaca + tahu jumlah tombol.
// - keydown: log tiap tombol keyboard + fallback remote mode-keyboard (Enter/Space = confirm).
//   KENAPA fallback? Di emulator/laptop tidak ada remote asli, jadi keyboard dipakai pura-pura jadi remote.
// - click pada CANVAS: fallback klik VR. KENAPA? Di HP VR kadang tap layar = confirm.
// - pointerdown: bedakan touch vs mouse.
window.addEventListener('gamepadconnected', (e) => console.log('✅ GAMEPAD:', e.gamepad.id, e.gamepad.buttons.length, 'tombol'));
window.addEventListener('keydown', (e) => {
  console.log('✅ KEYDOWN:', e.key, e.code);
  // Fallback remote mode-keyboard: Enter/Space = tombol confirm.
  const isConfirm = e.key === 'Enter' || e.key === ' '
    || ['Enter', 'Space', 'NumpadEnter', 'DPAD_CENTER'].includes(e.code);
  if (!e.repeat && store.activeMode === 'vr' && isConfirm) { // !e.repeat KENAPA? Tahan tombol jangan dianggap klik berkali-kali.
    console.log('[VR Remote] keydown confirm diterima, triggerSelectFromGaze()');
    triggerSelectFromGaze(e);
  }
});
window.addEventListener('click', (e) => {
  console.log('✅ CLICK pada:', e.target.tagName, e.target.id || e.target.className);
  if (store.activeMode === 'vr' && e.target?.tagName === 'CANVAS') { // hanya canvas VR KENAPA? Agar klik tombol UI biasa tidak dobel trigger.
    console.log('[VR Remote] click canvas diterima, triggerSelectFromGaze()');
    triggerSelectFromGaze(e);
  }
});
document.addEventListener('pointerdown', (e) => console.log('✅ POINTERDOWN:', e.pointerType, e.clientX, e.clientY));

// Muat daftar modul dari modules.json. catch -> alert KENAPA? Tanpa ini layar kosong tanpa penjelasan bila JSON hilang/salah path.
loadModules().catch((error) => {
  console.error(error);
  alert('Gagal membaca daftar modul. Cek public/content/modules.json');
});
