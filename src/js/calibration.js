/**
 * calibration.js — kalibrasi IPD / vertical shift.
 * Dipakai settings.html (preview) + vr-player.html (mounts).
 *
 * UNTUK APA FILE INI?
 * Mengatur geser gambar VR kiri/kanan agar tidak terlihat double (misalignment antar mata).
 * - load saat start dari localStorage, simpan otomatis dengan debounce.
 * - Terapkan via transform CSS ke mount kiri/kanan.
 */
import { CALIBRATION_STORAGE_KEY, store } from './store.js'; // import store global + kunci storage. KENAPA? Nilai kalibrasi disimpan di store agar semua file bisa baca.

let calibrationSaveTimer = null; // timer debounce simpan. Untuk apa? Agar tiap geser slider tidak langsung tulis storage (berat), tapi tunggu 400ms tenang dulu.

// loadCalibration(): Untuk apa? Muat kalibrasi tersimpan saat file pertama di-import.
// KENAPA try/catch? Karena localStorage bisa berisi JSON rusak / diblokir browser privat — app tetap jalan dengan default 0.
function loadCalibration() {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY); // ambil string JSON. KENAPA pakai key konstanta? Agar konsisten dengan penulis.
    if (raw) {
      store.calibration = { ...store.calibration, ...JSON.parse(raw) }; // spread merge KENAPA? Agar kalau JSON lama tidak lengkap, field hilang tetap ada default 0.
    }
  } catch (error) {
    console.warn('Gagal membaca kalibrasi tersimpan:', error);
  }
}

// scheduleCalibrationSave(): Untuk apa? Jadwalkan simpan 400ms ke depan, abaikan panggilan ganda.
// KENAPA debounce? Slider mengirim puluhan event per detik; tanpa ini localStorage ditulis terus-menerus (lambat di HP).
// ini sistem auto save nya 
function scheduleCalibrationSave() {
  if (calibrationSaveTimer) return; // sudah dijadwalkan -> jangan dobel. KENAPA? Hemat timer.

  calibrationSaveTimer = setTimeout(() => {
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(store.calibration)); // simpan object jadi string.
    calibrationSaveTimer = null; // reset agar jadwal berikutnya boleh dibuat.
  }, 400);
}

loadCalibration(); // langsung jalan saat import. KENAPA di sini? Agar store.calibration sudah benar sebelum UI pertama render.

/**
 * applyCalibrationToMounts(leftEl, rightEl):
 * Untuk apa? kalibrasi IPD dan pergeseran vertikal ke mount kiri/kanan.
 * Offset diterapkan lewat transform CSS sehingga preview dan mount VR sejajar.
 * KENAPA transform CSS (bukan ubah A-Frame)? Karena mount adalah <div> pembungkus 2 scene kiri/kanan;
 * geser div jauh lebih murah & tidak perlu rebuild scene 3D.
 */
export function applyCalibrationToMounts(leftEl, rightEl) {
  if (leftEl) { // cek null KENAPA? Elemen bisa belum ada di DOM saat dipanggil awal.
    leftEl.style.transform = `translate(${store.calibration.leftX}px, ${store.calibration.leftY}px)`; // geser X/Y mata kiri.
  }
  if (rightEl) {
    rightEl.style.transform = `translate(${store.calibration.rightX}px, ${store.calibration.rightY}px)`; // geser X/Y mata kanan.
  }
}

/**
 * applyCalibrationTarget(target):
 * Untuk apa? Terapkan kalibrasi ke target tertentu: 'vr' atau 'preview'.
 * - 'vr' -> gunakan mount kiri/kanan utama (#vrLeftMount/#vrRightMount). KENAPA? Ini yang dilihat user di mode VR.
 * - 'preview' -> ambil elemen preview di settings. KENAPA? Agar user lihat efek geser saat setting.
 */
export function applyCalibrationTarget(target) {
  if (target === 'vr') {
    applyCalibrationToMounts(
      document.getElementById('vrLeftMount'),
      document.getElementById('vrRightMount'),
    );
    return; // return KENAPA? Hentikan agar tidak lanjut cek 'preview'.
  }

  if (target === 'preview') {
    const previewLeft = document.getElementById('previewLeftMount');
    const previewRight = document.getElementById('previewRightMount');
    applyCalibrationToMounts(previewLeft, previewRight);
  }
}

/**
 * syncCalibrationSliders():
 * Untuk apa? Simpan nilai kalibrasi baru dan sinkronkan posisi slider HTML agar sesuai nilai baru.
 * KENAPA perlu? Nilai bisa berubah dari remote joystick (bukan dari slider), jadi slider harus ikut update
 * agar tidak menipu (slider 0 padahal gambar sudah geser 20px).
 */
export function syncCalibrationSliders() {
  const ids = { // petakan id elemen -> nilai store. KENAPA object? Agar loop generik, tidak tulis 4x getElementById manual.
    leftXSlider: store.calibration.leftX,
    leftYSlider: store.calibration.leftY,
    rightXSlider: store.calibration.rightX,
    rightYSlider: store.calibration.rightY,
  };

  Object.entries(ids).forEach(([id, value]) => { // loop tiap pasangan id-nilai.
    const el = document.getElementById(id);
    if (el) el.value = value; // if KENAPA? Halaman settings mungkin belum tampil, elemen null -> jangan crash.
  });
}

// refreshCalibrationUI(): Untuk apa? Terapkan ke VR + preview + slider + jadwal simpan dalam 1 panggilan.
// KENAPA digabung? Agar setiap perubahan (slider/joystick/reset) cukup panggil 1 fungsi, tidak lupa salah satu.
export function refreshCalibrationUI() {
  applyCalibrationTarget('vr');
  applyCalibrationTarget('preview');
  syncCalibrationSliders();
  scheduleCalibrationSave();
}

// setCalibrationValues(next): Untuk apa? Simpan nilai kalibrasi baru (IPD dan vertical shift) dan terapkan.
// Contoh: setCalibrationValues({leftX:10}). KENAPA spread {...lama, ...baru}? Agar bisa update parsial
// (hanya leftX) tanpa menghapus field lain.
export function setCalibrationValues(nextCalibration) {
  store.calibration = { ...store.calibration, ...nextCalibration };
  refreshCalibrationUI();
}

// setCalibrationEye(eye): Untuk apa? Pilih mata aktif ('left'/'right') yang akan digeser joystick.
// - update store.selectedCalibrationEye. KENAPA disimpan? vr-player.js baca ini untuk tahu joystick menggeser yang mana.
// - toggle class 'selected' pada preview-mount KENAPA? Agar ada highlight visual mata aktif.
// - update #calibrationEyeStatus teks "Panel aktif: mata kiri/kanan" KENAPA? Feedback ke user.
export function setCalibrationEye(eye) {
  store.selectedCalibrationEye = eye;
  document.querySelectorAll('.preview-mount').forEach((mount) => {
    mount.classList.toggle('selected', mount.id === `preview${eye === 'left' ? 'Left' : 'Right'}Mount`);
  });

  const status = document.getElementById('calibrationEyeStatus');
  if (status) status.textContent = `Panel aktif: mata ${eye === 'left' ? 'kiri' : 'kanan'}`;
}
