/**
 * download-manager.js — unduh paket video modul gaya PUBG (blokir sampai selesai).
 * Pilot: 1 file (segmen 3 via Google Drive API). Arsitektur siap multi-file:
 * tiap skenario boleh punya field `remote: { fileId, fileName, size, md5, version }`.
 *
 * Alur: downloadFile native per fileId unik (+mkdir induk) -> verifikasi ukuran ->
 *       scenario.video dimutasi ke URI lokal (convertFileSrc) agar seluruh
 *       engine playback (flat/VR/360) tidak perlu diubah.
 *       Web/dev memakai fallback fetch chunked (butuh host bercORS).
 */
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

 // TODO PILOT: kunci API key ke Android (package + SHA-1) setelah APK pilot teruji.
 // Kunci di bundle JS bisa diekstrak — restriksi adalah satu-satunya pagar.
const DRIVE_API_KEY = 'AIzaSyC3KEiGmCBxNzShaOhJCCh5M9yyhSkhOPw';

const STATE_KEY = 'gtl_downloads_v1';
const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB per chunk
const CHUNK_RETRIES = 3;

let cancelled = false;

export function cancelDownloads() {
  cancelled = true;
}

/** Baca/tulis status unduhan (synchronous, localStorage — berlaku di web & APK). */
function readState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Gagal menyimpan status unduhan:', error);
  }
}

/** Semua skenario modul aktif yang punya paket remote. */
export function listRemoteScenarios(scenarios) {
  return (scenarios ?? []).filter((s) => s?.remote?.fileId);
}

/**
 * Kelompokkan skenario remote per file Drive (unik per fileId).
 * Mencegah file yang sama diunduh berulang walau dipakai banyak segmen.
 * @returns {Array<{ remote: object, scenarios: object[] }>}
 */
export function uniqueRemotes(scenarios) {
  const map = new Map();
  for (const s of listRemoteScenarios(scenarios)) {
    const id = String(s.remote.fileId);
    if (!map.has(id)) map.set(id, { remote: s.remote, scenarios: [] });
    map.get(id).scenarios.push(s);
  }
  return [...map.values()];
}

/** Path lokal untuk satu file remote (di folder privat app). */
function localPathFor(remote) {
  const safeId = String(remote.fileId).replace(/[^A-Za-z0-9_-]/g, '');
  return `downloads/v1/${safeId}.mp4`;
}

function safeIdOf(fileId) {
  return String(fileId).replace(/[^A-Za-z0-9_-]/g, '');
}

/**
 * Hapus file + state yang fileId-nya tak lagi dirujuk manifest
 * (mis. file pilot yang dipensiunkan). Dipanggil saat buka modul.
 * @returns jumlah file yatim yang dihapus.
 */
export async function purgeOrphanDownloads(scenarios) {
  const referenced = new Set(uniqueRemotes(scenarios).map((g) => safeIdOf(g.remote.fileId)));
  let removed = 0;
  try {
    const listing = await Filesystem.readdir({ path: 'downloads/v1', directory: Directory.Data });
    for (const name of listing.files.map((f) => f.name)) {
      const m = /^([A-Za-z0-9_-]+)\.mp4$/.exec(name ?? '');
      if (m && !referenced.has(m[1])) {
        try {
          await Filesystem.deleteFile({ path: `downloads/v1/${name}`, directory: Directory.Data });
          removed += 1;
        } catch { /* abaikan per file */ }
      }
    }
  } catch { /* folder belum ada -> tidak ada yatim */ }

  const state = readState();
  let touched = false;
  for (const fileId of Object.keys(state)) {
    if (!referenced.has(safeIdOf(fileId))) {
      delete state[fileId];
      touched = true;
    }
  }
  if (touched) writeState(state);
  return removed;
}

/** Cek satu file remote: state versi cocok + stat ukuran cocok. */
async function isFileReady(remote) {
  const state = readState();
  const entry = state[remote.fileId];
  if (!entry || entry.version !== remote.version) return false;
  try {
    const stat = await Filesystem.stat({
      path: localPathFor(remote),
      directory: Directory.Data,
    });
    return Number(stat.size) === expectedStoredSize(Number(remote.size));
  } catch {
    return false;
  }
}

/**
 * Ukuran yang diharapkan di storage. Native menyimpan byte mentah;
 * implementasi web Filesystem menyimpan base64 (panjang = 4*ceil(n/3)).
 */
