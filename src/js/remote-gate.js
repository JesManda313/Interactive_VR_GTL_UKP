/**
 * remote-gate.js — gerbang konfirmasi remote Bluetooth sebelum masuk mode VR.
 * Dipakai dua jalur: popup VR di mode.js & modul kalibrasi di home.js.
 *
 * Sifatnya instruksi + deteksi best-effort: pairing BLE tetap lewat
 * Pengaturan HP, aplikasi hanya membaca navigator.getGamepads().
 */

const SKIP_KEY = 'gtl_skip_remote_gate_v1';

export function shouldSkipRemoteGate() {
  try {
    return localStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

function setSkipRemoteGate(skip) {
  try {
    if (skip) localStorage.setItem(SKIP_KEY, '1');
    else localStorage.removeItem(SKIP_KEY);
  } catch { /* abaikan */ }
}

/** Nama gamepad pertama yang terdeteksi, atau null. */
export function detectedGamepadName() {
  try {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (p?.connected) return p.id || 'Remote';
    }
  } catch { /* abaikan */ }
  return null;
}

/**
 * Tampilkan modal remote. onContinue dipanggil saat user tekan Lanjut.
 * Bila user centang "jangan tampilkan lagi", modal dilewati berikutnya.
 */
export function confirmRemoteBeforeVr({ onContinue, onCancel } = {}) {
  if (shouldSkipRemoteGate()) {
    onContinue?.();
    return;
  }
  const popup = document.getElementById('remotePopup');
  if (!popup) {
    onContinue?.();
    return;
  }
  // PENTING: pindahkan modal ke <body> sekali saja. KENAPA? HTML-nya disuntik
  // di dalam #modeScreen; display:none di ancestor menyembunyikan semua anak
  // (termasuk fixed). Dari home (kalibrasi), modeScreen hidden -> modal tak
  // pernah terlihat. Di body, modal bebas dari showScreen.
  if (popup.parentElement !== document.body) {
    document.body.appendChild(popup);
  }
  // Guard dobel-buka (mis. klik cepat dua kali).
  if (!popup.classList.contains('hidden')) return;
  const status = document.getElementById('remoteDetectStatus');
  const skipBox = document.getElementById('remoteSkipCheckbox');
  const found = detectedGamepadName();
  if (status) {
    status.textContent = found
      ? `✓ Remote terdeteksi: ${found}`
      : 'Belum terdeteksi — ikuti langkah di bawah, lalu tekan Lanjut.';
    status.classList.toggle('good', !!found);
  }
  if (skipBox) skipBox.checked = false;

  document.getElementById('remoteContinue').onclick = () => {
    setSkipRemoteGate(!!skipBox?.checked);
    popup.classList.add('hidden');
    cleanup();
    onContinue?.();
  };
  const cancel = () => {
    popup.classList.add('hidden');
    cleanup();
    onCancel?.();
  };
  document.getElementById('remoteCancel').onclick = cancel;
  const onBackdrop = (e) => {
    if (e.target === popup) cancel();
  };
  popup.addEventListener('click', onBackdrop);
  function cleanup() {
    popup.removeEventListener('click', onBackdrop);
  }
  popup.classList.remove('hidden');
}
