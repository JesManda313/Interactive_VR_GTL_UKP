// vr-player.js — masuk VR + remote bluetooth (terbaca sebagai Gamepad) untuk vr-player.html.
// Tombol remote -> pilih objek yang sedang ditatap lewat gaze.js.
import { B_BUTTON_INDEX, CONFIRM_BUTTON_INDEX, Y_BUTTON_INDEX, store } from './store.js'; // index tombol + memori.
import { setCalibrationEye, setCalibrationValues } from './calibration.js'; // pilih mata + geser nilai.
import { backToModules } from './navigation.js'; // kembali saat confirm di kalibrasi.
import { triggerSelectFromGaze } from './gaze.js'; // eksekusi klik tatapan.
// import { testOnRemoteEdge } from '../testing/instrument.js'; // T0 pengukuran response time/latency. (dinonaktifkan sementara)

// setGamepadIndexFromConnected(): simpan index gamepad pertama yang aktif.
// navigator.getGamepads() bisa berlubang ([null, gp, null]) dan cukup 1 remote.
export function setGamepadIndexFromConnected() {
  const gamepads = navigator.getGamepads(); // API browser standar untuk joystick/gamepad.
  for (let i = 0; i < gamepads.length; i += 1) {
    if (gamepads[i]) {
      store.gamepadIndex = i; // dipakai pollGamepad tiap frame.
      console.log('[VR Remote] Gamepad ditemukan index', store.gamepadIndex);
      return;
    }
  }
  store.gamepadIndex = null; // tidak ada -> coba lagi frame berikutnya.
}

// handleCalibrationGamepad(): remote di layar kalibrasi — B/Y pilih mata, confirm keluar,
// joystick X geser mata aktif ±1.5/frame dengan clamp -60..60.
function handleCalibrationGamepad(gamepad) {
  const buttons = gamepad.buttons.map((button) => button.pressed); // array boolean sederhana.

  // pressedNow: true hanya saat tombol baru ditekan (edge), bukan ditahan tiap frame.
  const pressedNow = (index) => buttons[index] && !store.previousCalibrationButtons[index];

  if (pressedNow(B_BUTTON_INDEX)) setCalibrationEye('left');
  if (pressedNow(Y_BUTTON_INDEX)) setCalibrationEye('right');

  if (pressedNow(CONFIRM_BUTTON_INDEX)) {
    store.previousCalibrationButtons = buttons; // simpan dulu agar status tidak basi saat kembali ke modul.
    backToModules();
    return;
  }

  const horizontalAxis = gamepad.axes[0] ?? 0; // joystick kiri-kanan, 0 bila remote tanpa axes.
  if (Math.abs(horizontalAxis) > 0.15) { // 0.15 = zona mati, joystick murah drift sendiri.
    const key = store.selectedCalibrationEye === 'left' ? 'leftX' : 'rightX'; // geser mata aktif saja.
    const nextValue = Math.max(-60, Math.min(60, store.calibration[key] + horizontalAxis * 1.5)); // clamp agar gambar tidak kabur keluar layar.
    setCalibrationValues({ [key]: nextValue }); // [key] karena nama field dinamis (leftX vs rightX).
  }

  store.previousCalibrationButtons = buttons; // simpan untuk edge detection frame berikutnya.
}

let lastPressedKey = '';

// pollGamepad(): baca gamepad tiap frame lalu seleksi gaze saat tombol baru ditekan.
// Polling karena Gamepad API tak punya event real-time; rAF di awal agar loop tetap jalan saat return awal.
export function pollGamepad() {
  requestAnimationFrame(pollGamepad); // jadwalkan frame berikutnya dulu.

  if (store.gamepadIndex === null) { // belum tahu index -> cari, lalu tunggu frame berikutnya.
    setGamepadIndexFromConnected();
    return;
  }

  const gamepads = navigator.getGamepads();
  const gp = gamepads[store.gamepadIndex];
  if (!gp) { // gamepad dicabut -> reset agar cari ulang.
    store.gamepadIndex = null;
    return;
  }

  const pressedIndices = gp.buttons
    .map((b, i) => (b.pressed ? i : null))
    .filter((i) => i !== null);
  const pressedKey = pressedIndices.join(',');
  if (pressedKey !== lastPressedKey) { // log hanya saat kombinasi berubah, hindari spam 60/detik.
    lastPressedKey = pressedKey;
    console.log('[VR Remote] tombol ditekan:', pressedIndices.length ? pressedIndices : 'tidak ada');
  }

  if (store.activeModule?.type === 'calibration') { // mode kalibrasi punya handler sendiri.
    handleCalibrationGamepad(gp);
    return;
  }

  const pressed = gp.buttons.some((b) => b.pressed); // semua tombol = confirm, ramah remote beda merek.

  if (pressed && !store.prevButtonPressed) { // edge: baru ditekan (bukan tahan) -> klik tatapan.
    // testOnRemoteEdge(); // (dinonaktifkan sementara)
    triggerSelectFromGaze();
  }

  store.prevButtonPressed = pressed; // simpan untuk edge berikutnya.
}

// initVrPlayer(): pasang listener connect/disconnect gamepad + mulai polling (sekali saat start).
export function initVrPlayer() {
  window.addEventListener('gamepadconnected', (event) => {
    store.gamepadIndex = event.gamepad.index;
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