function expectedStoredSize(total) {
  if (Capacitor.getPlatform() === 'web') return Math.ceil(total / 3) * 4;
  return total;
}

/** Skenario remote yang BELUM lengkap di perangkat. */
export async function missingRemotes(scenarios) {
  const out = [];
  for (const { remote, scenarios: group } of uniqueRemotes(scenarios)) {
    if (!(await isFileReady(remote))) out.push(...group);
  }
  return out;
}

/** URI file lokal yang siap diputar WebView (<video> & videosphere). */
const blobUrlCache = new Map();

export async function localFileUri(remote) {
  // Web (dev/browser): file Filesystem tersimpan di IndexedDB — baca jadi blob URL.
  // Native (APK): file nyata di disk — convertFileSrc -> http://localhost/_capacitor_file_/...
  if (Capacitor.getPlatform() === 'web') {
    if (blobUrlCache.has(remote.fileId)) return blobUrlCache.get(remote.fileId);
    const { data } = await Filesystem.readFile({
      path: localPathFor(remote),
      directory: Directory.Data,
    });
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
    blobUrlCache.set(remote.fileId, url);
    return url;
  }
  const { uri } = await Filesystem.getUri({
    path: localPathFor(remote),
    directory: Directory.Data,
  });
  return Capacitor.convertFileSrc(uri);
}

/**
 * Mutasi scenario.video -> URI lokal untuk semua file yang sudah terunduh.
 * Satu file yang dipakai banyak segmen dipetakan ke semua segmennya sekaligus.
 * Dipanggil setelah loadScenarios dan setelah tiap unduhan selesai.
 */
export async function applyLocalVideos(scenarios) {
  for (const { remote, scenarios: group } of uniqueRemotes(scenarios)) {
    if (await isFileReady(remote)) {
      const uri = await localFileUri(remote);
      group.forEach((s) => {
        s.video = uri;
      });
    }
  }
}

/** Encode base64 streaming: sisa 1-2 byte dibawa ke chunk berikut agar
 *  padding '=' hanya muncul di paling akhir (hasil sambungan valid). */
function createStreamingBase64() {
  let carry = new Uint8Array(0);
  const SLICE = 0x8000;
  function encodeBytes(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += SLICE) {
      binary += String.fromCharCode(...bytes.subarray(i, i + SLICE));
    }
    return btoa(binary);
  }
  return {
    push(buffer, flush) {
      const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      const combined = new Uint8Array(carry.length + bytes.length);
      combined.set(carry);
      combined.set(bytes, carry.length);
      const cut = flush ? combined.length : combined.length - (combined.length % 3);
      const out = encodeBytes(combined.subarray(0, cut));
      carry = Uint8Array.from(combined.subarray(cut));
      return out;
    },
    reset() {
      carry = new Uint8Array(0);
    },
  };
}

