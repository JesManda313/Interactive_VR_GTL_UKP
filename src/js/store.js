/**
 * store.js — shared state & constants (no imports).
 * Single source of truth for all pages.
 */

export const MODULES_URL = '/content/modules.json';

export const CALIBRATION_STORAGE_KEY = 'gtlvr_calibration_v2';

export const B_BUTTON_INDEX = 1;
export const Y_BUTTON_INDEX = 9;

export const store = {
  // daftar modul yang sedang dipilih
  modules: [],
  activeModule: null,

  // daftar skenario yang aktif dan Map untuk lookup cepat
  // by-id (O(1) dibanding .find() yang O(n))
  scenarios: [],
  scenarioMap: new Map(),
  activeScenarioId: null,

  // mode yang aktif vr / mobile
  activeMode: null,

  // munculin kuis langsung setelah video konsekuensi
  shouldShowQuizImmediately: false,

  // kalibrasi IPD / vertical shift
  calibration: {
    leftX: 0,
    leftY: 0,
    rightX: 0,
    rightY: 0,
  },
  selectedCalibrationEye: 'left',
  previousCalibrationButtons: [],

  // untuk deteksi remote bluetooth
  gamepadIndex: null,
  prevButtonPressed: false,
};
