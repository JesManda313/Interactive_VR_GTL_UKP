/**
 * scene-builders.js — pembangun string HTML A-Frame.
 * Dipakai mobile-player.html + vr-player.html (via scenario.js / navigation.js).
 */
import { safeText } from './utils.js';

/**
 * TRUE jika skenario memakai video flat (projection: flat): tampil sebagai
 * layar datar (fullscreen HP di mobile, layar bioskop di VR), BUKAN videosphere.
 * Tanpa projection (atau 360) dianggap 360.
 * Duplikasi logika isFlatScenario() dari scenario.js secara sengaja untuk
 * menghindari circular import (scenario.js mengimpor modul ini).
 */
export function isFlatVideo(scenario) {
  if (!scenario) return false;
  const projection = String(scenario.projection ?? scenario.videoType ?? '').toLowerCase();
  return projection === 'flat' || projection === '2d' || projection === 'rectilinear';
}

/**
 * Bangun HTML A-Frame untuk daftar opsi kuis.
 * Menghitung posisi, ukuran, dan atribut data untuk tiap opsi.
 */
export function buildOptionsHtml(options = [], variant = 'mobile') {
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
export function buildQuizPanelHtml(scenario, variant = 'mobile', quizZ = '-3.1') {
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
      position="0 3 ${quizZ}"
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
export function buildWorldBackButtonHtml() {
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
 * Bangun string HTML A-Frame untuk sebuah scene kalibrasi (mata kiri/kanan).
 */
export function buildCalibrationSceneHtml({ eye = 'left' } = {}) {
  const sceneId = `calibration-${eye}-scene`;
  const worldBackButtonHtml = buildWorldBackButtonHtml();

  return `
    <a-scene
      id="${sceneId}"
      embedded
      loading-screen="enabled: false"
      renderer="antialias: false; colorManagement: false; precision: mediump; powerPreference: high-performance"
      vr-mode-ui="enabled: false"
      background="color: #050b12"
    >
      <a-sky color="#040b12"></a-sky>
      <a-light type="ambient" color="#dfeaff" intensity="0.9"></a-light>
      <a-light type="directional" color="#dfeaff" intensity="0.8" position="0 3 2"></a-light>

      <a-entity position="0 1.6 0">
        <a-camera
          look-controls="touchEnabled: false; mouseEnabled: false; magicWindowTrackingEnabled: true"
          wasd-controls-enabled="false"
        >
          <a-cursor
            class="gaze-cursor"
            raycaster="objects: .clickable"
            fuse="false"
            geometry="primitive: ring; radiusInner: 0.012; radiusOuter: 0.022"
            material="color: #facc15; shader: flat"
            position="0 0 -1"
          ></a-cursor>
        </a-camera>
      </a-entity>

      <a-entity position="0 0 0">
        <a-ring
          radius="0.18"
          color="#facc15"
          opacity="0.9"
          material="shader: flat; side: double"
          position="0 0 1"
        ></a-ring>
        <a-plane
          width="0.02"
          height="0.26"
          color="#facc15"
          opacity="0.9"
          material="shader: flat"
          position="0 0 1.02"
        ></a-plane>
        <a-plane
          width="0.26"
          height="0.02"
          color="#facc15"
          opacity="0.9"
          material="shader: flat"
          position="0 0 1.02"
        ></a-plane>
      </a-entity>

      ${worldBackButtonHtml}
    </a-scene>
  `;
}

/**
 * Bangun string HTML A-Frame untuk sebuah scene (mobile atau VR eye).
 * Menyusun aset video, tampilan utama (videosphere 360 / layar bioskop flat
 * untuk Sony di VR / fullscreen HP di mobile), kamera, cursor, tombol
 * kembali, dan panel kuis.
 */
export function buildSceneHtml({ mode, eye = 'main', scenario }) {
  const isVr = mode === 'vr';

  // VR memakai 1 shared video.
  // Mobile memakai 1 video sendiri di dalam scene.
  const videoId = isVr ? 'sharedVrVideo' : `${mode}-video`;
  const sceneId = `${mode}-${eye}-scene`;

  // Quiz VR-flat dimajukan ke depan layar bioskop; VR-360 & mobile tidak berubah.
  const quizHtml = buildQuizPanelHtml(
    scenario,
    isVr ? 'vr' : 'mobile',
    isVr && isFlatVideo(scenario) ? '-2.45' : '-3.1',
  );
  const worldBackButtonHtml = buildWorldBackButtonHtml();

  const cameraControls = isVr
    ? 'look-controls="touchEnabled: false; mouseEnabled: false; magicWindowTrackingEnabled: true"'
    : 'look-controls="touchEnabled: true; mouseEnabled: true; magicWindowTrackingTrackingEnabled: false"';

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

  // VR + video flat (Sony) = layar bioskop datar 16:9 di ruang gelap.
  // VR + video 360 (insta360) = videosphere seperti dulu.
  const isFlat = isFlatVideo(scenario);

  const cinemaScreenHtml = `
    <a-sky color="#020304"></a-sky>
    <a-light type="ambient" color="#39424e" intensity="0.7"></a-light>

    <!-- bingkai layar -->
    <a-plane
      width="3.7"
      height="2.15"
      color="#101418"
      position="0 2.7 -1.2"
      material="shader: flat"
    ></a-plane>
    <!-- layar video 16:9 -->
    <a-video
      src="#${videoId}"
      width="3.4"
      height="1.9125"
      position="0 2.7 -1"
      material="shader: flat"
    ></a-video>
    <!-- garis aksen bawah layar -->
    <a-plane
      width="3.7"
      height="0.045"
      color="#78b7dc"
      position="0 0.65 -2.62"
      material="shader: flat"
    ></a-plane>
    <!-- cahaya redup kiri-kanan ala lorong bioskop -->
    <a-plane
      width="0.06"
      height="1.4"
      color="#1d3a4d"
      position="-2.6 1.4 -2.2"
      rotation="0 28 0"
      material="shader: flat"
    ></a-plane>
    <a-plane
      width="0.06"
      height="1.4"
      color="#1d3a4d"
      position="2.6 1.4 -2.2"
      rotation="0 -28 0"
      material="shader: flat"
    ></a-plane>
  `;

  const sphereViewHtml = `
    <a-videosphere
      src="#${videoId}"
      rotation="0 -90 0"
      segments-width="32"
      segments-height="16"
    ></a-videosphere>
  `;

  const mainSceneViewHtml = isVr && isFlat ? cinemaScreenHtml : sphereViewHtml;

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

      ${mainSceneViewHtml}

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
