/**
 * utils.js — generic text helpers (no imports).
 *
 * UNTUK APA FILE INI?
 * Kumpulan fungsi teks umum yang tidak butuh import lain.
 * Sengaja no-imports agar bisa dipakai di mana saja tanpa circular import.
 */

/**
 * safeText(value):
 * Untuk apa? Sanitasi nilai untuk dimasukkan ke HTML/atribut teks.
 * - Mengubah null/undefined menjadi string kosong (String(value ?? '')) KENAPA?
 *   Agar tidak muncul teks "null"/"undefined" di layar saat data JSON kosong.
 * - .replace(/&/g, '&amp;') dst: meng-escape entitas HTML KENAPA?
 *   Agar judul berisi karakter < > " & tidak merusak struktur HTML dan
 *   mencegah XSS (suntikan script jahat dari data JSON).
 * Contoh: judul `A < B` -> `A &lt; B` sehingga tampil benar, bukan dianggap tag.
 */
export function safeText(value) {
  return String(value ?? '') // null/undefined -> '' ; angka -> string. Kenapa? Agar .replace selalu aman.
    .replace(/&/g, '&amp;') // & dulu (paling pertama) KENAPA? Agar & hasil escape berikutnya tidak di-escape dobel.
    .replace(/"/g, '&quot;') // " -> &quot; KENAPA? Agar aman dipakai di dalam atribut HTML "...".
    .replace(/</g, '&lt;') // < -> &lt; KENAPA? Agar tidak dianggap awal tag HTML.
    .replace(/>/g, '&gt;'); // > -> &gt; KENAPA? Pasangan < agar lengkap + cegah break tag.
}

/** Toast global non-blocking. Satu elemen #appToast dipakai ulang. */
export function showToast(message, ms = 2600) {
  let el = document.getElementById('appToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appToast';
    el.className = 'app-toast';
    document.body.appendChild(el);
  }
  el.textContent = String(message ?? '');
  el.classList.add('show');
  window.clearTimeout(el._hideTimer);
  el._hideTimer = window.setTimeout(() => el.classList.remove('show'), ms);
}
