/**
 * mode.js — logic for mode.html (#modeScreen, pilih VR / Mobile).
 * Owns: open VR / Mobile buttons + back button.
 * Playback engine lives in scenario.js (shared by both players).
 */
import { backToModules, openMode } from './navigation.js';

/** Wire tombol-tombol milik mode.html. */
export function initMode() {
  document.getElementById('openVrMode')?.addEventListener('click', () => openMode('vr'));
  document.getElementById('openMobileMode')?.addEventListener('click', () => openMode('mobile'));

  document.getElementById('backToModules')?.addEventListener('click', backToModules);
}
