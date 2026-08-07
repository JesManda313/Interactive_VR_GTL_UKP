const MODULES_URL = '/content/modules.json';

const homeScreen = document.getElementById('homeScreen');
const settingsScreen = document.getElementById('settingsScreen');
const modeScreen = document.getElementById('modeScreen');
const mobileScreen = document.getElementById('mobileScreen');
const vrScreen = document.getElementById('vrScreen');

const moduleList = document.getElementById('moduleList');

const selectedModuleTitle = document.getElementById('selectedModuleTitle');
const selectedModuleDescription = document.getElementById('selectedModuleDescription');
const selectedModuleSegments = document.getElementById('selectedModuleSegments');
const selectedModuleDecisions = document.getElementById('selectedModuleDecisions');

const mobileMount = document.getElementById('mobileSceneMount');
const vrLeftMount = document.getElementById('vrLeftMount');
const vrRightMount = document.getElementById('vrRightMount');

const IPD_STORAGE_KEY = 'gtlvr_ipd_offset_px';
const VSHIFT_STORAGE_KEY = 'gtlvr_vshift_offset_px';

let calibrationIpdOffset = Number(localStorage.getItem(IPD_STORAGE_KEY)) || 0;
let calibrationVShift = Number(localStorage.getItem(VSHIFT_STORAGE_KEY)) || 0;

const vrScenarioTitle = document.getElementById('vrScenarioTitle');

//daftar modul yang sedang dipilih
let modules = [];
let activeModule = null;

//daftar skenario yang aktif dan  Map untuk lookup cepat 
// by-id (O(1) dibanding .find() yang O(n))
let scenarios = [];
let scenarioMap = new Map();
let activeScenarioId = null;

// mode yang aktif vr / mobile 
let activeMode = null;

//untuk panel quiznya visible apa ndak, 
// munculin langsung setelah video konsekuensi 
let isQuizVisible = false;
let shouldShowQuizImmediately = false;

//untuk deteksi remote bluetooth  
let gamepadIndex = null;
let prevButtonPressed = false;

/**
 * Sanitasi nilai untuk dimasukkan ke HTML/atribut teks.
 * Mengubah null/undefined menjadi string kosong dan meng-escape entitas HTML.
 */
function safeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Ganti layar yang terlihat ke elemen screen yang diberikan.
 * Menyembunyikan semua screen yang diketahui lalu menampilkan yang dipilih.
 */
function showScreen(screen) {
  homeScreen.classList.add('hidden');
  settingsScreen.classList.add('hidden');
  modeScreen.classList.add('hidden');
  mobileScreen.classList.add('hidden');
  vrScreen.classList.add('hidden');

  screen.classList.remove('hidden');
}

/**
 * kalibrasi IPD dan pergeseran vertikal ke mount kiri/kanan.
 * Offset diterapkan lewat transform CSS sehingga preview dan mount VR sejajar.
 */
function applyCalibrationToMounts(leftEl, rightEl) {
  if (leftEl) {
    leftEl.style.transform = `translate(${calibrationIpdOffset}px, ${calibrationVShift}px)`;
  }
  if (rightEl) {
    rightEl.style.transform = `translate(${-calibrationIpdOffset}px, ${calibrationVShift}px)`;
  }
}

/**
 * Terapkan kalibrasi ke target tertentu: 'vr' atau 'preview'.
 * Untuk VR, gunakan mount kiri/kanan. Untuk preview, ambil elemen preview.
 */
