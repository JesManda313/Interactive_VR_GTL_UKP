/**
 * video.js — video & scene mounts.
 * Dipakai mobile-player.html + vr-player.html.
 * (Handler `onended` dipasang oleh scenario.js agar modul ini bebas siklus import.)
 */

/**
 * Pastikan ada elemen video bersama untuk VR (digunakan oleh kedua mata).
 * Buat elemen jika belum ada, set sumber video sesuai skenario, dan pasang handler.
 */
export function ensureSharedVrVideo(scenario) {
  let video = document.getElementById('sharedVrVideo');

  if (!video) {
    video = document.createElement('video');
    video.id = 'sharedVrVideo';
    video.className = 'scenario-video shared-vr-video';
    video.setAttribute('crossorigin', 'anonymous');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('preload', 'metadata');
    video.style.display = 'none';

    document.body.appendChild(video);
  }

  if (video.getAttribute('src') !== scenario.video) {
    video.pause();
    video.setAttribute('src', scenario.video);
    video.load();
  }

  video.onerror = () => {
    console.warn('Video VR gagal dimuat:', video.getAttribute('src'));
  };

  return video;
}

/**
 * Hentikan dan bersihkan semua elemen video skenario di DOM.
 * Pause setiap video, hapus atribut src, lalu panggil load() untuk membebaskan resource.
 */
export function stopVideos() {
  document.querySelectorAll('.scenario-video').forEach((video) => {
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch (error) {
      console.warn('Video cleanup skipped:', error);
    }
  });
}

/** Pause semua video skenario yang sedang diputar. Digunakan sebelum menampilkan kuis. */
export function pauseActiveVideos() {
  document.querySelectorAll('.scenario-video').forEach((video) => {
    try {
      video.pause();
    } catch (error) {
      console.warn('Pause video skipped:', error);
    }
  });
}

/** Coba play semua elemen video skenario; jika diblokir oleh browser, log peringatan. */
export async function playActiveVideos() {
  const videos = [...document.querySelectorAll('.scenario-video')];

  for (const video of videos) {
    const src = video.getAttribute('src');

    if (!src) {
      continue;
    }

    try {
      await video.play();
    } catch (error) {
      console.warn('Video perlu gesture user untuk play:', error);
    }
  }
}

/**
 * Clear semua scene yang terpasang: hentikan video dan kosongkan kontainer mount.
 * Juga reset flag visibilitas kuis + sembunyikan popup flat mobile.
 */
export function clearScenes() {
  stopVideos();

  const mobileMount = document.getElementById('mobileSceneMount');
  const vrLeftMount = document.getElementById('vrLeftMount');
  const vrRightMount = document.getElementById('vrRightMount');

  if (mobileMount) {
    mobileMount.innerHTML = '';
    mobileMount.classList.remove('hidden');
  }
  if (vrLeftMount) vrLeftMount.innerHTML = '';
  if (vrRightMount) vrRightMount.innerHTML = '';

  document.getElementById('mobileQuizPopup')?.classList.add('hidden');
  document.getElementById('mobileEndPopup')?.classList.add('hidden');
  document.getElementById('mobileFlatWrap')?.classList.add('hidden');
  document.getElementById('mobileRotateHint')?.classList.add('hidden');

  try {
    if (screen.orientation?.unlock) screen.orientation.unlock();
  } catch { /* abaikan */ }
  try {
    if (document.fullscreenElement) document.exitFullscreen()?.catch?.(() => {});
  } catch { /* abaikan */ }

  const flatVideo = document.getElementById('mobileFlatVideo');
  if (flatVideo) {
    flatVideo.onended = null;
  }
}
