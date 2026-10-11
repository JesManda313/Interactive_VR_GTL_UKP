/**
 * video.js — video & scene mounts.
 * Dipakai mobile-player.html + vr-player.html.
 * (Handler `onended` dipasang oleh scenario.js agar modul ini bebas siklus import.)
 *
 * UNTUK APA FILE INI?
 * Mengelola elemen <video> HTML: bikin, bersihkan, pause, play.
 * Dipisah dari scenario.js KENAPA? Agar logic video bisa dipakai ulang VR+mobile
 * tanpa circular import (scenario.js import file ini, bukan sebaliknya).
 */

/**
 * ensureSharedVrVideo(scenario):
 * Untuk apa? Pastikan ada 1 elemen video bersama untuk VR (dipakai kedua mata kiri+kanan).
 * KENAPA 1 video bersama (bukan 2)? Hemat memori & sinkron: kalau 2 video, kiri-kanan bisa
 * tidak sinkron / dobel buffering. A-Frame <a-video> kiri & kanan sama-sama menunjuk src="#sharedVrVideo".
 * - Buat elemen jika belum ada + set atribut (crossorigin, playsinline, preload).
 *   KENAPA playsinline? Agar iOS tidak paksa fullscreen. KENAPA display:none? Video asli disembunyikan,
 *   yang tampil adalah tekstur 3D-nya.
 * - if src beda -> pause + ganti src + load(). KENAPA cek beda dulu? Agar tidak reload sia-sia bila segmen sama.
 * - onerror -> warn. KENAPA? Agar debug tahu file mana yang gagal (path salah / belum unduh).
 */
export function ensureSharedVrVideo(scenario) {
  let video = document.getElementById('sharedVrVideo'); // cari dulu, jangan bikin dobel.

  if (!video) { // belum ada -> buat baru.
    video = document.createElement('video');
    video.id = 'sharedVrVideo';
    video.className = 'scenario-video shared-vr-video';
    video.setAttribute('crossorigin', 'anonymous'); // KENAPA? Agar bisa dipakai sebagai tekstur WebGL tanpa taint CORS.
    video.setAttribute('playsinline', ''); // KENAPA? Cegah fullscreen otomatis di iOS.
    video.setAttribute('webkit-playsinline', ''); // versi lama Safari.
    video.setAttribute('preload', 'metadata'); // KENAPA metadata? Hemat kuota, cukup durasi dulu, bukan full video.
    video.style.display = 'none'; // sembunyikan elemen asli.

    document.body.appendChild(video); // taruh di body (di luar scene) agar awet walau scene di-rebuild.
  }

  if (video.getAttribute('src') !== scenario.video) { // ganti sumber bila segmen baru.
    video.pause(); // pause dulu KENAPA? Agar tidak glitch suara saat ganti src.
    video.setAttribute('src', scenario.video);
    video.load(); // load() KENAPA? Paksa browser muat ulang src baru.
  }

  video.onerror = () => {
    console.warn('Video VR gagal dimuat:', video.getAttribute('src'));
  };

  return video;
}

/**
 * stopVideos():
 * Untuk apa? Hentikan dan bersihkan SEMUA elemen video skenario di DOM.
 * Pause tiap video, hapus src, lalu load() untuk membebaskan resource.
 * KENAPA perlu? Saat pindah segmen/layar, video lama harus mati total (suara berhenti, memori bebas).
 * Tanpa ini, HP kentang bisa kehabisan memori / suara dobel.
 */
export function stopVideos() {
  document.querySelectorAll('.scenario-video').forEach((video) => { // .scenario-video = penanda semua video materi.
    try {
      video.pause();
      video.removeAttribute('src'); // hapus src KENAPA? Putus koneksi buffer.
      video.load(); // load kosong = flush buffer.
    } catch (error) {
      console.warn('Video cleanup skipped:', error); // try/catch KENAPA? 1 video gagal jangan gagalkan lainnya.
    }
  });
}

/**
 * pauseActiveVideos():
 * Untuk apa? Pause semua video skenario yang sedang diputar. Digunakan sebelum menampilkan kuis.
 * KENAPA pause (bukan stop)? Agar setelah jawab kuis, video bisa lanjut / user tidak kehilangan posisi.
 */
export function pauseActiveVideos() {
  document.querySelectorAll('.scenario-video').forEach((video) => {
    try {
      video.pause();
    } catch (error) {
      console.warn('Pause video skipped:', error);
    }
  });
}

/**
 * playActiveVideos():
 * Untuk apa? Coba play semua elemen video skenario; jika diblokir browser, log peringatan.
 * KENAPA async + await + try/catch per video? Browser modern blokir autoplay tanpa gesture user.
 * Jadi play() bisa reject Promise — harus ditangkap agar tidak jadi unhandled error merah.
 * KENAPA skip bila !src? Video tanpa src di-play akan error sia-sia.
 */
export async function playActiveVideos() {
  const videos = [...document.querySelectorAll('.scenario-video')]; // spread KENAPA? NodeList -> Array agar bisa for..of + await berurutan.

  for (const video of videos) {
    const src = video.getAttribute('src');

    if (!src) {
      continue; // lewati video kosong.
    }

    try {
      await video.play(); // await KENAPA? Tunggu 1 selesai sebelum lanjut agar log berurutan + hemat CPU.
    } catch (error) {
      console.warn('Video perlu gesture user untuk play:', error);
    }
  }
}

/**
 * clearScenes():
 * Untuk apa? Clear semua scene terpasang: hentikan video dan kosongkan kontainer mount.
 * Juga reset flag visibilitas kuis + sembunyikan popup flat mobile.
 * KENAPA dipanggil tiap pindah segmen/layar? Agar tidak ada sisa scene lama menumpuk (dobel A-Frame = lag).
 * - Kosongkan #mobileSceneMount, #vrLeftMount, #vrRightMount via innerHTML=''.
 * - Sembunyikan popup quiz/end/flat/rotate hint.
 * - Unlock orientation + exit fullscreen KENAPA? Mode flat sebelumnya paksa landscape+fullscreen,
 *   harus dikembalikan agar layar daftar bisa portrait normal.
 * - flatVideo.onended=null KENAPA? Lepas handler lama agar tidak ke-trigger setelah scene dibuang.
 */
export function clearScenes() {
  stopVideos(); // matikan video dulu sebelum buang DOM-nya.

  const mobileMount = document.getElementById('mobileSceneMount');
  const vrLeftMount = document.getElementById('vrLeftMount');
  const vrRightMount = document.getElementById('vrRightMount');

  if (mobileMount) {
    mobileMount.innerHTML = '';
    mobileMount.classList.remove('hidden');
  }
  if (vrLeftMount) vrLeftMount.innerHTML = '';
  if (vrRightMount) vrRightMount.innerHTML = '';

  document.getElementById('mobileQuizPopup')?.classList.add('hidden'); // ?. KENAPA? Elemen mungkin belum ada di DOM awal.
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
