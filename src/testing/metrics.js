/**
 * metrics.js — mesin pengukuran response time & latency aplikasi.
 *
 * CATATAN METODOLOGI (penting untuk skripsi):
 * - Response time  = T1 - T0 : input diterima aplikasi -> respons selesai disiapkan.
 * - Latency aplikasi = T2 - T0 : input diterima -> callback requestAnimationFrame berikutnya.
 * - Nilai T2 adalah "frame dijadwalkan", BUKAN waktu gambar benar-benar tampil di layar.
 * - MTP (motion-to-photon) TIDAK diukur di sini. Butuh kamera kecepatan tinggi.
 * - Untuk pemutaran video, frame pertama diukur dengan requestVideoFrameCallback().
 *
 * File ini tidak melakukan apa pun kalau test mode belum diaktifkan.
 */
import { store } from '../js/store.js';
import { BUILD_VERSION } from '../js/version.js';

export const TEST_MODE_KEY = 'gtl_test_mode_v1';

const MAX_RECORDS = 5000;
const INTERACTION_TIMEOUT_MS = 3000;
const VIDEO_TIMEOUT_MS = 15000;
const TRANSITION_TIMEOUT_MS = 20000;

let enabled = false;
let session = null;
let records = [];
let trialCounter = 0;

let pending = null; // trial interaksi yang menunggu T1/T2
let pendingVideo = null; // trial video-start yang menunggu frame pertama
let pendingTransition = null; // trial perpindahan segmen

let lastInteraction = null;
let lastTransitionFrom = null;

let fps = 0;
let fpsFrames = 0;
let fpsLast = 0;
let fpsRaf = null;

const subscribers = new Set();

/* ------------------------------------------------------------------ */
/* Util                                                                */
/* ------------------------------------------------------------------ */

