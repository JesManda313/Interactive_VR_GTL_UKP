/**
 * vr-player.js — logic for vr-player.html (#vrScreen).
 * Owns: VR entry, bluetooth remote (gamepad) polling, calibration gamepad.
 * Scene/video/quiz engine lives in scenario.js (shared with mobile-player.html).
 *
 * UNTUK APA FILE INI?
 * Menghubungkan remote bluetooth (terbaca sebagai Gamepad di browser) ke aksi VR:
 * tekan tombol apa pun -> pilih objek yang sedang ditatap (via gaze.js).
 * Khusus modul kalibrasi, tombol B/Y/joystick dipakai untuk geser mata kiri/kanan.
 */
import { B_BUTTON_INDEX, CONFIRM_BUTTON_INDEX, Y_BUTTON_INDEX, store } from './store.js'; // konstanta index tombol + memori.
import { setCalibrationEye, setCalibrationValues } from './calibration.js'; // pilih mata + geser nilai.
import { backToModules } from './navigation.js'; // kembali saat confirm di kalibrasi.
import { triggerSelectFromGaze } from './gaze.js'; // eksekusi klik tatapan.

/**
 * setGamepadIndexFromConnected():
 * Untuk apa? Cari gamepad yang sudah terhubung dan set index pertama yang ditemukan.
 * Dipanggil saat inisialisasi polling jika koneksi belum diketahui.
 * KENAPA loop? navigator.getGamepads() return array berlubang ([null, gamepad, null...]),
 * jadi harus cari yang tidak null. KENAPA return setelah ketemu pertama? Cukup 1 remote.
 */
export function setGamepadIndexFromConnected() {
  const gamepads = navigator.getGamepads(); // API browser standar untuk joystick/gamepad.
  for (let i = 0; i < gamepads.length; i += 1) {
    if (gamepads[i]) {
      store.gamepadIndex = i; // simpan agar pollGamepad tahu index mana yang dibaca tiap frame.
      console.log('[VR Remote] Gamepad ditemukan index', store.gamepadIndex);
      return;
    }
  }
  store.gamepadIndex = null; // tidak ada -> null agar loop coba lagi frame berikutnya.
}

// handleCalibrationGamepad(gamepad): Untuk apa? Perilaku khusus remote saat di layar kalibrasi.
// - pressedNow(index) = tombol ditekan SEKARANG tapi TIDAK ditekan frame sebelumnya (edge detection).
//   KENAPA? Tanpa ini, 1x tekan terbaca 60x (tiap frame) -> mata kiri-kanan ke-toggle liar.
// - B -> pilih mata kiri, Y -> pilih mata kanan. KENAPA B/Y? Tombol fisik mudah dihafal + tidak bentrok confirm.
// - Confirm -> backToModules(). KENAPA? Di kalibrasi tidak ada kuis, jadi confirm dipakai untuk keluar.
// - Joystick X (axes[0]) -> geser leftX/rightX ±1.5 per frame, clamp -60..60.
//   KENAPA threshold 0.15? Joystick murah goyang sendiri (drift); di bawah itu anggap noise, abaikan.
//   KENAPA clamp? Agar gambar tidak kabur jauh keluar layar.
function handleCalibrationGamepad(gamepad) {
  const buttons = gamepad.buttons.map((button) => button.pressed); // ubah jadi array boolean sederhana.

  // ini untuk deteksi tombol yg sblmnya tdk dipencet jd dipencet 
  // hasil= ture jika tombol baru saja ditekan, false jika tidak.
  // ini program meriksa remote berkali2 per detik, dgn membandingkan kondisi skrng dan sblmny
  // ini bergantung pada store.previousCalibrationButtons yg menyimpan kondisi tombol sblmnya.
  const pressedNow = (index) => buttons[index] && !store.previousCalibrationButtons[index];

  if (pressedNow(B_BUTTON_INDEX)) setCalibrationEye('left');
  if (pressedNow(Y_BUTTON_INDEX)) setCalibrationEye('right');

  // Jika tombol confirm ditekan, simpan dulu state tombol agar saat kembali ke modul, status tidak basi.
  if (pressedNow(CONFIRM_BUTTON_INDEX)) {
    store.previousCalibrationButtons = buttons; // simpan dulu KENAPA? Agar saat kembali, status tidak basi.
    backToModules();
    return;
  }

  const horizontalAxis = gamepad.axes[0] ?? 0; // joystick kiri-kanan. ??0 KENAPA? Jaga-jaga remote tanpa axes.
  if (Math.abs(horizontalAxis) > 0.15) {
    const key = store.selectedCalibrationEye === 'left' ? 'leftX' : 'rightX'; // geser mata aktif saja.
    const nextValue = Math.max(-60, Math.min(60, store.calibration[key] + horizontalAxis * 1.5));
    setCalibrationValues({ [key]: nextValue }); // [key] KENAPA computed? Nama field dinamis (leftX vs rightX).
  }

  store.previousCalibrationButtons = buttons; // simpan untuk edge detection frame berikutnya.
}