function applyCalibrationTarget(target) {
  if (target === 'vr') {
    applyCalibrationToMounts(vrLeftMount, vrRightMount);
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
function setCalibrationValues(ipd, vShift) {
  calibrationIpdOffset = ipd;
  calibrationVShift = vShift;
  localStorage.setItem(IPD_STORAGE_KEY, calibrationIpdOffset);
  localStorage.setItem(VSHIFT_STORAGE_KEY, calibrationVShift);

  applyCalibrationTarget('vr');
  applyCalibrationTarget('preview');

  const ipdSlider = document.getElementById('ipdSlider');
  const vShiftSlider = document.getElementById('vShiftSlider');
  const ipdSliderStandalone = document.getElementById('ipdSliderStandalone');
  const vShiftSliderStandalone = document.getElementById('vShiftSliderStandalone');

  if (ipdSlider) ipdSlider.value = calibrationIpdOffset;
  if (vShiftSlider) vShiftSlider.value = calibrationVShift;
  if (ipdSliderStandalone) ipdSliderStandalone.value = calibrationIpdOffset;
  if (vShiftSliderStandalone) vShiftSliderStandalone.value = calibrationVShift;
}

/** Ambil manifest modul dari server dan render daftar modul. */
async function loadModules() {
  const response = await fetch(MODULES_URL);

  if (!response.ok) {
    throw new Error('Gagal membaca modules.json');
  }

  modules = await response.json();
  renderModuleList();
}

/**
 * Render daftar modul ke dalam UI. Setiap modul menjadi sebuah tombol.
 * Menggunakan `safeText` untuk mencegah penyisipan HTML yang tidak aman.
 */
function renderModuleList() {
  if (!modules.length) {
    moduleList.innerHTML = '<p>Belum ada modul tersedia.</p>';
    return;
  }

  moduleList.innerHTML = modules
    .map((module, index) => {
      return `
        <button class="module-card" data-module-id="${safeText(module.id)}" data-index="${String(index + 1).padStart(2, '0')}">
          <div class="module-body">
            <strong>${safeText(module.title)}</strong>
            <p>${safeText(module.subtitle ?? module.description ?? '')}</p>
            <small>
              ${safeText(module.totalSegments ?? '-')} segmen •
              ${safeText(module.totalDecisionPoints ?? '-')} decision point
            </small>
          </div>
          <span class="module-arrow">→</span>
        </button>
      `;
    })
    .join('');

  moduleList.querySelectorAll('.module-card').forEach((button) => {
    button.addEventListener('click', () => {
      openModule(button.dataset.moduleId);
    });
  });
}

/**
 * Buka modul berdasarkan id: set active module, perbarui UI, muat skenarionya, lalu tampilkan pilihan mode.
 */
async function openModule(moduleId) {
  const selectedModule = modules.find((module) => module.id === moduleId);

  if (!selectedModule) {
    alert('Modul tidak ditemukan.');
    return;
  }

  activeModule = selectedModule;

  selectedModuleTitle.textContent = activeModule.title;
  selectedModuleDescription.textContent = activeModule.description ?? activeModule.subtitle ?? '-';
  selectedModuleSegments.textContent = `${activeModule.totalSegments ?? '-'} segmen`;
  selectedModuleDecisions.textContent = `${activeModule.totalDecisionPoints ?? '-'} decision point`;

  await loadScenarios(activeModule.scenarioUrl);

  showScreen(modeScreen);
}

/** Ambil skenario untuk modul dan buat peta (Map) yang diindeks oleh id skenario. */
async function loadScenarios(scenarioUrl) {
  const response = await fetch(scenarioUrl);

  if (!response.ok) {
    throw new Error('Gagal membaca scenarios.json modul.');
  }

  scenarios = await response.json();
  scenarioMap = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  activeScenarioId = scenarios[0]?.id ?? null;
}

/** Kembalikan objek skenario aktif berdasarkan `activeScenarioId`. */
function getActiveScenario() {
  return scenarioMap.get(activeScenarioId);
}

/**
 * Pastikan ada elemen video bersama untuk VR (digunakan oleh kedua mata).
 * Buat elemen jika belum ada, set sumber video sesuai skenario, dan pasang handler.
 */
function ensureSharedVrVideo(scenario) {
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

  video.onended = handleVideoEnded;
  video.onerror = () => {
    console.warn('Video VR gagal dimuat:', video.getAttribute('src'));
  };

  return video;
}

/**
 * Hentikan dan bersihkan semua elemen video skenario di DOM.
 * Pause setiap video, hapus atribut src, lalu panggil load() untuk membebaskan resource.
 */
function stopVideos() {
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
function pauseActiveVideos() {
  document.querySelectorAll('.scenario-video').forEach((video) => {
    try {
      video.pause();
    } catch (error) {
      console.warn('Pause video skipped:', error);
    }
  });
}

/**
 * Clear semua scene yang terpasang: hentikan video dan kosongkan kontainer mount.
 * Juga reset flag visibilitas kuis.
 */
function clearScenes() {
  stopVideos();

  if (mobileMount) mobileMount.innerHTML = '';
  if (vrLeftMount) vrLeftMount.innerHTML = '';
  if (vrRightMount) vrRightMount.innerHTML = '';

  isQuizVisible = false;
}

/**
 * Ambil elemen overlay fade sesuai mode ('mobile' atau 'vr').
 * Untuk VR dapat mengembalikan beberapa elemen (kiri/kanan).
 */
function getFadeOverlay(mode) {
  if (mode === 'mobile') {
    return document.getElementById('mobileFadeOverlay');
  }

  if (mode === 'vr') {
    return [...document.querySelectorAll('.vr-fade-panel')];
  }

  return null;
}

/** Set pesan teks pada overlay fade untuk mode tertentu dan aktifkan overlay. */
function setFadeMessage(mode, message) {
  const overlays = getFadeOverlays(mode);

  overlays.forEach((overlay) => {
    const textEl = overlay.querySelector('.fade-message');
    if (textEl) textEl.textContent = message;
    overlay.classList.add('active');
  });
}

/** Nonaktifkan overlay fade untuk mode tertentu dan bersihkan pesan teks. */
function clearFadeMessage(mode) {
  getFadeOverlays(mode).forEach((overlay) => {
    overlay.classList.remove('active');
    const textEl = overlay.querySelector('.fade-message');
    if (textEl) textEl.textContent = '';
  });
}

/** Normalisasi nilai overlay menjadi array (selalu mengembalikan array). */
function getFadeOverlays(mode) {
  const overlay = getFadeOverlay(mode);
  if (!overlay) return [];
  return Array.isArray(overlay) ? overlay : [overlay];
}

/**
 * Lakukan transisi fade pada overlay (opacity = 0 atau 1).
 * Mengembalikan Promise yang ter-resolve saat transisi selesai atau timeout.
 */
function fadeOverlay(mode, opacity) {
  return new Promise((resolve) => {
    const overlays = getFadeOverlays(mode);
    if (!overlays.length) {
      resolve();
      return;
    }

    overlays.forEach((overlay) => {
      overlay.classList.toggle('active', opacity === 1);
    });

    const handleTransitionEnd = (event) => {
      if (event.propertyName === 'opacity') {
        overlays.forEach((overlay) => {
          overlay.removeEventListener('transitionend', handleTransitionEnd);
        });
        resolve();
      }
    };

    overlays.forEach((overlay) => {
      overlay.addEventListener('transitionend', handleTransitionEnd);
    });
    requestAnimationFrame(() => {
      overlays.forEach((overlay) => {
        overlay.style.opacity = opacity.toString();
      });
    });

    setTimeout(() => {
      overlays.forEach((overlay) => {
        overlay.removeEventListener('transitionend', handleTransitionEnd);
      });
      resolve();
    }, 2000);
  });
}

/**
 * Bangun HTML A-Frame untuk daftar opsi kuis.
 * Menghitung posisi, ukuran, dan atribut data untuk tiap opsi.
 */
function buildOptionsHtml(options = [], variant = 'mobile') {
  const count = options.length || 1;

  // Total lebar yang tersedia untuk baris opsi (di dalam panel)
  const availableWidth = variant === 'vr' ? 1.95 : 4.2;
  const gapX = variant === 'vr' ? 0.08 : 0.15;

  const optionWidth = (availableWidth - gapX * (count - 1)) / count;
  const optionHeight = variant === 'vr' ? 0.62 : 1.05;

  const totalRowWidth = optionWidth * count + gapX * (count - 1);
  const startX = -totalRowWidth / 2 + optionWidth / 2;

  const y = variant === 'vr' ? -0.5 : -0.5;
  const textScale = variant === 'vr'
    ? '0.9 0.9 0.9'
    : '0.9 0.9 0.9';
  const wrapCount = variant === 'vr' ? 18 : 20;

  return options
    .map((option, index) => {
      const x = startX + index * (optionWidth + gapX);

      return `
        <a-entity
          class="quiz-option clickable"
          data-option-index="${index}"
          data-next="${safeText(option.next ?? '')}"
          data-consequence="${safeText(option.consequence ?? '')}"
          data-correct="${option.correct ? 'true' : 'false'}"
          position="${x.toFixed(3)} ${y} 0.04"
        >
          <a-plane
            class="option-bg clickable"
            width="${optionWidth.toFixed(3)}"
            height="${optionHeight}"
            color="#6f9fbd"
            opacity="0.96"
            material="shader: flat"
          ></a-plane>

          <a-text
            class="clickable"
            value="${safeText(option.label)}. ${safeText(option.text)}"
            align="center"
            width="${(optionWidth + 0.15).toFixed(3)}"
            color="#ffffff"
            scale="${textScale}"
            position="0 0 0.03"
            wrap-count="${wrapCount}"
          ></a-text>
        </a-entity>
      `;
    })
    .join('');
}

/**
 * Bangun HTML A-Frame untuk panel kuis lengkap (pertanyaan + opsi + feedback).
 * Mengembalikan string HTML atau string kosong jika tidak ada pertanyaan.
 */
function buildQuizPanelHtml(scenario, variant = 'mobile') {
  if (!scenario.question || !Array.isArray(scenario.options)) {
    return '';
  }

  const panelWidth = variant === 'vr' ? '2.25' : '4.7';
  const panelHeight = variant === 'vr' ? '2.35' : '3.05';
  const questionWidth = variant === 'vr' ? '1.95' : '3.4';
  const questionY = variant === 'vr' ? '0.62' : '0.8';
  const options = buildOptionsHtml(scenario.options, variant);

  return `
    <a-entity
      class="quiz-panel"
      visible="false"
      position="0 3 -3.1"
    >
      <a-plane
        width="${panelWidth}"
        height="${panelHeight}"
        color="#f7fbfe"
        opacity="0.97"
        material="shader: flat"
      ></a-plane>

      <a-plane
        width="${panelWidth}"
        height="0.08"
        color="#78b7dc"
        position="0 ${variant === 'vr' ? '1.09' : '1.47'} 0.04"
        material="shader: flat"
      ></a-plane>

      <a-text
        value="DECISION POINT"
        align="center"
        width="${variant === 'vr' ? '1.5' : '2.2'}"
        color="#4d89ae"
        position="0 ${variant === 'vr' ? '1.2' : '1.62'} 0.04"
        wrap-count="20"
      ></a-text>

      <a-text
        value="${safeText(scenario.question)}"
        align="center"
        width="${questionWidth}"
        color="#183247"
        position="0 ${questionY} 0.03"
        wrap-count="28"
      ></a-text>

      ${options}

      <a-text
        class="feedback-text"
        value="Arahkan cursor ke jawaban."
        align="center"
        width="${questionWidth}"
        color="#4d89ae"
        position="0 -1.25 0.03"
        scale="${variant === 'vr' ? '0.5 0.5 0.5' : '0.5 0.5 0.5'}"
        wrap-count="24"
      ></a-text>
    </a-entity>
  `;
}

/** Bangun HTML A-Frame untuk tombol 'Kembali' di dunia VR/mobile. */
function buildWorldBackButtonHtml() {
  return `
    <a-entity
      class="world-back-button clickable"
      position="-1.65 2.05 3.2"
      rotation="0 180 0"
    >
      <a-plane
        class="world-back-button-bg clickable"
        width="1"
        height="0.38"
        color="#f7fbfe"
        opacity="0.97"
        material="shader: flat; side: double"
      ></a-plane>
      <a-plane
        class="clickable"
        width="1"
        height="0.05"
        color="#78b7dc"
        position="0 0.16 0.04"
        material="shader: flat; side: double"
      ></a-plane>
      <a-text
        class="clickable"
        value="← Kembali"
        align="center"
        width="1.65"
        color="#183247"
        position="0 0 0.03"
        wrap-count="12"
      ></a-text>
    </a-entity>
  `;
}

/**
 * Buat pesan transisi singkat berdasarkan tipe skenario (untuk overlay fade).
 */
async function getTransitionMessage(scenario) {
  if (!scenario) {
    return '';
  }

  const title = scenario.title || 'Segmen baru';
  if (scenario.type === 'consequence') {
    return `Konsekuensi: ${title}`;
  }

  return `Masuk ke: ${title}`;
}

/**
 * Render skenario aktif ke layar sesuai mode (VR atau mobile).
 * Menangani pembuatan scene, pemasangan video, binding event, dan transisi.
 */
async function renderActiveScenario() {
  const scenario = getActiveScenario();

  if (!scenario) {
    return;
  }

  const overlay = getFadeOverlay(activeMode);
  if (overlay) {
    setFadeMessage(activeMode, await getTransitionMessage(scenario));
    await fadeOverlay(activeMode, 1);
  }

  clearScenes();

  if (activeMode === 'vr') {
    if (!vrLeftMount || !vrRightMount) {
      console.error('Elemen #vrLeftMount atau #vrRightMount tidak ditemukan di index.html');
      return;
    }

    vrScenarioTitle.textContent = scenario.title;

    // 1 video yang dipakai bersama oleh scene kiri dan kanan.
    ensureSharedVrVideo(scenario);

    // Tampilan kiri dan kanan.
    vrLeftMount.innerHTML = buildSceneHtml({
      mode: 'vr',
      eye: 'left',
      scenario,
    });

    vrRightMount.innerHTML = buildSceneHtml({
      mode: 'vr',
      eye: 'right',
      scenario,
    });

    bindSceneEvents(vrLeftMount);
    bindSceneEvents(vrRightMount);
    applyCalibrationTarget('vr');
  }

  if (activeMode === 'mobile') {
    if (!mobileMount) {
      console.error('Elemen #mobileSceneMount tidak ditemukan di index.html');
      return;
    }


    mobileMount.innerHTML = buildSceneHtml({
      mode: 'mobile',
      eye: 'main',
      scenario,
    });

    bindSceneEvents(mobileMount);
  }

  if (shouldShowQuizImmediately) {
    setTimeout(() => {
      pauseActiveVideos();
      showQuiz();
      shouldShowQuizImmediately = false;
    }, 500);
  } else {
    setTimeout(playActiveVideos, 400);
  }

  if (overlay) {
    setTimeout(() => {
      fadeOverlay(activeMode, 0);
    }, 1800);
  }
}

/**
 * Bangun string HTML A-Frame untuk sebuah scene (mobile atau VR eye).
 * Menyusun aset video, videosphere, kamera, cursor, tombol kembali, dan panel kuis.
 */
function buildSceneHtml({ mode, eye = 'main', scenario }) {
  const isVr = mode === 'vr';

  // VR memakai 1 shared video.
  // Mobile memakai 1 video sendiri di dalam scene.
  const videoId = isVr ? 'sharedVrVideo' : `${mode}-video`;
  const sceneId = `${mode}-${eye}-scene`;

  const quizHtml = buildQuizPanelHtml(scenario, isVr ? 'vr' : 'mobile');
  const worldBackButtonHtml = buildWorldBackButtonHtml();

  const cameraControls = isVr
    ? 'look-controls="touchEnabled: false; mouseEnabled: false; magicWindowTrackingEnabled: true"'
    : 'look-controls="touchEnabled: true; mouseEnabled: true; magicWindowTrackingEnabled: false"';

  const cursor = isVr
    ? `
      <a-cursor
        class="gaze-cursor"
        raycaster="objects: .clickable"
        fuse="false"
        geometry="primitive: ring; radiusInner: 0.012; radiusOuter: 0.022"
        material="color: #facc15; shader: flat"
        position="0 0 -1"
      ></a-cursor>
    `
    : `
      <a-cursor
        class="tap-cursor"
        raycaster="objects: .clickable"
        fuse="false"
        geometry="primitive: ring; radiusInner: 0.01; radiusOuter: 0.016"
        material="color: #38bdf8; shader: flat"
        position="0 0 -1"
      ></a-cursor>
    `;

  const videoAssetHtml = isVr
    ? ''
    : `
      <a-assets>
        <video
          id="${videoId}"
          class="scenario-video"
          crossorigin="anonymous"
          playsinline
          webkit-playsinline
          preload="metadata"
          src="${safeText(scenario.video)}"
        ></video>
      </a-assets>
    `;

  return `
    <a-scene
      id="${sceneId}"
      embedded
      loading-screen="enabled: false"
      renderer="antialias: false; colorManagement: false; precision: mediump; powerPreference: high-performance"
      vr-mode-ui="enabled: false"
      background="color: #000000"
    >
      ${videoAssetHtml}

      <a-videosphere
        src="#${videoId}"
        rotation="0 -90 0"
        segments-width="32"
        segments-height="16"
      ></a-videosphere>

      <a-entity position="0 1.6 0">
        <a-camera ${cameraControls} wasd-controls-enabled="false">
          ${cursor}
        </a-camera>
      </a-entity>

      ${worldBackButtonHtml}
      ${quizHtml}
    </a-scene>
  `;
}

/**
 * Pasang event listener untuk video, opsi kuis, dan tombol kembali di root scene.
 * - Video: ended/error
 * - Quiz options: click, mouseenter, mouseleave
 * - World back button: click -> kembali ke pemilihan mode
 */
function bindSceneEvents(root) {
  const videos = [...root.querySelectorAll('.scenario-video')];

  videos.forEach((video) => {
    video.addEventListener('ended', handleVideoEnded);
    video.addEventListener('error', () => {
      console.warn('Video gagal dimuat:', video.getAttribute('src'));
    });
  });

  const options = root.querySelectorAll('.quiz-option');

  options.forEach((option) => {
    option.addEventListener('click', () => handleOption(option));

    option.addEventListener('mouseenter', () => {
      const bg = option.querySelector('.option-bg');

      if (bg) {
        bg.setAttribute('color', '#3f6f8d');
      }
    });

    option.addEventListener('mouseleave', () => {
      const bg = option.querySelector('.option-bg');

      if (bg && !option.dataset.selected) {
        bg.setAttribute('color', '#6f9fbd');
      }
    });
  });

  root.querySelectorAll('.world-back-button').forEach((button) => {
    button.addEventListener('click', backToModeSelection);
  });
}

/**
 * Handler ketika sebuah video skenario selesai diputar.
 * Menentukan langkah berikutnya berdasarkan `scenario.type`.
 */
function handleVideoEnded() {
  const currentScenario = getActiveScenario();

  if (!currentScenario) {
    return;
  }

  if (currentScenario.type === 'decision') {
    showQuiz();
    return;
  }

  if (currentScenario.type === 'consequence') {
    if (currentScenario.next && scenarioMap.has(currentScenario.next)) {
      activeScenarioId = currentScenario.next;
      renderActiveScenario();
      return;
    }

    if (currentScenario.returnTo && scenarioMap.has(currentScenario.returnTo)) {
      activeScenarioId = currentScenario.returnTo;
      shouldShowQuizImmediately = true;
      renderActiveScenario();
    }

    return;
  }

  if (currentScenario.type === 'linear') {
    if (currentScenario.next && scenarioMap.has(currentScenario.next)) {
      activeScenarioId = currentScenario.next;
      renderActiveScenario();
    }

    return;
  }

  if (currentScenario.type === 'end') {
    showQuiz();
  }
}

/** Coba play semua elemen video skenario; jika diblokir oleh browser, log peringatan. */
async function playActiveVideos() {
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

/** Tampilkan panel kuis untuk skenario aktif (jika ada pertanyaan dan opsi). */
function showQuiz() {
  const currentScenario = getActiveScenario();

  if (!currentScenario?.question || !Array.isArray(currentScenario.options)) {
    return;
  }

  isQuizVisible = true;

  document.querySelectorAll('.quiz-panel').forEach((panel) => {
    panel.setAttribute('visible', 'true');
  });
}

/** Reset status visual semua opsi kuis (hapus seleksi dan set warna default). */
function resetOptionStates() {
  document.querySelectorAll('.quiz-option').forEach((option) => {
    option.dataset.selected = '';

    const bg = option.querySelector('.option-bg');

    if (bg) {
      bg.setAttribute('color', '#6f9fbd');
    }
  });
}

/** Tampilkan pesan umpan balik di panel kuis (teks + warna). */
function setFeedback(message, color = '#fef08a') {
  document.querySelectorAll('.feedback-text').forEach((text) => {
    text.setAttribute('value', message);
    text.setAttribute('color', color);
  });
}

/** Beri warna pada opsi yang dipilih: hijau jika benar, merah jika salah. */
function colorSelectedOptions(index, correct) {
  document.querySelectorAll(`.quiz-option[data-option-index="${index}"]`).forEach((option) => {
    option.dataset.selected = 'true';

    const bg = option.querySelector('.option-bg');

    if (bg) {
      bg.setAttribute('color', correct ? '#16a34a' : '#dc2626');
    }
  });
}

/**
 * Tangani aksi ketika opsi kuis dipilih: tampilkan umpan balik, lalu navigasi ke skenario berikutnya
 * atau ke skenario konsekuensi sesuai properti `next` / `consequence` pada opsi.
 */
function handleOption(optionEntity) {
  const optionIndex = optionEntity.dataset.optionIndex;
  const correct = optionEntity.dataset.correct === 'true';
  const nextScenario = optionEntity.dataset.next;
  const consequenceScenario = optionEntity.dataset.consequence;

  resetOptionStates();
  colorSelectedOptions(optionIndex, correct);

  setFeedback(
    correct
      ? 'Jawaban benar. Lanjut ke tahap berikutnya.'
      : 'Jawaban salah. Tampilkan konsekuensi, lalu kembali ke pertanyaan.',
    correct ? '#bbf7d0' : '#fecaca'
  );

  window.setTimeout(() => {
    if (consequenceScenario && scenarioMap.has(consequenceScenario)) {
      activeScenarioId = consequenceScenario;
      renderActiveScenario();
      return;
    }

    if (correct && nextScenario && scenarioMap.has(nextScenario)) {
      activeScenarioId = nextScenario;
      renderActiveScenario();
      return;
    }
  }, 1200);
}

/** Cari elemen kursor gaze pertama di dalam root (atau dokumen). */
function findGazeCursor(root = document) {
  if (!root) return null;
  if (root.querySelector) {
    return root.querySelector('.gaze-cursor');
  }
  return null;
}

/** Kembalikan array semua elemen kursor gaze di dalam root. */
function findGazeCursors(root = document) {
  if (!root) return [];
  return Array.from(root.querySelectorAll('.gaze-cursor'));
}

/**
 * Trigger pemilihan opsi berdasarkan gaze cursor (digunakan oleh VR remote).
 * Mencari elemen yang sedang di-intersect oleh raycaster dan memicu `handleOption`.
 */
function triggerSelectFromGaze(event) {
  const cursors = findGazeCursors();

  if (!cursors.length) {
    console.warn('[VR Remote] Tidak ada gaze cursor ditemukan.');
    return;
  }

  for (const cursor of cursors) {
    if (!cursor.components || !cursor.components.raycaster) {
      continue;
    }

    const intersectedEls = cursor.components.raycaster.intersectedEls || [];
    console.log('[VR Remote] cursor', cursor, 'intersectedEls', intersectedEls.length);

    let target = intersectedEls[0];
    while (target && !target.classList.contains('quiz-option')) {
      target = target.parentElement;
    }

    if (target && target.classList.contains('quiz-option')) {
      console.log('[VR Remote] opsi ditemukan:', target.dataset.optionIndex, target.dataset.next, target.dataset.consequence);
      handleOption(target);
      return;
    }
  }

  console.warn('[VR Remote] Tidak menemukan opsi quiz di gaze cursor. Pastikan kursor mengarah ke .quiz-option.');
}

/**
 * Cari gamepad yang sudah terhubung dan set `gamepadIndex` ke index pertama yang ditemukan.
 * Dipanggil saat inisialisasi polling jika koneksi belum diketahui.
 */
function setGamepadIndexFromConnected() {
  const gamepads = navigator.getGamepads();
  for (let i = 0; i < gamepads.length; i += 1) {
    if (gamepads[i]) {
      gamepadIndex = i;
      console.log('[VR Remote] Gamepad ditemukan index', gamepadIndex);
      return;
    }
  }
  gamepadIndex = null;
}

window.addEventListener('gamepadconnected', (event) => {
  gamepadIndex = event.gamepad.index;
  console.log('[VR Remote] gamepadconnected', event.gamepad.index, event.gamepad.id);
});

window.addEventListener('gamepaddisconnected', (event) => {
  if (gamepadIndex === event.gamepad.index) {
    gamepadIndex = null;
    console.log('[VR Remote] gamepaddisconnected', event.gamepad.index);
    setGamepadIndexFromConnected();
  }
});

/**
 * Loop polling untuk membaca state gamepad. Jika tombol ditekan, trigger seleksi dari gaze.
 * Dipanggil sekali untuk memulai loop via requestAnimationFrame.
 */
function pollGamepad() {
  requestAnimationFrame(pollGamepad);

  if (gamepadIndex === null) {
    setGamepadIndexFromConnected();
    return;
  }

  const gamepads = navigator.getGamepads();
  const gp = gamepads[gamepadIndex];
  if (!gp) {
    gamepadIndex = null;
    return;
  }

  const pressed = gp.buttons.some((b) => b.pressed);

  if (pressed && !prevButtonPressed) {
    triggerSelectFromGaze();
  }

  prevButtonPressed = pressed;
}

/**
 * Buka mode pemutaran ('vr' atau 'mobile') untuk modul yang aktif.
 * Memastikan skenario tersedia, reset state, dan render skenario pertama.
 */
async function openMode(mode) {
  if (!activeModule || !scenarios.length) {
    alert('Pilih modul terlebih dahulu.');
    return;
  }

  activeMode = mode;
  activeScenarioId = scenarios[0]?.id ?? null;
  shouldShowQuizImmediately = false;

  clearScenes();
  showScreen(mode === 'vr' ? vrScreen : mobileScreen);
  await renderActiveScenario();
}

/** Kembali ke layar pemilihan mode (tetap di modul yang sama). */
function backToModeSelection() {
  activeMode = null;
  clearScenes();
  showScreen(modeScreen);
}

/** Kembali ke daftar modul (reset modul dan skenario aktif). */
function backToModules() {
  activeModule = null;
  scenarios = [];
  scenarioMap = new Map();
  activeScenarioId = null;
  activeMode = null;

  clearScenes();
  showScreen(homeScreen);
}
// DEBUGGING 
window.addEventListener('gamepadconnected', (e) => console.log('✅ GAMEPAD:', e.gamepad.id, e.gamepad.buttons.length, 'tombol'));
window.addEventListener('keydown', (e) => console.log('✅ KEYDOWN:', e.key, e.code));
window.addEventListener('click', (e) => {
  console.log('✅ CLICK pada:', e.target.tagName, e.target.id || e.target.className);
  if (activeMode === 'vr' && e.target?.tagName === 'CANVAS') {
    console.log('[VR Remote] click canvas diterima, triggerSelectFromGaze()');
    triggerSelectFromGaze(e);
  }
});
document.addEventListener('pointerdown', (e) => console.log('✅ POINTERDOWN:', e.pointerType, e.clientX, e.clientY));

document.getElementById('openVrMode')?.addEventListener('click', () => openMode('vr'));
document.getElementById('openMobileMode')?.addEventListener('click', () => openMode('mobile'));

document.getElementById('mobileQuizButton')?.addEventListener('click', showQuiz);
document.getElementById('vrQuizButton')?.addEventListener('click', showQuiz);

document.getElementById('backToModules')?.addEventListener('click', backToModules);

document.getElementById('backToHomeFromSettings')?.addEventListener('click', () => {
  activeModule = null;
  scenarios = [];
  scenarioMap = new Map();
  activeScenarioId = null;
  activeMode = null;

  clearScenes();
  showScreen(homeScreen);
});

document.getElementById('ipdSlider')?.addEventListener('input', (e) => {
  setCalibrationValues(Number(e.target.value), calibrationVShift);
});

document.getElementById('vShiftSlider')?.addEventListener('input', (e) => {
  setCalibrationValues(calibrationIpdOffset, Number(e.target.value));
});

document.getElementById('ipdSliderStandalone')?.addEventListener('input', (e) => {
  setCalibrationValues(Number(e.target.value), calibrationVShift);
});

document.getElementById('vShiftSliderStandalone')?.addEventListener('input', (e) => {
  setCalibrationValues(calibrationIpdOffset, Number(e.target.value));
});

document.getElementById('resetCalibrationButton')?.addEventListener('click', () => {
  setCalibrationValues(0, 0);
});

document.getElementById('openSettingsButton')?.addEventListener('click', () => {
  showScreen(settingsScreen);

  const ipdSliderStandalone = document.getElementById('ipdSliderStandalone');
  const vShiftSliderStandalone = document.getElementById('vShiftSliderStandalone');
  if (ipdSliderStandalone) ipdSliderStandalone.value = calibrationIpdOffset;
  if (vShiftSliderStandalone) vShiftSliderStandalone.value = calibrationVShift;

    applyCalibrationTarget('preview');
});

pollGamepad();

loadModules().catch((error) => {
  console.error(error);
  alert('Gagal membaca daftar modul. Cek public/content/modules.json');
});