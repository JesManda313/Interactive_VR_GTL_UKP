/**
 * fade.js — fade transition overlay (no imports).
 * Dipakai mobile-player.html + vr-player.html.
 */

/**
 * Ambil elemen overlay fade sesuai mode ('mobile' atau 'vr').
 * Untuk VR dapat mengembalikan beberapa elemen (kiri/kanan).
 */
export function getFadeOverlay(mode) {
  if (mode === 'mobile') {
    return document.getElementById('mobileFadeOverlay');
  }

  if (mode === 'vr') {
    return [...document.querySelectorAll('.vr-fade-panel')];
  }

  return null;
}

/** Set pesan teks pada overlay fade untuk mode tertentu dan aktifkan overlay. */
export function setFadeMessage(mode, message) {
  const overlays = getFadeOverlays(mode);

  overlays.forEach((overlay) => {
    const textEl = overlay.querySelector('.fade-message');
    if (textEl) textEl.textContent = message;
    overlay.classList.add('active');
  });
}

/** Normalisasi nilai overlay menjadi array (selalu mengembalikan array). */
export function getFadeOverlays(mode) {
  const overlay = getFadeOverlay(mode);
  if (!overlay) return [];
  return Array.isArray(overlay) ? overlay : [overlay];
}

/**
 * Lakukan transisi fade pada overlay (opacity = 0 atau 1).
 * Mengembalikan Promise yang ter-resolve saat transisi selesai atau timeout.
 */
export function fadeOverlay(mode, opacity) {
  return new Promise((resolve) => {
    const overlays = getFadeOverlays(mode);
    if (!overlays.length) {
      resolve();
      return;
    }

    overlays.forEach((overlay) => {
      overlay.classList.toggle('active', opacity === 1);
    });

    const handleTransitionEnd = (event) => {
      if (event.propertyName === 'opacity') {
        overlays.forEach((overlay) => {
          overlay.removeEventListener('transitionend', handleTransitionEnd);
        });
        resolve();
      }
    };

    overlays.forEach((overlay) => {
      overlay.addEventListener('transitionend', handleTransitionEnd);
    });
    requestAnimationFrame(() => {
      overlays.forEach((overlay) => {
        overlay.style.opacity = opacity.toString();
      });
    });

    setTimeout(() => {
      overlays.forEach((overlay) => {
        overlay.removeEventListener('transitionend', handleTransitionEnd);
      });
      resolve();
    }, 2000);
  });
}

/**
 * Buat pesan transisi singkat berdasarkan tipe skenario (untuk overlay fade).
 */
export async function getTransitionMessage(scenario) {
  if (!scenario) {
    return '';
  }

  const title = scenario.title || 'Segmen baru';
  if (scenario.type === 'consequence') {
    return `Konsekuensi: ${title}`;
  }

  return `Masuk ke: ${title}`;
}
