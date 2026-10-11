/**
 * store.js — shared state & constants (no imports).
 * Single source of truth for all pages.
 *
 * GAMBARAN BESAR (untuk apa file ini?):
 * - File ini adalah "otak memori" aplikasi. Semua halaman (home, mode, player VR/mobile)
 *   membaca & menulis ke objek `store` yang sama, jadi tidak perlu oper-oper data manual.
 * - Tidak ada import di sini (no imports) KENAPA? Supaya tidak terjadi circular import
 *   (A import B, B import A). Semua file boleh import store.js dengan aman.
 */

// MODULES_URL: Untuk apa? Alamat file JSON daftar modul.
// Kenapa '/content/modules.json'? Karena Vite/Capacitor menyajikan folder public/ ke root,
// jadi public/content/modules.json bisa di-fetch dari URL ini baik di web maupun APK.
export const MODULES_URL = '/content/modules.json';

// CALIBRATION_STORAGE_KEY: kunci localStorage untuk simpan posisi kalibrasi mata.
// Untuk apa? Agar setting geser kiri/kanan tidak hilang saat app ditutup.
// Kenapa pakai versi '_v2'? Agar kalau format data berubah, data lama tidak merusak app.
export const CALIBRATION_STORAGE_KEY = 'gtlvr_calibration_v2';

// B_BUTTON_INDEX = 1, Y_BUTTON_INDEX = 9, CONFIRM_BUTTON_INDEX = 0:
// Untuk apa? Nomor tombol standar pada remote bluetooth (gamepad API).
// - Index 0 = tombol confirm/OK (biasanya tombol A / tengah).
// - Index 1 = tombol B (di sini dipakai pilih mata KIRI saat kalibrasi).
// - Index 9 = tombol Y/start (di sini dipakai pilih mata KANAN).
// Kenapa ditulis sebagai konstanta? Supaya kalau remote beda mapping, cukup ubah di sini
// satu tempat, tidak ubah di semua file vr-player.js.
export const B_BUTTON_INDEX = 1;
export const Y_BUTTON_INDEX = 9;
export const CONFIRM_BUTTON_INDEX = 0;

// store: objek global berisi status aplikasi saat ini.
export const store = {
  // modules: daftar modul yang sedang dipilih (diisi dari modules.json via home.js).
  // activeModule: modul yang sedang dibuka user (object) atau null bila belum pilih.
  modules: [],
  activeModule: null,

  // scenarios: daftar skenario/segmen video dalam modul aktif.
  // scenarioMap: Map id -> object skenario untuk lookup cepat.
  // Kenapa pakai Map (O(1)) dibanding .find() (O(n))? Karena setiap pindah segmen,
  // kode sering mencari skenario by id. Map jauh lebih cepat saat segmen banyak.
  // activeScenarioId: id segmen yang sedang diputar.
  scenarios: [],
  scenarioMap: new Map(),
  activeScenarioId: null,

  // activeMode: mode yang aktif 'vr' / 'mobile' / null (belum pilih).
  // Dipakai untuk menentukan cara render (A-Frame stereo vs fullscreen HP) dan
  // untuk menentukan apakah tombol remote bluetooth boleh dipakai.
  activeMode: null,

  // shouldShowQuizImmediately: Untuk apa? Flag "munculin kuis langsung setelah video konsekuensi".
  // Kenapa perlu flag? Alur salah jawab: decision -> consequence (video penjelasan)
  // -> balik ke decision dan LANGSUNG tampilkan kuis lagi tanpa perlu nonton ulang video decision.
  shouldShowQuizImmediately: false,

  // calibration: kalibrasi IPD / vertical shift (geser gambar kiri/kanan/atas/bawah dalam pixel).
  // Untuk apa? Menyelaraskan tampilan VR kiri-kanan agar tidak double/berbayang.
  // selectedCalibrationEye: mata mana yang sedang digeser ('left'/'right').
  // previousCalibrationButtons: status tombol sebelumnya untuk deteksi "baru ditekan"
  //   (edge detection) agar satu tekan = satu aksi, bukan aksi berulang tiap frame.
  calibration: {
    leftX: 0,
    leftY: 0,
    rightX: 0,
    rightY: 0,
  },
  selectedCalibrationEye: 'left',
  previousCalibrationButtons: [],

  // gamepadIndex: Untuk deteksi remote bluetooth (index gamepad di navigator.getGamepads()).
  // null = belum terhubung. prevButtonPressed = status tekan sebelumnya (untuk edge detection
  // tombol confirm umum di luar mode kalibrasi).
  gamepadIndex: null,
  prevButtonPressed: false,
};
