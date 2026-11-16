/**
 * scenario-orientation.js — lock orientasi, fullscreen, dan hint rotate.
 *
 * Semua helper di sini hanya mengurus tampilan/orientasi, tidak mengimpor
 * controller skenario.
 */
import { ScreenOrientation } from '@capacitor/screen-orientation';

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
export async function tryFlatLandscape() {
  updateRotateHintVisibility();
  await lockLandscape();
  updateRotateHintVisibility();
}

/** Keluar dari landscape: unlock + keluar fullscreen. */
// exitFlatLandscape: UNTUK APA? Bersihkan lock orientasi + fullscreen + hint saat pindah ke 360/VR.
// KENAPA? Tanpa cleanup, HP terkunci landscape dan hint nyangkut di scene yang tidak butuh.
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
