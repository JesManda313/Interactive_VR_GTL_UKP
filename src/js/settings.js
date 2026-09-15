/**
 * settings.js — logic for settings.html (#settingsScreen, kalibrasi VR).
 * Owns: reset button, back button, slider bindings, eye status display.
 * Calibration math/state lives in calibration.js (shared with vr-player.html).
 */
import { backToModules } from './navigation.js';
import { setCalibrationValues } from './calibration.js';

/** Wire kontrol-kontrol milik settings.html. */
export function initSettings() {
  document.getElementById('backToHomeFromSettings')?.addEventListener('click', () => {
    backToModules();
  });

  document.getElementById('resetCalibrationButton')?.addEventListener('click', () => {
    setCalibrationValues({ leftX: 0, leftY: 0, rightX: 0, rightY: 0 });
  });
}
