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

const mobileScenarioTitle = document.getElementById('mobileScenarioTitle');
const vrScenarioTitle = document.getElementById('vrScenarioTitle');

let modules = [];
let activeModule = null;

let scenarios = [];
let scenarioMap = new Map();
let activeScenarioId = null;
let activeMode = null;

let isQuizVisible = false;
let shouldShowQuizImmediately = false;

let gamepadIndex = null;
let prevButtonPressed = false;

function safeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function showScreen(screen) {
  homeScreen.classList.add('hidden');
  settingsScreen.classList.add('hidden');
  modeScreen.classList.add('hidden');
  mobileScreen.classList.add('hidden');
  vrScreen.classList.add('hidden');

  screen.classList.remove('hidden');
}

function applyCalibrationToMounts(leftEl, rightEl) {
  if (leftEl) {
    leftEl.style.transform = `translate(${calibrationIpdOffset}px, ${calibrationVShift}px)`;
  }
  if (rightEl) {
    rightEl.style.transform = `translate(${-calibrationIpdOffset}px, ${calibrationVShift}px)`;
  }
}

function applyVrCalibration() {
  applyCalibrationToMounts(vrLeftMount, vrRightMount);
}

function applyPreviewCalibration() {
  const previewLeft = document.getElementById('previewLeftMount');
  const previewRight = document.getElementById('previewRightMount');
  applyCalibrationToMounts(previewLeft, previewRight);
}

function setCalibrationValues(ipd, vShift) {
  calibrationIpdOffset = ipd;
  calibrationVShift = vShift;
  localStorage.setItem(IPD_STORAGE_KEY, calibrationIpdOffset);
  localStorage.setItem(VSHIFT_STORAGE_KEY, calibrationVShift);

  applyVrCalibration();
  applyPreviewCalibration();

  const ipdSlider = document.getElementById('ipdSlider');
  const vShiftSlider = document.getElementById('vShiftSlider');
  const ipdSliderStandalone = document.getElementById('ipdSliderStandalone');
  const vShiftSliderStandalone = document.getElementById('vShiftSliderStandalone');

  if (ipdSlider) ipdSlider.value = calibrationIpdOffset;
  if (vShiftSlider) vShiftSlider.value = calibrationVShift;
  if (ipdSliderStandalone) ipdSliderStandalone.value = calibrationIpdOffset;
  if (vShiftSliderStandalone) vShiftSliderStandalone.value = calibrationVShift;
}

async function loadModules() {
  const response = await fetch(MODULES_URL);

  if (!response.ok) {
    throw new Error('Gagal membaca modules.json');
  }

  modules = await response.json();
  renderModuleList();
}

