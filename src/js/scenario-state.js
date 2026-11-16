/**
 * scenario-state.js — selector state skenario.
 *
 * Dipisah dari scenario.js agar modul render/overlay bisa membaca state
 * tanpa mengimpor controller (mencegah circular import).
 */
import { store } from './store.js';

/** Kembalikan objek skenario aktif berdasarkan `activeScenarioId`. */
// getActiveScenario: UNTUK APA? Getter tunggal untuk segmen yang sedang tampil.
export function getActiveScenario() {
  return store.scenarioMap.get(store.activeScenarioId);
}

/**
 * TRUE jika skenario memakai video flat (projection: flat):
 * video tampil langsung fullscreen HP, tanpa videosphere/bioskop.
 * Selain itu (360 / kosong) dianggap 360.
 */
// isFlatScenario: UNTUK APA? Penentu cabang render flat (video <video>) vs 360 (A-Frame videosphere).
// KENAPA? Satu fungsi dipakai render + overlay + quiz agar keputusan konsisten (termasuk alias 2d/rectilinear).
export function isFlatScenario(scenario) {
  if (!scenario) return false;
  const projection = String(scenario.projection ?? scenario.videoType ?? '').toLowerCase();
  return projection === 'flat' || projection === '2d' || projection === 'rectilinear';
}
