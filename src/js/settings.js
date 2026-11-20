// settings.js: wiring halaman settings (tombol reset/back, slider, status eye).
// Logika kalibrasi ada di calibration.js agar settings & vr-player pakai satu sumber.
import { backToModules } from './navigation.js'; // kembali ke daftar modul.
import { setCalibrationValues } from './calibration.js'; // reset kalibrasi (terapkan + simpan).

// initSettings(): pasang listener tombol back & reset kalibrasi di settings.html.
// Semua lookup pakai ?. agar app tidak crash bila id HTML berubah/hilang.
export function initSettings() {
  document.getElementById('backToHomeFromSettings')?.addEventListener('click', () => {
    backToModules();
  });

  document.getElementById('resetCalibrationButton')?.addEventListener('click', () => {
    setCalibrationValues({ leftX: 0, leftY: 0, rightX: 0, rightY: 0 });
  });
}