function renderModuleList() {
  if (!modules.length) {
    moduleList.innerHTML = '<p>Belum ada modul tersedia.</p>';
    return;
  }

  moduleList.innerHTML = modules
    .map((module) => {
      return `
        <button class="module-card" data-module-id="${safeText(module.id)}">
          <div class="module-card-content">
            <strong>${safeText(module.title)}</strong>
            <p>${safeText(module.subtitle ?? module.description ?? '')}</p>
            <small>
              ${safeText(module.totalSegments ?? '-')} segmen •
              ${safeText(module.totalDecisionPoints ?? '-')} decision point
            </small>
          </div>
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

async function loadScenarios(scenarioUrl) {
  const response = await fetch(scenarioUrl);

  if (!response.ok) {
    throw new Error('Gagal membaca scenarios.json modul.');
  }

  scenarios = await response.json();
  scenarioMap = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  activeScenarioId = scenarios[0]?.id ?? null;
}

function getActiveScenario() {
  return scenarioMap.get(activeScenarioId);
}

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

function pauseActiveVideos() {
  document.querySelectorAll('.scenario-video').forEach((video) => {
    try {
      video.pause();
    } catch (error) {
      console.warn('Pause video skipped:', error);
    }
  });
}

function clearScenes() {
  stopVideos();

  if (mobileMount) mobileMount.innerHTML = '';
  if (vrLeftMount) vrLeftMount.innerHTML = '';
  if (vrRightMount) vrRightMount.innerHTML = '';

  isQuizVisible = false;
}

function getFadeOverlay(mode) {
  if (mode === 'mobile') {
    return document.getElementById('mobileFadeOverlay');
  }

  if (mode === 'vr') {
    return [...document.querySelectorAll('.vr-fade-panel')];
  }

  return null;
}

function setFadeMessage(mode, message) {
  const overlays = getFadeOverlays(mode);

  overlays.forEach((overlay) => {
    const textEl = overlay.querySelector('.fade-message');
    if (textEl) textEl.textContent = message;
    overlay.classList.add('active');
  });
}

function clearFadeMessage(mode) {
  getFadeOverlays(mode).forEach((overlay) => {
    overlay.classList.remove('active');
    const textEl = overlay.querySelector('.fade-message');
    if (textEl) textEl.textContent = '';
  });
}

function getFadeOverlays(mode) {
  const overlay = getFadeOverlay(mode);
  if (!overlay) return [];
  return Array.isArray(overlay) ? overlay : [overlay];
}

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

function buildOptionsHtml(options = [], variant = 'mobile') {
  const count = options.length || 1;

  // Total lebar yang tersedia untuk baris opsi (di dalam panel)
  const availableWidth = variant === 'vr' ? 1.95 : 4.2;
  const gapX = variant === 'vr' ? 0.08 : 0.15;

  const optionWidth = (availableWidth - gapX * (count - 1)) / count;
  const optionHeight = variant === 'vr' ? 0.85 : 1.3;

  const totalRowWidth = optionWidth * count + gapX * (count - 1);
  const startX = -totalRowWidth / 2 + optionWidth / 2;

  const y = variant === 'vr' ? -0.35 : -0.4;
  const textScale = variant === 'vr' ? '0.55 0.55 0.55' : '0.65 0.65 0.65';
  const wrapCount = variant === 'vr' ? 14 : 16;

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
            color="#2563eb"
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

function buildQuizPanelHtml(scenario, variant = 'mobile') {
  if (!scenario.question || !Array.isArray(scenario.options)) {
    return '';
  }

  const panelWidth = variant === 'vr' ? '2.25' : '4.7';
  const panelHeight = variant === 'vr' ? '1.7' : '2.4';
  const questionWidth = variant === 'vr' ? '1.95' : '3.4';
  const questionY = variant === 'vr' ? '0.55' : '0.65';
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
        color="#111827"
        opacity="0.94"
        material="shader: flat"
      ></a-plane>

      <a-text
        value="${safeText(scenario.question)}"
        align="center"
        width="${questionWidth}"
        color="#ffffff"
        position="0 ${questionY} 0.03"
        wrap-count="28"
      ></a-text>

      ${options}

      <a-text
        class="feedback-text"
        value="Arahkan cursor ke jawaban."
        align="center"
        width="${questionWidth}"
        color="#fef08a"
        position="0 -0.75 0.03"
        wrap-count="28"
      ></a-text>
    </a-entity>
  `;
}

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
    applyVrCalibration();
  }

  if (activeMode === 'mobile') {
    if (!mobileMount) {
      console.error('Elemen #mobileSceneMount tidak ditemukan di index.html');
      return;
    }

    mobileScenarioTitle.textContent = scenario.title;

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

function buildSceneHtml({ mode, eye = 'main', scenario }) {
  const isVr = mode === 'vr';

  // VR memakai 1 shared video.
  // Mobile memakai 1 video sendiri di dalam scene.
  const videoId = isVr ? 'sharedVrVideo' : `${mode}-video`;
  const sceneId = `${mode}-${eye}-scene`;

  const quizHtml = buildQuizPanelHtml(scenario, isVr ? 'vr' : 'mobile');

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

      ${quizHtml}
    </a-scene>
  `;
}

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
        bg.setAttribute('color', '#1d4ed8');
      }
    });

    option.addEventListener('mouseleave', () => {
      const bg = option.querySelector('.option-bg');

      if (bg && !option.dataset.selected) {
        bg.setAttribute('color', '#2563eb');
      }
    });
  });
}

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

function resetOptionStates() {
  document.querySelectorAll('.quiz-option').forEach((option) => {
    option.dataset.selected = '';

    const bg = option.querySelector('.option-bg');

    if (bg) {
      bg.setAttribute('color', '#2563eb');
    }
  });
}

function setFeedback(message, color = '#fef08a') {
  document.querySelectorAll('.feedback-text').forEach((text) => {
    text.setAttribute('value', message);
    text.setAttribute('color', color);
  });
}

function colorSelectedOptions(index, correct) {
  document.querySelectorAll(`.quiz-option[data-option-index="${index}"]`).forEach((option) => {
    option.dataset.selected = 'true';

    const bg = option.querySelector('.option-bg');

    if (bg) {
      bg.setAttribute('color', correct ? '#16a34a' : '#dc2626');
    }
  });
}

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
    if (correct && nextScenario && scenarioMap.has(nextScenario)) {
      activeScenarioId = nextScenario;
      renderActiveScenario();
      return;
    }

    if (!correct && consequenceScenario && scenarioMap.has(consequenceScenario)) {
      activeScenarioId = consequenceScenario;
      renderActiveScenario();
      return;
    }
  }, 1200);
}

function findGazeCursor(root = document) {
  if (!root) return null;
  if (root.querySelector) {
    return root.querySelector('.gaze-cursor');
  }
  return null;
}

function findGazeCursors(root = document) {
  if (!root) return [];
  return Array.from(root.querySelectorAll('.gaze-cursor'));
}

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

function backToModeSelection() {
  activeMode = null;
  clearScenes();
  showScreen(modeScreen);
}

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

  applyPreviewCalibration();
});

document.getElementById('backToHomeFromSettings')?.addEventListener('click', () => {
  showScreen(homeScreen);
});

document.querySelectorAll('[data-action="back-mode"]').forEach((button) => {
  button.addEventListener('click', backToModeSelection);
});

pollGamepad();

loadModules().catch((error) => {
  console.error(error);
  alert('Gagal membaca daftar modul. Cek public/content/modules.json');
});