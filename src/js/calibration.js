/**
 * calibration.js — kalibrasi IPD / vertical shift.
 * Dipakai settings.html (preview) + vr-player.html (mounts).
 */
import { CALIBRATION_STORAGE_KEY, store } from './store.js';

let calibrationSaveTimer = null;

function loadCalibration() {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (raw) {
      store.calibration = { ...store.calibration, ...JSON.parse(raw) };
    }
  } catch (error) {
    console.warn('Gagal membaca kalibrasi tersimpan:', error);
  }
}

function scheduleCalibrationSave() {
  if (calibrationSaveTimer) return;

  calibrationSaveTimer = setTimeout(() => {
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(store.calibration));
    calibrationSaveTimer = null;
  }, 400);
}

loadCalibration();

/**
 * kalibrasi IPD dan pergeseran vertikal ke mount kiri/kanan.
 * Offset diterapkan lewat transform CSS sehingga preview dan mount VR sejajar.
 */
export function applyCalibrationToMounts(leftEl, rightEl) {
  if (leftEl) {
    leftEl.style.transform = `translate(${store.calibration.leftX}px, ${store.calibration.leftY}px)`;
  }
  if (rightEl) {
    rightEl.style.transform = `translate(${store.calibration.rightX}px, ${store.calibration.rightY}px)`;
  }
}

/**
 * Terapkan kalibrasi ke target tertentu: 'vr' atau 'preview'.
 * Untuk VR, gunakan mount kiri/kanan. Untuk preview, ambil elemen preview.
 */
export function applyCalibrationTarget(target) {
  if (target === 'vr') {
    applyCalibrationToMounts(
      document.getElementById('vrLeftMount'),
      document.getElementById('vrRightMount'),
    );
    return;
  }

  if (target === 'preview') {
    const previewLeft = document.getElementById('previewLeftMount');
    const previewRight = document.getElementById('previewRightMount');
    applyCalibrationToMounts(previewLeft, previewRight);
  }
}

/**
 * Simpan nilai kalibrasi baru (IPD dan vertical shift) dan terapkan.
 * Juga memperbarui kontrol slider yang terlihat agar sesuai nilai baru.
 */
export function syncCalibrationSliders() {
  const ids = {
    leftXSlider: store.calibration.leftX,
    leftYSlider: store.calibration.leftY,
    rightXSlider: store.calibration.rightX,
    rightYSlider: store.calibration.rightY,
  };

  Object.entries(ids).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });
}

export function refreshCalibrationUI() {
  applyCalibrationTarget('vr');
  applyCalibrationTarget('preview');
  syncCalibrationSliders();
  scheduleCalibrationSave();
}

export function setCalibrationValues(nextCalibration) {
  store.calibration = { ...store.calibration, ...nextCalibration };
  refreshCalibrationUI();
}

export function setCalibrationEye(eye) {
  store.selectedCalibrationEye = eye;
  document.querySelectorAll('.preview-mount').forEach((mount) => {
    mount.classList.toggle('selected', mount.id === `preview${eye === 'left' ? 'Left' : 'Right'}Mount`);
  });

  const status = document.getElementById('calibrationEyeStatus');
  if (status) status.textContent = `Panel aktif: mata ${eye === 'left' ? 'kiri' : 'kanan'}`;
}
