/**
 * vr-player.js — logic for vr-player.html (#vrScreen).
 * Owns: VR entry, bluetooth remote (gamepad) polling, calibration gamepad.
 * Scene/video/quiz engine lives in scenario.js (shared with mobile-player.html).
 */
import { B_BUTTON_INDEX, Y_BUTTON_INDEX, store } from './store.js';
import { setCalibrationEye, setCalibrationValues } from './calibration.js';
import { triggerSelectFromGaze } from './gaze.js';

/**
 * Cari gamepad yang sudah terhubung dan set index pertama yang ditemukan.
 * Dipanggil saat inisialisasi polling jika koneksi belum diketahui.
 */
export function setGamepadIndexFromConnected() {
  const gamepads = navigator.getGamepads();
  for (let i = 0; i < gamepads.length; i += 1) {
    if (gamepads[i]) {
      store.gamepadIndex = i;
      console.log('[VR Remote] Gamepad ditemukan index', store.gamepadIndex);
      return;
    }
  }
  store.gamepadIndex = null;
}

function handleCalibrationGamepad(gamepad) {
  const buttons = gamepad.buttons.map((button) => button.pressed);
  const pressedNow = (index) => buttons[index] && !store.previousCalibrationButtons[index];

  if (pressedNow(B_BUTTON_INDEX)) setCalibrationEye('left');
  if (pressedNow(Y_BUTTON_INDEX)) setCalibrationEye('right');

  const horizontalAxis = gamepad.axes[0] ?? 0;
  if (Math.abs(horizontalAxis) > 0.15) {
    const key = store.selectedCalibrationEye === 'left' ? 'leftX' : 'rightX';
    const nextValue = Math.max(-60, Math.min(60, store.calibration[key] + horizontalAxis * 1.5));
    setCalibrationValues({ [key]: nextValue });
  }

  store.previousCalibrationButtons = buttons;
}

/**
 * Loop polling untuk membaca state gamepad. Jika tombol ditekan, trigger seleksi dari gaze.
 * Dipanggil sekali untuk memulai loop via requestAnimationFrame.
 */
// DEBUG sementara: ingat kombinasi terakhir agar log hanya muncul saat berubah.
let lastPressedKey = '';

export function pollGamepad() {
  requestAnimationFrame(pollGamepad);

  if (store.gamepadIndex === null) {
    setGamepadIndexFromConnected();
    return;
  }

  const gamepads = navigator.getGamepads();
  const gp = gamepads[store.gamepadIndex];
  if (!gp) {
    store.gamepadIndex = null;
    return;
  }

  // DEBUG sementara: tampilkan indeks semua tombol yang sedang ditekan.
  const pressedIndices = gp.buttons
    .map((b, i) => (b.pressed ? i : null))
    .filter((i) => i !== null);
  const pressedKey = pressedIndices.join(',');
  if (pressedKey !== lastPressedKey) {
    lastPressedKey = pressedKey;
    console.log('[VR Remote] tombol ditekan:', pressedIndices.length ? pressedIndices : 'tidak ada');
  }

  if (store.activeModule?.type === 'calibration') {
    handleCalibrationGamepad(gp);
    return;
  }

  const pressed = gp.buttons.some((b) => b.pressed);

  if (pressed && !store.prevButtonPressed) {
    triggerSelectFromGaze();
  }

  store.prevButtonPressed = pressed;
}

/** Wire kontrol + remote milik vr-player.html. */
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
