// scenario-orientation.js: lock orientasi, fullscreen, dan hint rotate.
import { ScreenOrientation } from '@capacitor/screen-orientation';

// isPortraitNow(): TRUE jika layar sedang portrait (matchMedia, fallback tinggi/lebar).
function isPortraitNow() {
  if (window.matchMedia) {
    return window.matchMedia('(orientation: portrait)').matches;
  }
  return window.innerHeight >= window.innerWidth;
}

// updateRotateHintVisibility(): hint "putar HP" hanya saat flat aktif + portrait.
function updateRotateHintVisibility() {
  const wrap = document.getElementById('mobileFlatWrap');
  const hint = document.getElementById('mobileRotateHint');
  if (!wrap || !hint) return;
  const flatActive = !wrap.classList.contains('hidden');
  hint.classList.toggle('hidden', !(flatActive && isPortraitNow()));
}

// lockLandscape(): coba kunci landscape via plugin native, fallback Web API.
export async function lockLandscape() {
  try {
    await ScreenOrientation.lock({ orientation: 'landscape' });
    return 'native';
  } catch { /* bukan APK, lanjut fallback */ }
  try {
    if (screen.orientation?.lock) {
      await screen.orientation.lock('landscape');
      return 'web';
    }
  } catch { /* butuh gesture / tak didukung */ }
  return 'gagal';
}

// unlockOrientation(): buka kunci orientasi native + web, abaikan bila tak didukung.
export async function unlockOrientation() {
  try {
    await ScreenOrientation.unlock();
  } catch { /* abaikan */ }
  try {
    if (screen.orientation?.unlock) screen.orientation.unlock();
  } catch { /* abaikan */ }
}

// tryFlatLandscape(): auto-lock landscape saat masuk flat; gagal diam-diam tanpa gesture.
export async function tryFlatLandscape() {
  updateRotateHintVisibility();
  await lockLandscape();
  updateRotateHintVisibility();
}

// exitFlatLandscape(): unlock orientasi, keluar fullscreen, sembunyikan hint.
export function exitFlatLandscape() {
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
