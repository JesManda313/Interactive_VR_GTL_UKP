// video.js: kelola elemen <video> materi (buat, pause, play, bersihkan) untuk mobile dan VR.
import { getFadeOverlays } from './fade.js';

// showVideoError(title): tampilkan pesan gagal putar di overlay fade mobile dan VR.
export function showVideoError(title) {
  try {
    for (const mode of ['mobile', 'vr']) {
      getFadeOverlays(mode).forEach((overlay) => {
        const textEl = overlay.querySelector('.fade-message');
        if (textEl) textEl.textContent = `Video gagal diputar${title ? `: ${title}` : ''} — cek file/unduhan modul.`;
        overlay.classList.add('active');
        overlay.style.opacity = '1';
      });
    }
  } catch { /* overlay boleh tidak ada; jangan ganggu alur */ }
}

// shortVideoLabel(video): judul pendek dari src untuk pesan error (tanpa data-URL raksasa).
function shortVideoLabel(video) {
  const src = video?.getAttribute?.('src') ?? '';
  if (!src) return '';
  if (src.startsWith('data:')) return '(gambar/video data-URL)';
  if (src.startsWith('blob:')) return '(berkas lokal)';
  const clean = src.split('?')[0];
  const parts = clean.split('/');
  return parts[parts.length - 1] || clean.slice(-40);
}

// hookVideoError(video): pasang sekali per elemen; error video -> warning + pesan menetap.
function hookVideoError(video) {
  if (!video || video.dataset.errHook) return;
  video.dataset.errHook = '1';
  video.addEventListener('error', () => {
    if (!video.getAttribute('src')) return; // abaikan saat cleanup (src sengaja dikosongkan).
    const label = shortVideoLabel(video);
    console.warn('Video gagal diputar:', video.getAttribute('src'));
    showVideoError(label);
  });
}

// ensureSharedVrVideo(scenario): satu elemen video bersama untuk kedua mata VR (hemat memori dan tetap sinkron).
export function ensureSharedVrVideo(scenario) {
  let video = document.getElementById('sharedVrVideo'); // cari dulu agar tidak dobel.

  if (!video) {
    video = document.createElement('video');
    video.id = 'sharedVrVideo';
    video.className = 'scenario-video shared-vr-video';
    video.setAttribute('crossorigin', 'anonymous'); // agar bisa jadi tekstur WebGL tanpa taint CORS.
    video.setAttribute('playsinline', ''); // cegah fullscreen otomatis di iOS.
    video.setAttribute('webkit-playsinline', ''); // versi lama Safari.
    video.setAttribute('preload', 'metadata'); // hemat kuota, cukup metadata.
    video.style.display = 'none'; // yang tampil adalah tekstur 3D.

    document.body.appendChild(video); // di luar scene agar awet saat scene di-rebuild.
  }

  if (video.getAttribute('src') !== scenario.video) { // ganti sumber hanya bila segmen baru.
    video.pause(); // cegah glitch suara saat ganti src.
    video.setAttribute('src', scenario.video);
    video.load(); // paksa browser memuat src baru.
  }

  video.onerror = () => {
    if (!video.getAttribute('src')) return;
    console.warn('Video VR gagal dimuat:', video.getAttribute('src'));
    showVideoError(shortVideoLabel(video));
  };

  hookVideoError(video);

  return video;
}

// stopVideos(): hentikan dan lepaskan semua elemen video skenario.
export function stopVideos() {
  document.querySelectorAll('.scenario-video').forEach((video) => {
    try {
      video.pause();
      video.removeAttribute('src'); // putus buffer.
      video.load(); // flush buffer.
    } catch (error) {
      console.warn('Video cleanup skipped:', error); // satu video gagal jangan menggagalkan lainnya.
    }
  });
}

// pauseActiveVideos(): pause semua video skenario tanpa menghapus posisi.
export function pauseActiveVideos() {
  document.querySelectorAll('.scenario-video').forEach((video) => {
    try {
      video.pause();
    } catch (error) {
      console.warn('Pause video skipped:', error);
    }
  });
}

// playActiveVideos(): coba play semua video skenario; autoplay bisa ditolak browser tanpa gesture.
export async function playActiveVideos() {
  const videos = [...document.querySelectorAll('.scenario-video')]; // NodeList -> Array agar bisa await berurutan.

  for (const video of videos) {
    const src = video.getAttribute('src');

    if (!src) {
      continue; // lewati video kosong.
    }

    hookVideoError(video);

    try {
      await video.play(); // berurutan agar log rapi dan hemat CPU.
    } catch (error) {
      console.warn('Video perlu gesture user untuk play:', error);
    }
  }
}

// clearScenes(): hentikan video dan kosongkan semua mount scene serta popup sisa.
export function clearScenes() {
  stopVideos(); // matikan video sebelum DOM dibuang.

  const mobileMount = document.getElementById('mobileSceneMount');
  const vrLeftMount = document.getElementById('vrLeftMount');
  const vrRightMount = document.getElementById('vrRightMount');

  if (mobileMount) {
    mobileMount.innerHTML = '';
    mobileMount.classList.remove('hidden');
  }
  if (vrLeftMount) vrLeftMount.innerHTML = '';
  if (vrRightMount) vrRightMount.innerHTML = '';

  document.getElementById('mobileQuizPopup')?.classList.add('hidden'); // guard null: elemen mungkin belum ada.
  document.getElementById('mobileEndPopup')?.classList.add('hidden');
  document.getElementById('mobileFlatWrap')?.classList.add('hidden');
  document.getElementById('mobileRotateHint')?.classList.add('hidden');

  // kembalikan orientasi + fullscreen agar layar daftar bisa portrait normal.
  try {
    if (screen.orientation?.unlock) screen.orientation.unlock();
  } catch { /* abaikan */ }
  try {
    if (document.fullscreenElement) document.exitFullscreen()?.catch?.(() => {});
  } catch { /* abaikan */ }

  const flatVideo = document.getElementById('mobileFlatVideo');
  if (flatVideo) {
    flatVideo.onended = null; // lepas handler lama agar tidak terpicu setelah scene dibuang.
  }
}