function remoteUrl(fileId) {
  // acknowledgeAbuse: amankan unduhan file besar yang ditandai hasil scan Google.
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&acknowledgeAbuse=true&key=${DRIVE_API_KEY}`;
}

function formatMB(bytes) {
  return `${(Number(bytes) / 1048576).toFixed(1)} MB`;
}

/**
 * Unduh satu file remote.
 * - Native (APK): Filesystem.downloadFile — tanpa CORS, ikut redirect,
 *   progress real dari plugin. Inilah jalur produksi.
 * - Web (dev/browser): fetch chunked — untuk host bercORS saja; Drive
 *   diblokir CORS di browser (terbukti saat uji), jadi di web akan
 *   menampilkan error yang jelas, bukan hang.
 */
async function downloadOne(remote, onProgress) {
  const path = localPathFor(remote);
  const total = Number(remote.size);
  onProgress?.({ loaded: 0, total });

  if (Capacitor.getPlatform() === 'web') {
    await downloadOneWebFetch(remote, onProgress);
  } else {
    // WAJIB: downloadFile native TIDAK membuat folder induk (recursive diabaikan).
    // Tanpa mkdir ini -> FileNotFoundException "open failed: ENOENT" di HP.
    try {
      await Filesystem.mkdir({
        path: 'downloads/v1',
        directory: Directory.Data,
        recursive: true,
      });
    } catch (error) {
      // Abaikan 'sudah ada'; lanjutkan — kegagalan nyata ketahuan saat stat.
      if (!String(error?.message ?? '').toLowerCase().includes('exist')) {
        console.warn('mkdir unduhan:', error?.message ?? error);
      }
    }
    try {
      await Filesystem.deleteFile({ path, directory: Directory.Data });
    } catch { /* belum ada -> abaikan */ }

    const url = remoteUrl(remote.fileId);
    const listener = await Filesystem.addListener('progress', (event) => {
      if (event?.url === url) {
        onProgress?.({
          loaded: Number(event.bytes) || 0,
          total: Number(event.contentLength) || total,
        });
      }
    });
    try {
      await Filesystem.downloadFile({
        url,
        path,
        directory: Directory.Data,
        recursive: true,
        progress: true,
      });
    } catch (error) {
      throw new Error(`Unduhan native gagal: ${error?.message ?? error}`);
    } finally {
      try {
        await listener.remove();
      } catch { /* abaikan */ }
    }
  }

  // Verifikasi ukuran akhir (sadar-platform: web menyimpan base64).
  const stat = await Filesystem.stat({ path, directory: Directory.Data });
  if (Number(stat.size) !== expectedStoredSize(total)) {
    throw new Error(`Ukuran tidak cocok (${formatMB(stat.size)} vs ${formatMB(total)}). Coba lagi.`);
  }

  const state = readState();
  state[remote.fileId] = { version: remote.version, size: total, at: Date.now() };
  writeState(state);
}

/** Fallback web/dev: fetch per chunk (butuh server bercORS). Selalu mulai
 *  dari nol agar sambungan base64 streaming valid (tanpa resume antar-sesi). */
async function downloadOneWebFetch(remote, onProgress) {
  const path = localPathFor(remote);
  const total = Number(remote.size);
  const encoder = createStreamingBase64();

  try {
    await Filesystem.deleteFile({ path, directory: Directory.Data });
  } catch { /* belum ada -> abaikan */ }

  let loaded = 0;
  let firstChunk = true;
  onProgress?.({ loaded, total });

  while (loaded < total) {
    if (cancelled) throw new Error('dibatalkan');
    const end = Math.min(loaded + CHUNK_SIZE - 1, total - 1);

    let lastError = null;
    for (let attempt = 1; attempt <= CHUNK_RETRIES; attempt += 1) {
      try {
        const response = await fetch(remoteUrl(remote.fileId), {
          headers: { Range: `bytes=${loaded}-${end}` },
        });
        if (response.status === 403 || response.status === 404) {
          const text = await response.text().catch(() => '');
          throw new Error(`Drive menolak (${response.status}). Kuota habis / kunci / sharing bermasalah. ${text.slice(0, 120)}`);
        }
        if (response.status !== 206 && !(loaded === 0 && response.status === 200)) {
          throw new Error(`Respons tak terduga: HTTP ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        if (!buffer.byteLength) throw new Error('Chunk kosong, coba lagi.');
        const want = end - loaded + 1;
        if (response.status === 200) {
          // Server mengabaikan Range dan mengirim file utuh: tulis ulang dari nol.
          encoder.reset();
          const base64 = encoder.push(buffer, true);
          await Filesystem.writeFile({
            path,
            data: base64,
            directory: Directory.Data,
            recursive: true,
          });
          loaded = buffer.byteLength;
          firstChunk = false;
        } else {
          if (buffer.byteLength > want) {
            // Server mengirim melebihi porsi: buang & mulai ulang file ini.
            encoder.reset();
            try {
              await Filesystem.deleteFile({ path, directory: Directory.Data });
            } catch { /* abaikan */ }
            throw new Error('Server mengirim melebihi porsi. Tekan "Coba lagi".');
          }
          const base64 = encoder.push(buffer, false);
          if (firstChunk) {
            await Filesystem.writeFile({
              path,
              data: base64,
              directory: Directory.Data,
              recursive: true,
            });
            firstChunk = false;
          } else if (base64) {
            await Filesystem.appendFile({ path, data: base64, directory: Directory.Data });
          }
          loaded += buffer.byteLength;
        }
        onProgress?.({ loaded, total });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (String(error?.message ?? '').startsWith('Drive menolak') || String(error?.message) === 'dibatalkan') throw error;
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
    }
    if (lastError) throw lastError;
  }

  // Tulis sisa carry (<3 byte) + verifikasi ukuran storage (sadar-platform).
  const tail = encoder.push(new Uint8Array(0), true);
  if (tail) {
    await Filesystem.appendFile({ path, data: tail, directory: Directory.Data });
  }
  const stat = await Filesystem.stat({ path, directory: Directory.Data });
  if (Number(stat.size) !== expectedStoredSize(total)) {
    throw new Error(`Ukuran tidak cocok (${formatMB(stat.size)} vs ${formatMB(total)}). Hapus dan coba lagi.`);
  }

  const state = readState();
  state[remote.fileId] = { version: remote.version, size: total, at: Date.now() };
  writeState(state);
}

