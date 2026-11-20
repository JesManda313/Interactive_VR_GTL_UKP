// calibration.js — kalibrasi IPD/vertical shift lewat transform CSS pada mount kiri/kanan.
// Nilai disimpan ke localStorage dengan debounce 400ms.
import { CALIBRATION_STORAGE_KEY, store } from './store.js';

let calibrationSaveTimer = null; 

// loadCalibration(): muat nilai tersimpan; try/catch agar JSON rusak/diblokir tidak mematikan app.
function loadCalibration() {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY); 
    if (raw) {
      store.calibration = { ...store.calibration, ...JSON.parse(raw) }; // merge agar field yang hilang tetap 0.
    }
  } catch (error) {
    console.warn('Gagal membaca kalibrasi tersimpan:', error);
  }
}

// scheduleCalibrationSave(): tunda simpan 400ms; debounce karena slider memicu puluhan event per detik.
function scheduleCalibrationSave() {
  if (calibrationSaveTimer) return; // sudah terjadwal, jangan dobel.

  calibrationSaveTimer = setTimeout(() => {
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(store.calibration)); // simpan object jadi string.
    calibrationSaveTimer = null; 
  }, 400);
}

loadCalibration(); // muat sebelum UI pertama render.

// applyCalibrationToMounts(): geser mount kiri/kanan via transform CSS (murah, tanpa rebuild scene 3D).
export function applyCalibrationToMounts(leftEl, rightEl) {
  if (leftEl) { // null-safe: elemen bisa belum ada di DOM saat dipanggil awal.
    leftEl.style.transform = `translate(${store.calibration.leftX}px, ${store.calibration.leftY}px)`; // geser X/Y mata kiri.
  }
  if (rightEl) {
    rightEl.style.transform = `translate(${store.calibration.rightX}px, ${store.calibration.rightY}px)`; // geser X/Y mata kanan.
  }
}

// applyCalibrationTarget(): terapkan kalibrasi ke 'vr' (mount utama) atau 'preview' (settings).
export function applyCalibrationTarget(target) {
  if (target === 'vr') {
    applyCalibrationToMounts(
      document.getElementById('vrLeftMount'),
      document.getElementById('vrRightMount'),
    );
    return; // sudah ditangani, jangan lanjut ke 'preview'.
  }

  if (target === 'preview') {
    const previewLeft = document.getElementById('previewLeftMount');
    const previewRight = document.getElementById('previewRightMount');
    applyCalibrationToMounts(previewLeft, previewRight);
  }
}

// syncCalibrationSliders(): samakan slider HTML dengan store (nilai bisa berubah dari joystick, bukan slider).
export function syncCalibrationSliders() {
  const ids = { // map id elemen -> nilai store agar loop generik, tidak 4x getElementById manual.
    leftXSlider: store.calibration.leftX,
    leftYSlider: store.calibration.leftY,
    rightXSlider: store.calibration.rightX,
    rightYSlider: store.calibration.rightY,
  };

  Object.entries(ids).forEach(([id, value]) => { // loop tiap pasangan id-nilai.
    const el = document.getElementById(id);
    if (el) el.value = value; // null-safe: halaman settings mungkin belum tampil.
  });
}

// refreshCalibrationUI(): terapkan ke VR + preview + slider, lalu jadwalkan simpan.
export function refreshCalibrationUI() {
  applyCalibrationTarget('vr');
  applyCalibrationTarget('preview');
  syncCalibrationSliders();
  scheduleCalibrationSave();
}

// setCalibrationValues(): update parsial nilai kalibrasi (spread) lalu terapkan.
export function setCalibrationValues(nextCalibration) {
  store.calibration = { ...store.calibration, ...nextCalibration };
  refreshCalibrationUI();
}

// setCalibrationEye(): pilih mata aktif, highlight preview, dan perbarui teks status.
export function setCalibrationEye(eye) {
  store.selectedCalibrationEye = eye;
  document.querySelectorAll('.preview-mount').forEach((mount) => {
    mount.classList.toggle('selected', mount.id === `preview${eye === 'left' ? 'Left' : 'Right'}Mount`);
  });

  const status = document.getElementById('calibrationEyeStatus');
  if (status) status.textContent = `Panel aktif: mata ${eye === 'left' ? 'kiri' : 'kanan'}`;
}