function now() {
  return performance.now();
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return '';
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function iso(timestamp = Date.now()) {
  return new Date(timestamp).toISOString();
}

/**
 * Event.timeStamp kadang berupa 0 / nilai aneh (mis. event sintetis A-Frame).
 * Kembalikan null kalau tidak masuk akal supaya pemanggil memakai performance.now().
 */
function normalizeEventTime(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const current = now();

  if (value > current + 1000 || current - value > 5000) {
    return null;
  }

  return value;
}

function median(sorted) {
  if (!sorted.length) {
    return null;
  }

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function percentile(sorted, p) {
  if (!sorted.length) {
    return null;
  }

  const index = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[index];
}

function stddev(values) {
  if (values.length < 2) {
    return 0;
  }

  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function stats(values) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);

  if (!clean.length) {
    return null;
  }

  return {
    n: clean.length,
    mean: clean.reduce((total, value) => total + value, 0) / clean.length,
    median: median(clean),
    p95: percentile(clean, 0.95),
    min: clean[0],
    max: clean[clean.length - 1],
    sd: stddev(clean),
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function pushRecord(record) {
  records.push(record);

  if (records.length > MAX_RECORDS) {
    records = records.slice(records.length - MAX_RECORDS);
  }
}

/* ------------------------------------------------------------------ */
/* Inisialisasi & FPS                                                  */
/* ------------------------------------------------------------------ */

export function isEnabled() {
  return enabled;
}

export function initMetrics() {
  if (enabled) {
    return;
  }

  enabled = true;
  session = {
    id: `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`,
    startedAt: Date.now(),
    build: BUILD_VERSION,
    userAgent: navigator.userAgent,
    screen: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
    dpr: window.devicePixelRatio || 1,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemory: navigator.deviceMemory || null,
  };

  startFpsSampler();
  exposeGlobal();

  console.info(
    '[GTL Test] Metrics aktif. Response time & latency aplikasi akan dicatat.\n'
    + 'Ekspor: __GTL_TEST__.csv() / __GTL_TEST__.download() / tombol Export CSV di HUD.',
  );
}

function startFpsSampler() {
  fpsLast = now();

  const loop = () => {
    if (!enabled) {
      return;
    }

    fpsFrames += 1;
    const current = now();
    const elapsed = current - fpsLast;

    if (elapsed >= 1000) {
      fps = (fpsFrames * 1000) / elapsed;
      fpsFrames = 0;
      fpsLast = current;
      emit();
    }

    fpsRaf = requestAnimationFrame(loop);
  };

  fpsRaf = requestAnimationFrame(loop);
}

/* ------------------------------------------------------------------ */
/* Notifikasi ke HUD                                                   */
/* ------------------------------------------------------------------ */

export function subscribe(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

function emit() {
  if (!subscribers.size) {
    return;
  }

  const state = getState();

  subscribers.forEach((listener) => {
    try {
      listener(state);
    } catch (error) {
      console.warn('[GTL Test] listener HUD error:', error);
    }
  });
}

export function getState() {
  return {
    enabled,
    session,
    records: records.slice(),
    lastInteraction,
    lastVideo: findLast('video-start'),
    lastTransition: findLast('transition'),
    pending: pending ? { ...pending } : null,
    pendingVideo: pendingVideo ? { ...pendingVideo } : null,
    pendingTransition: pendingTransition ? { ...pendingTransition } : null,
    fps: round(fps, 1),
    summary: summary(),
  };
}

function findLast(type) {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].type === type) {
      return records[index];
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Interaksi: input -> feedback (T0, T1, T2)                           */
/* ------------------------------------------------------------------ */

export function beginInteraction(source, { scenario = 'answer', t0 = null, extra = {} } = {}) {
  if (!enabled) {
    return;
  }

  // Jangan mulai trial baru kalau video-start baru saja dimulai
  // (mis. klik canvas dan klik gerbang START terjadi pada event yang sama).
  if (pendingVideo && now() - pendingVideo.t0 < 1000) {
    return;
  }

  // Guard duplikat: event capture + handler aplikasi bisa memanggil beginInteraction
  // dalam waktu sangat berdekatan untuk satu input yang sama.
  if (pending && now() - pending.t0 < 120) {
    return;
  }

  if (pending) {
    discardInteraction('diganti trial baru');
  }

  const eventTime = normalizeEventTime(t0);
  const start = eventTime ?? now();

  const trial = {
    id: ++trialCounter,
    type: 'interaction',
    scenario,
    source,
    mode: store.activeMode ?? 'unknown',
    moduleId: store.activeModule?.id ?? '',
    segmentId: store.activeScenarioId ?? '',
    t0: start,
    t1: null,
    t2: null,
    paintEstMs: null,
    createdAt: Date.now(),
    timestamp: iso(),
    fps: round(fps, 1),
    ...extra,
  };

  trial.timeout = window.setTimeout(() => {
    if (pending === trial) {
      discardInteraction('timeout (tidak ada feedback)');
    }
  }, INTERACTION_TIMEOUT_MS);

  pending = trial;
  emit();
}

function discardInteraction(reason) {
  if (!pending) {
    return;
  }

  window.clearTimeout(pending.timeout);
  console.warn('[GTL Test] trial interaksi dibatalkan:', reason, {
    source: pending.source,
    scenario: pending.scenario,
  });
  pending = null;
  emit();
}

/**
 * Dipanggil setelah handleOption selesai mengubah warna + feedback.
 * T1 = sekarang. T2 = callback requestAnimationFrame berikutnya.
 */
export function markFeedbackPrepared() {
  if (!enabled || !pending || pending.t1 !== null) {
    return;
  }

  const trial = pending;
  trial.t1 = now();
  window.clearTimeout(trial.timeout);

  requestAnimationFrame(() => {
    if (pending !== trial || trial.t1 === null) {
      return;
    }

    trial.t2 = now();

    const record = {
      ...trial,
      timestamp: iso(),
      responseMs: round(trial.t1 - trial.t0),
      latencyMs: round(trial.t2 - trial.t0),
      frameWaitMs: round(trial.t2 - trial.t1),
      fps: round(fps, 1),
    };

    delete record.timeout;

    pending = null;
    lastInteraction = record;
    pushRecord(record);
    emit();

    // Estimasi tambahan (bukan parameter utama): frame setelah paint berikutnya.
    requestAnimationFrame(() => {
      record.paintEstMs = round(now() - record.t0);
      emit();
    });
  });
}

/* ------------------------------------------------------------------ */
/* Video start: tombol START -> frame video pertama                    */
/* ------------------------------------------------------------------ */

export function beginVideoStart(event = null) {
  if (!enabled) {
    return;
  }

  if (pendingVideo && now() - pendingVideo.t0 < 1000) {
    return;
  }

  if (pendingVideo) {
    window.clearTimeout(pendingVideo.timeout);
    pendingVideo = null;
  }

  const eventTime = normalizeEventTime(event?.timeStamp);
  let start = eventTime ?? now();
  let source = (navigator.maxTouchPoints || 0) > 0 ? 'tap' : 'click';

  // Kalau baru saja ada input remote/keyboard/canvas, pakai T0 input itu
  // supaya latency video juga mencakup pemrosesan input.
  if (pending && now() - pending.t0 < 1000) {
    start = pending.t0;
    source = pending.source;
    window.clearTimeout(pending.timeout);
    pending = null;
  }

  const trial = {
    id: ++trialCounter,
    type: 'video-start',
    scenario: 'start-video',
    source,
    mode: store.activeMode ?? 'unknown',
    moduleId: store.activeModule?.id ?? '',
    segmentId: store.activeScenarioId ?? '',
    t0: start,
    t2: null,
    createdAt: Date.now(),
    timestamp: iso(),
    fps: round(fps, 1),
  };

  trial.timeout = window.setTimeout(() => {
    if (pendingVideo === trial) {
      discardVideo('timeout (frame video tidak datang)');
    }
  }, VIDEO_TIMEOUT_MS);

  pendingVideo = trial;
  attachActiveVideo();
  emit();
}

function discardVideo(reason) {
  if (!pendingVideo) {
    return;
  }

  window.clearTimeout(pendingVideo.timeout);
  console.warn('[GTL Test] trial video dibatalkan:', reason);
  pendingVideo = null;
  emit();
}

function attachActiveVideo() {
  const shared = document.getElementById('sharedVrVideo');

  if (shared) {
    attachVideo(shared);
    return;
  }

  const videos = [...document.querySelectorAll('video')];
  const active = videos.find((video) => video.getAttribute('src') && !video.paused) ?? videos[0];

  if (active) {
    attachVideo(active);
  }
}

/**
 * Pasang pengamat frame video. Dipanggil oleh instrument.js untuk semua
 * elemen <video> yang dibuat aplikasi. Idempoten.
 */
export function attachVideo(video) {
  if (!video || video.dataset.gtlTestHooked === '1') {
    return;
  }

  video.dataset.gtlTestHooked = '1';

  const onFrame = () => handleVideoFrame(video);

  if (typeof video.requestVideoFrameCallback === 'function') {
    const loop = () => {
      if (!video.isConnected) {
        return;
      }

      try {
        video.requestVideoFrameCallback(() => {
          onFrame();
          loop();
        });
      } catch {
        /* video dilepas / tidak mendukung -> berhenti */
      }
    };

    loop();
  }

  // Fallback untuk WebView yang tidak punya requestVideoFrameCallback.
  video.addEventListener('playing', onFrame);
}

function handleVideoFrame(video) {
  if (!enabled || !pendingVideo || pendingVideo.t2 !== null) {
    return;
  }

  if (!video.isConnected) {
    return;
  }

  if (pendingVideo.mode === 'vr' && video.id !== 'sharedVrVideo') {
    return;
  }

  if (pendingVideo.mode === 'mobile' && video.id === 'sharedVrVideo') {
    return;
  }

  // Frame dari video lama yang masih pause tidak boleh dihitung.
  if (video.paused) {
    return;
  }

  const trial = pendingVideo;
  trial.t2 = now();
  window.clearTimeout(trial.timeout);

  const record = {
    ...trial,
    timestamp: iso(),
    videoStartMs: round(trial.t2 - trial.t0),
    fps: round(fps, 1),
    notes: `readyState=${video.readyState}`,
  };

  delete record.timeout;

  pendingVideo = null;
  pushRecord(record);
  emit();
}

/* ------------------------------------------------------------------ */
/* Transisi segmen                                                     */
/* ------------------------------------------------------------------ */

/**
 * Dipanggil di awal renderActiveScenario(). T0 memakai T0 jawaban terakhir,
 * T1 = saat render segmen baru mulai. Jeda 1200 ms tetap tercatat terpisah.
 */
export function markRenderStart() {
  if (!enabled || !lastInteraction) {
    return;
  }

  const previous = lastInteraction;
  const age = now() - (previous.t2 ?? previous.t1 ?? previous.t0);

  if (age > 15000) {
    return;
  }

  if (previous.mode !== (store.activeMode ?? 'unknown')) {
    return;
  }

  if (previous.moduleId !== (store.activeModule?.id ?? '')) {
    return;
  }

  if (previous.segmentId === (store.activeScenarioId ?? '')) {
    return;
  }

  if (lastTransitionFrom === previous.id) {
    return;
  }

  lastTransitionFrom = previous.id;

  const t1 = now();
  const trial = {
    id: ++trialCounter,
    type: 'transition',
    scenario: 'next-segment',
    source: previous.source,
    mode: store.activeMode ?? 'unknown',
    moduleId: store.activeModule?.id ?? '',
    fromSegmentId: previous.segmentId,
    segmentId: store.activeScenarioId ?? '',
    t0: previous.t0,
    t1,
    t2: null,
    designDelayMs: round(t1 - (previous.t1 ?? previous.t0)),
    createdAt: Date.now(),
    timestamp: iso(),
    fps: round(fps, 1),
  };

  trial.timeout = window.setTimeout(() => {
    if (pendingTransition === trial) {
      discardTransition('timeout (render tidak selesai)');
    }
  }, TRANSITION_TIMEOUT_MS);

  pendingTransition = trial;
  emit();
}

/**
 * Dipanggil di akhir renderActiveScenario(): scene baru sudah terpasang.
 * transitionMs mencakup jeda desain 1200 ms; afterDesignMs tidak.
 */
export function markRenderReady() {
  if (!enabled || !pendingTransition) {
    return;
  }

  const trial = pendingTransition;
  trial.t2 = now();
  window.clearTimeout(trial.timeout);

  const record = {
    ...trial,
    timestamp: iso(),
    transitionMs: round(trial.t2 - trial.t0),
    afterDesignMs: round(trial.t2 - trial.t1),
    fps: round(fps, 1),
  };

  delete record.timeout;

  pendingTransition = null;
  pushRecord(record);
  emit();
}

function discardTransition(reason) {
  if (!pendingTransition) {
    return;
  }

  window.clearTimeout(pendingTransition.timeout);
  console.warn('[GTL Test] trial transisi dibatalkan:', reason);
  pendingTransition = null;
  emit();
}

/* ------------------------------------------------------------------ */
/* Ringkasan & ekspor                                                  */
/* ------------------------------------------------------------------ */

function metricKeys(type) {
  if (type === 'interaction') {
    return ['responseMs', 'latencyMs', 'frameWaitMs', 'paintEstMs'];
  }

  if (type === 'video-start') {
    return ['videoStartMs'];
  }

  if (type === 'transition') {
    return ['transitionMs', 'afterDesignMs', 'designDelayMs'];
  }

  return [];
}

export function summary() {
  const groups = new Map();

  records.forEach((record) => {
    const key = `${record.type}|${record.scenario}|${record.source}`;

    if (!groups.has(key)) {
      groups.set(key, {
        type: record.type,
        scenario: record.scenario,
        source: record.source,
        records: [],
      });
    }

    groups.get(key).records.push(record);
  });

  return [...groups.values()].map((group) => {
    const row = {
      group: `${group.type}|${group.scenario}|${group.source}`,
      type: group.type,
      scenario: group.scenario,
      source: group.source,
      n: group.records.length,
    };

    metricKeys(group.type).forEach((metric) => {
      const values = group.records.map((record) => record[metric]);
      const result = stats(values);

      if (!result) {
        return;
      }

      row[`${metric}_mean`] = round(result.mean);
      row[`${metric}_median`] = round(result.median);
      row[`${metric}_p95`] = round(result.p95);
      row[`${metric}_min`] = round(result.min);
      row[`${metric}_max`] = round(result.max);
      row[`${metric}_sd`] = round(result.sd);
    });

    return row;
  }).sort((a, b) => a.group.localeCompare(b.group));
}

const CSV_COLUMNS = [
  'session_id',
  'trial',
  'timestamp',
  'type',
  'scenario',
  'source',
  'mode',
  'module_id',
  'segment_id',
  'from_segment_id',
  'response_ms',
  'latency_ms',
  'frame_wait_ms',
  'paint_est_ms',
  'video_start_ms',
  'transition_ms',
  'after_design_ms',
  'design_delay_ms',
  'fps',
  'notes',
  'build_version',
  'user_agent',
  'screen',
  'dpr',
  'hardware_concurrency',
];

export function csv() {
  const rows = [CSV_COLUMNS.join(',')];

  records.forEach((record) => {
    const values = {
      session_id: session?.id ?? '',
      trial: record.id,
      timestamp: record.timestamp ?? iso(record.createdAt),
      type: record.type,
      scenario: record.scenario,
      source: record.source,
      mode: record.mode,
      module_id: record.moduleId,
      segment_id: record.segmentId,
      from_segment_id: record.fromSegmentId ?? '',
      response_ms: record.responseMs,
      latency_ms: record.latencyMs,
      frame_wait_ms: record.frameWaitMs,
      paint_est_ms: record.paintEstMs,
      video_start_ms: record.videoStartMs,
      transition_ms: record.transitionMs,
      after_design_ms: record.afterDesignMs,
      design_delay_ms: record.designDelayMs,
      fps: record.fps,
      notes: record.notes ?? '',
      build_version: session?.build ?? '',
      user_agent: session?.userAgent ?? '',
      screen: session?.screen ?? '',
      dpr: session?.dpr ?? '',
      hardware_concurrency: session?.hardwareConcurrency ?? '',
    };

    rows.push(CSV_COLUMNS.map((column) => csvEscape(values[column])).join(','));
  });

  return `\uFEFF${rows.join('\r\n')}`;
}

export function downloadCsv() {
  const filename = `gtl-test-${session?.id ?? 'session'}.csv`;
  const blob = new Blob([csv()], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return filename;
}

export async function copyCsv() {
  const text = csv();

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback di bawah */
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function reset() {
  if (pending) {
    window.clearTimeout(pending.timeout);
    pending = null;
  }

  if (pendingVideo) {
    window.clearTimeout(pendingVideo.timeout);
    pendingVideo = null;
  }

  if (pendingTransition) {
    window.clearTimeout(pendingTransition.timeout);
    pendingTransition = null;
  }

  records = [];
  trialCounter = 0;
  lastInteraction = null;
  lastTransitionFrom = null;

  if (session) {
    session.id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
    session.startedAt = Date.now();
  }

  console.info('[GTL Test] Data pengukuran direset.');
  emit();
}

function exposeGlobal() {
  window.__GTL_TEST__ = {
    state: getState,
    csv,
    summary,
    reset,
    download: downloadCsv,
    copy: copyCsv,
    enable: () => {
      try {
        localStorage.setItem(TEST_MODE_KEY, '1');
      } catch { /* abaikan */ }
      window.location.reload();
    },
    disable: () => {
      try {
        localStorage.removeItem(TEST_MODE_KEY);
      } catch { /* abaikan */ }
      window.location.reload();
    },
  };
}