/**
 * pollGamepad():
 * Untuk apa? Loop polling untuk membaca state gamepad. Jika tombol ditekan, trigger seleksi dari gaze.
 * Dipanggil sekali untuk memulai loop via requestAnimationFrame (loop selamanya tiap frame layar).
 * KENAPA polling (bukan event)? Gamepad API tidak punya event "tombol ditekan" yang real-time di semua browser;
 * cara standar adalah baca tiap frame. KENAPA requestAnimationFrame di baris pertama? Agar loop lanjut
 * walau return awal (gamepad belum ada / scene kalibrasi).
 */
// DEBUG sementara: ingat kombinasi terakhir agar log hanya muncul saat berubah (hindari spam 60 log/detik).
let lastPressedKey = '';

export function pollGamepad() {
  requestAnimationFrame(pollGamepad); // jadwalkan frame berikutnya dulu.

  if (store.gamepadIndex === null) { // belum tahu index -> coba cari, lalu tunggu frame berikutnya.
    setGamepadIndexFromConnected();
    return;
  }

  const gamepads = navigator.getGamepads();
  const gp = gamepads[store.gamepadIndex];
  if (!gp) { // gamepad dicabut -> reset null agar cari ulang.
    store.gamepadIndex = null;
    return;
  }

  // DEBUG sementara: tampilkan indeks semua tombol yang sedang ditekan (hanya saat berubah).
  const pressedIndices = gp.buttons
    .map((b, i) => (b.pressed ? i : null))
    .filter((i) => i !== null);
  const pressedKey = pressedIndices.join(',');
  if (pressedKey !== lastPressedKey) {
    lastPressedKey = pressedKey;
    console.log('[VR Remote] tombol ditekan:', pressedIndices.length ? pressedIndices : 'tidak ada');
  }

  if (store.activeModule?.type === 'calibration') { // mode kalibrasi punya handler sendiri.
    handleCalibrationGamepad(gp);
    return;
  }

  const pressed = gp.buttons.some((b) => b.pressed); // tombol APA SAJA ditekan? KENAPA some? Di materi, semua tombol = confirm (ramah remote beda merek).

  if (pressed && !store.prevButtonPressed) { // edge: baru ditekan (bukan tahan) -> klik tatapan.
    triggerSelectFromGaze();
  }

  store.prevButtonPressed = pressed; // simpan untuk edge berikutnya.
}

/**
 * initVrPlayer():
 * Untuk apa? Wire kontrol + remote milik vr-player.html (sekali saat start).
 * - gamepadconnected -> simpan index + log id/mapping/jumlah tombol (penting untuk debug remote beda merek).
 * - gamepaddisconnected -> reset + coba cari sisa gamepad lain.
 * - pollGamepad() -> mulai loop baca.
 */
export function initVrPlayer() {
  window.addEventListener('gamepadconnected', (event) => {
    store.gamepadIndex = event.gamepad.index;
    // DEBUG sementara: kenali remote (id/mapping/jumlah tombol).
    console.log('[VR Remote] gamepadconnected', event.gamepad.index, event.gamepad.id, 'mapping:', event.gamepad.mapping, 'tombol:', event.gamepad.buttons.length);
  });

  window.addEventListener('gamepaddisconnected', (event) => {
    if (store.gamepadIndex === event.gamepad.index) {
      store.gamepadIndex = null;
      console.log('[VR Remote] gamepaddisconnected', event.gamepad.index);
      setGamepadIndexFromConnected();
    }
  });

  pollGamepad();
}
