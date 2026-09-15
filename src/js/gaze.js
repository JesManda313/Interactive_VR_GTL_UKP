/**
 * gaze.js — VR remote via gaze cursor raycaster.
 * Dipakai vr-player.html (+ debug click di main.js).
 */
import { handleOption } from './scenario.js';

/** Kembalikan array semua elemen kursor gaze di dalam root. */
export function findGazeCursors(root = document) {
  if (!root) return [];
  return Array.from(root.querySelectorAll('.gaze-cursor'));
}

/**
 * Trigger pemilihan opsi berdasarkan gaze cursor (digunakan oleh VR remote).
 * Mencari elemen yang sedang di-intersect oleh raycaster dan memicu `handleOption`.
 */
export function triggerSelectFromGaze(event) {
  const cursors = findGazeCursors();

  if (!cursors.length) {
    console.warn('[VR Remote] Tidak ada gaze cursor ditemukan.');
    return;
  }

  for (const cursor of cursors) {
    if (!cursor.components || !cursor.components.raycaster) {
      continue;
    }

    const intersectedEls = cursor.components.raycaster.intersectedEls || [];
    console.log('[VR Remote] cursor', cursor, 'intersectedEls', intersectedEls.length);

    let target = intersectedEls[0];
    while (target && !target.classList.contains('quiz-option')) {
      target = target.parentElement;
    }

    if (target && target.classList.contains('quiz-option')) {
      console.log('[VR Remote] opsi ditemukan:', target.dataset.optionIndex, target.dataset.next, target.dataset.consequence);
      handleOption(target);
      return;
    }
  }

  console.warn('[VR Remote] Tidak menemukan opsi quiz di gaze cursor. Pastikan kursor mengarah ke .quiz-option.');
}
