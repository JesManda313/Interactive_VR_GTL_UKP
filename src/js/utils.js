/**
 * utils.js — generic text helpers (no imports).
 */

/**
 * Sanitasi nilai untuk dimasukkan ke HTML/atribut teks.
 * Mengubah null/undefined menjadi string kosong dan meng-escape entitas HTML.
 */
export function safeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