/**
 * Unduh semua file unik yang kurang, berurutan — satu fileId hanya sekali
 * walau dipakai banyak segmen. Callback UI:
 * onFile({ scenario, remote, fileIndex, fileCount }) & onProgress({ loaded, total, scenario }).
 */
export async function downloadMissing(scenarios, { onFile, onProgress } = {}) {
  cancelled = false;
  const groups = uniqueRemotes(scenarios);
  const missing = [];
  for (const g of groups) {
    if (!(await isFileReady(g.remote))) missing.push(g);
  }
  for (let i = 0; i < missing.length; i += 1) {
    if (cancelled) throw new Error('dibatalkan');
    const { remote, scenarios: group } = missing[i];
    const scenario = group[0];
    onFile?.({ scenario, remote, fileIndex: i, fileCount: missing.length });
    await downloadOne(remote, (p) => onProgress?.({ ...p, scenario }));
    const uri = await localFileUri(remote);
    group.forEach((s) => {
      s.video = uri;
    });
  }
  return missing.length;
}

/** Ambil elemen UI layar download (dipanggil tiap run agar tidak basi). */
function downloadUi() {
  const get = (id) => document.getElementById(id);
  return {
    title: get('downloadTitle'),
    desc: get('downloadDesc'),
    fileInfo: get('downloadFileInfo'),
    fill: get('downloadFill'),
    percent: get('downloadPercent'),
    status: get('downloadStatus'),
    retry: get('downloadRetry'),
    back: get('downloadBack'),
  };
}

function renderProgress(ui, loaded, total) {
  const pct = total > 0 ? Math.min(100, (loaded / total) * 100) : 0;
  if (ui.fill) ui.fill.style.width = `${pct.toFixed(1)}%`;
  if (ui.percent) ui.percent.textContent = `${pct.toFixed(0)}%`;
  if (ui.status) ui.status.textContent = `${formatMB(loaded)} / ${formatMB(total)}`;
}

/**
 * Jalankan alur download blocking untuk modul aktif.
 * onDone: dipanggil saat semua file lengkap -> lanjut ke pilih mode.
 * onBack: tombol kembali (batalkan unduhan + kembali ke daftar modul).
 */
export async function runDownloadFlow(scenarios, { onDone, onBack } = {}) {
  const ui = downloadUi();
  if (ui.retry) ui.retry.classList.add('hidden');
  if (ui.back) {
    ui.back.onclick = () => {
      cancelDownloads();
      onBack?.();
    };
  }

  try {
    const count = await downloadMissing(scenarios, {
      onFile: ({ scenario, fileIndex, fileCount }) => {
        if (ui.title) ui.title.textContent = `Mengunduh: ${scenario.title ?? scenario.remote.fileName}`;
        if (ui.fileInfo) ui.fileInfo.textContent = `File ${fileIndex + 1}/${fileCount} • ${formatMB(scenario.remote.size)}`;
        if (ui.retry) ui.retry.classList.add('hidden');
      },
      onProgress: ({ loaded, total }) => renderProgress(ui, loaded, total),
    });
    if (count === 0) {
      onDone?.();
      return;
    }
    if (ui.status) ui.status.textContent = 'Unduhan selesai. Membuka modul…';
    window.setTimeout(() => onDone?.(), 600);
  } catch (error) {
    if (String(error?.message) === 'dibatalkan') return;
    console.warn('Unduhan gagal:', error);
    if (ui.status) ui.status.textContent = `Gagal: ${error?.message ?? error}`;
    if (ui.retry) {
      ui.retry.classList.remove('hidden');
      ui.retry.onclick = () => runDownloadFlow(scenarios, { onDone, onBack });
    }
  }
}

export { formatMB };
