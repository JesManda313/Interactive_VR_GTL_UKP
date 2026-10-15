/**
 * version.js — penanda versi build.
 * Ganti BUILD_VERSION setiap eksekusi perbaikan agar build di HP bisa
 * dibedakan (tampil di layar download). Format: <tanggal>-<tujuan>.
 *
 * PENJELASAN PER BARIS (Bahasa Indonesia):
 * - Baris export const BUILD_VERSION = ... :
 *   Untuk apa? Menyimpan string versi build saat ini ('2026-05-27-calib-back').
 *   Tujuannya? Agar saat kamu install APK baru di HP, kamu bisa yakin APK itu
 *     sudah berisi perbaikan terbaru (bukan APK lama yang ke-cache).
 *     Ditampilkan di layar via main.js: document.getElementById('buildVersion').textContent
 *   Kenapa perlu? Karena Android/Capacitor sering meng-cache build lama.
 *     Tanpa penanda versi, kamu bingung "ini APK baru atau lama?".
 *     Format tanggal-tujuan membuatnya mudah dibaca manusia.
 */
export const BUILD_VERSION = '2026-10-13-vr-lock-nodebug';
