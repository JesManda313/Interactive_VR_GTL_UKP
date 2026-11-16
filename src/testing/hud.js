/**
 * hud.js — panel kecil untuk memantau hasil pengukuran saat test mode aktif.
 * Dimuat dinamis oleh instrument.js, jadi tidak ikut bundle utama.
 */
import './testing.css';
import {
  copyCsv,
  downloadCsv,
  getState,
  reset,
  subscribe,
} from './metrics.js';

let host = null;
let toastTimer = null;

const ROLE = {
  meta: 'meta',
  response: 'response',
  latency: 'latency',
  frame: 'frame',
  fps: 'fps',
  last: 'last',
  summary: 'summary',
  toggle: 'toggle',
};

function formatMs(value) {
  if (!Number.isFinite(value)) {
    return '–';
  }

  if (value >= 10000) {
    return `${(value / 1000).toFixed(1)} s`;
  }

  return `${value.toFixed(1)} ms`;
}

function shortSegment(value) {
  if (!value) {
    return '';
  }

  return String(value).replace(/^segmen_/, '').slice(0, 18);
}

function percentile(sorted, p) {
  if (!sorted.length) {
    return null;
  }

  const index = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[index];
}

export function initHud() {
  if (host) {
    return;
  }

  host = document.createElement('div');
  host.id = 'gtlTestHud';
  host.className = 'gtl-test-hud';
  host.innerHTML = `
    <div class="gtl-test-head">
      <span class="gtl-test-title">TEST MODE</span>
      <span class="gtl-test-meta" data-role="meta">menunggu</span>
      <button type="button" class="gtl-test-icon" data-action="toggle" title="Sembunyikan/tampilkan (Ctrl+Shift+H)">–</button>
    </div>
    <div class="gtl-test-body">
      <div class="gtl-test-grid">
        <span>Response</span><b data-role="response">–</b>
        <span>Latency</span><b data-role="latency">–</b>
        <span>Frame wait</span><b data-role="frame">–</b>
        <span>FPS</span><b data-role="fps">–</b>
      </div>
      <div class="gtl-test-last" data-role="last">—</div>
      <div class="gtl-test-sum" data-role="summary">Belum ada data.</div>
      <div class="gtl-test-actions">
        <button type="button" data-action="export">Export CSV</button>
        <button type="button" data-action="copy">Copy</button>
        <button type="button" data-action="reset">Reset</button>
      </div>
    </div>
  `;

  document.body.appendChild(host);

  const toggle = () => {
    host.classList.toggle('collapsed');
    const button = host.querySelector('[data-action="toggle"]');
    const collapsed = host.classList.contains('collapsed');

    if (button) {
      button.textContent = collapsed ? '+' : '–';
      button.title = collapsed ? 'Tampilkan (Ctrl+Shift+H)' : 'Sembunyikan (Ctrl+Shift+H)';
    }
  };

  const exportCsv = () => {
    try {
      const filename = downloadCsv();
      toast(`CSV diunduh: ${filename}`);
    } catch (error) {
      console.warn('[GTL Test] export gagal:', error);
      toast('Gagal mengunduh CSV — coba tombol Copy.');
    }
  };

  const copy = async () => {
    const ok = await copyCsv();
    toast(ok ? 'CSV disalin ke clipboard.' : 'Gagal menyalin. Buka console lalu jalankan __GTL_TEST__.csv().');
  };

  host.addEventListener('click', (event) => {
    const action = event.target.closest?.('[data-action]')?.dataset.action;

    if (action === 'toggle') {
      toggle();
      return;
    }

    if (action === 'export') {
      exportCsv();
      return;
    }

    if (action === 'copy') {
      copy();
      return;
    }

    if (action === 'reset') {
      reset();
      toast('Data pengukuran direset.');
    }
  });

  window.addEventListener('keydown', (event) => {
    if (!event.ctrlKey || !event.shiftKey) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === 'h') {
      event.preventDefault();
      toggle();
    }

    if (key === 'e') {
      event.preventDefault();
      exportCsv();
    }
  });

  subscribe(render);
  render(getState());
}

function render(state) {
  if (!host) {
    return;
  }

  const role = (name) => host.querySelector(`[data-role="${name}"]`);
  const interaction = state.lastInteraction;
  const pending = state.pending;

  const meta = [];
  const mode = interaction?.mode ?? pending?.mode;

  if (mode && mode !== 'unknown') {
    meta.push(String(mode).toUpperCase());
  }

  const segment = shortSegment(interaction?.segmentId ?? pending?.segmentId);

  if (segment) {
    meta.push(segment);
  }

  if (interaction?.source ?? pending?.source) {
    meta.push(interaction?.source ?? pending?.source);
  }

  const metaEl = role(ROLE.meta);

  if (metaEl) {
    metaEl.textContent = meta.join(' · ') || 'menunggu';
  }

  const responseEl = role(ROLE.response);
  const latencyEl = role(ROLE.latency);
  const frameEl = role(ROLE.frame);

  if (responseEl) {
    responseEl.textContent = interaction
      ? formatMs(interaction.responseMs)
      : (pending ? '…' : '–');
  }

  if (latencyEl) {
    latencyEl.textContent = interaction
      ? formatMs(interaction.latencyMs)
      : (pending ? '…' : '–');
  }

  if (frameEl) {
    frameEl.textContent = interaction ? formatMs(interaction.frameWaitMs) : '–';
  }

  const fpsEl = role(ROLE.fps);

  if (fpsEl) {
    fpsEl.textContent = state.fps ? `${state.fps} fps` : '–';
  }

  const interactions = state.records.filter((record) => record.type === 'interaction');
  const latencies = interactions
    .map((record) => record.latencyMs)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const summaryEl = role(ROLE.summary);

  if (summaryEl) {
    if (latencies.length) {
      const median = percentile(latencies, 0.5);
      const p95 = percentile(latencies, 0.95);
      summaryEl.textContent = `n=${interactions.length} · median ${formatMs(median)} · p95 ${formatMs(p95)}`;
    } else {
      summaryEl.textContent = 'Belum ada data interaksi.';
    }
  }

  const detail = [];

  if (state.lastVideo) {
    detail.push(`video ${formatMs(state.lastVideo.videoStartMs)}`);
  }

  if (state.lastTransition) {
    detail.push(
      `transisi ${formatMs(state.lastTransition.transitionMs)}`
      + ` (desain ${formatMs(state.lastTransition.designDelayMs)})`,
    );
  }

  const lastEl = role(ROLE.last);

  if (lastEl) {
    lastEl.textContent = detail.join(' · ') || '—';
  }
}

function toast(message) {
  let element = document.getElementById('gtlTestToast');

  if (!element) {
    element = document.createElement('div');
    element.id = 'gtlTestToast';
    element.className = 'gtl-test-toast';
    document.body.appendChild(element);
  }

  element.textContent = message;
  element.classList.add('show');

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    element.classList.remove('show');
  }, 2600);
}
