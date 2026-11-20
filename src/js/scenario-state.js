// scenario-state.js: selector state skenario.
// Dipisah dari scenario.js agar render/overlay bisa baca state tanpa circular import.
import { store } from './store.js';

// getActiveScenario(): skenario aktif sesuai activeScenarioId.
export function getActiveScenario() {
  return store.scenarioMap.get(store.activeScenarioId);
}

// isFlatScenario(): TRUE untuk flat/2d/rectilinear; cabang render <video> vs 360.
export function isFlatScenario(scenario) {
  if (!scenario) return false;
  const projection = String(scenario.projection ?? scenario.videoType ?? '').toLowerCase();
  return projection === 'flat' || projection === '2d' || projection === 'rectilinear';
}
