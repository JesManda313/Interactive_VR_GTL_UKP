/**
 * settings.js — logic for settings.html (#settingsScreen, kalibrasi VR).
 * Owns: reset button, back button, slider bindings, eye status display.
 * Calibration math/state lives in calibration.js (shared with vr-player.html).
 *
 * UNTUK APA FILE INI?
 * Hanya wiring tombol di halaman settings. Logika geser/simpan ada di calibration.js
 * KENAPA dipisah? Agar vr-player (joystick) dan settings (slider) pakai 1 sumber kebenaran,
 * tidak dobel rumus yang bisa beda hasil.
 */
import { backToModules } from './navigation.js'; // tombol kembali ke daftar. KENAPA? Settings dibuka dari home, kembalinya ke home.
import { setCalibrationValues } from './calibration.js'; // reset kalibrasi. KENAPA import ini? Agar reset langsung terapkan + simpan.

/**
 * initSettings():
 * Untuk apa? Wire kontrol-kontrol milik settings.html (dipanggil sekali dari main.js).
 * - #backToHomeFromSettings -> backToModules(). KENAPA? Keluar settings kembali ke daftar modul.
 * - #resetCalibrationButton -> setCalibrationValues({0,0,0,0}). KENAPA 0 semua? Artinya tidak digeser (tengah murni).
 * - ?. KENAPA optional chaining? Agar bila id HTML berubah/hilang, app tidak crash saat start.
 */
export function initSettings() {
  document.getElementById('backToHomeFromSettings')?.addEventListener('click', () => {
    backToModules();
  });

  document.getElementById('resetCalibrationButton')?.addEventListener('click', () => {
    setCalibrationValues({ leftX: 0, leftY: 0, rightX: 0, rightY: 0 });
  });
}
