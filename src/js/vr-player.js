/**
 * vr-player.js — logic for vr-player.html (#vrScreen).
 * Owns: VR entry, bluetooth remote (gamepad) polling, calibration gamepad.
 * Scene/video/quiz engine lives in scenario.js (shared with mobile-player.html).
 */
import { B_BUTTON_INDEX, Y_BUTTON_INDEX, store } from './store.js';
import { setCalibrationEye, setCalibrationValues } from './calibration.js';
import { triggerSelectFromGaze } from './gaze.js';

/** Masuk ke mode VR (dipakai mode.html via navigation, wrapper khusus VR). */

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
    console.log('[VR Remote] gamepadconnected', event.gamepad.index, event.gamepad.id);
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
