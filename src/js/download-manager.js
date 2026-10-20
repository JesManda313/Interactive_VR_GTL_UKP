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
import { showToast } from './utils.js';

 // TODO PILOT: kunci API key ke Android (package + SHA-1) setelah APK pilot teruji.
 // Kunci di bundle JS bisa diekstrak — restriksi adalah satu-satunya pagar.
const DRIVE_API_KEY = 'AIzaSyC3KEiGmCBxNzShaOhJCCh5M9yyhSkhOPw';

const STATE_KEY = 'gtl_downloads_v1';
const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB per chunk
const CHUNK_RETRIES = 3;

// cancelled: flag global pembatalan unduhan.
// UNTUK APA? Saat user tekan Kembali di layar download, cancelDownloads() set true,
// lalu loop downloadMissing()/downloadOneWebFetch() cek flag tiap file/chunk dan berhenti.
// KENAPA flag (bukan abort)? Download native Capacitor tidak support abort mid-file,
// jadi berhentinya di batas aman (antar file/chunk) agar file tidak setengah rusak.
let cancelled = false;

export function cancelDownloads() {
  cancelled = true;
}

/** Baca/tulis status unduhan (synchronous, localStorage — berlaku di web & APK). */
function readState() {
  // UNTUK APA? Membaca status unduhan (versi/ukuran per fileId) dari localStorage.
  // KENAPA? Agar tahu file mana yang sudah lengkap tanpa cek disk tiap saat; try-catch agar data rusak tidak crash.
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeState(state) {
  // UNTUK APA? Menyimpan status unduhan ke localStorage setelah unduh/hapus yatim.
  // KENAPA? localStorage bisa penuh/diblokir, jadi dibungkus try-catch agar gagal simpan hanya warning, bukan crash.
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Gagal menyimpan status unduhan:', error);
  }
}

/** Semua skenario modul aktif yang punya paket remote (perlu diunduh).
 * UNTUK APA? Filter scenarios.json hanya yang ada field remote.fileId.
 * KENAPA? Tidak semua segmen berupa file besar Drive; yang lokal/streaming tidak perlu masuk antre unduh. */
export function listRemoteScenarios(scenarios) {
  return (scenarios ?? []).filter((s) => s?.remote?.fileId);
}

/**
 * Kelompokkan skenario remote per file Drive (unik per fileId).
 * Mencegah file yang sama diunduh berulang walau dipakai banyak segmen.
 * @returns {Array<{ remote: object, scenarios: object[] }>}
 */
export function uniqueRemotes(scenarios) {
  // UNTUK APA? Mengelompokkan skenario per fileId Drive unik agar satu file hanya diunduh sekali.
  // KENAPA? Banyak segmen bisa pakai file sama; Map mencegah unduh berulang yang boros kuota dan waktu.
  const map = new Map();
  for (const s of listRemoteScenarios(scenarios)) {
    const id = String(s.remote.fileId);
    if (!map.has(id)) map.set(id, { remote: s.remote, scenarios: [] });
    map.get(id).scenarios.push(s);
  }
  return [...map.values()];
}

/** Path lokal untuk satu file remote (di folder privat app). Ekstensi
 *  diambil dari fileName (video .mp4, gambar .jpg/.png) agar <img>/<video>
 *  mengenali tipe berkas. */
function localPathFor(remote) {
  // UNTUK APA? Menentukan path lokal downloads/v1/<fileId>.<ext> untuk satu file remote.
  // KENAPA? fileId disanitasi agar aman jadi nama file; ekstensi dari fileName agar video/img dikenali player.
  const safeId = String(remote.fileId).replace(/[^A-Za-z0-9_-]/g, '');
  const extMatch = /\.([A-Za-z0-9]+)$/.exec(String(remote.fileName ?? ''));
  const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : '.mp4';
  return `downloads/v1/${safeId}${ext}`;
}

/**
 * Kumpulkan imageRemote unik dari semua overlay — baik model lama
 * (imageRemote di overlay) maupun model baru (images[] per overlay).
 * @returns {Array<{ remote: object, overlays: object[], scenario: object }>}
 */
export function collectImageRemotes(scenarios) {
  // UNTUK APA? Mengumpulkan semua imageRemote unik dari overlay (model lama imageRemote maupun baru images[]).
  // KENAPA? Gambar overlay tersebar di banyak overlay; didedup per fileId agar tiap gambar hanya diunduh sekali.
  const map = new Map();
  const push = (remote, o, s) => {
    if (!remote?.fileId) return;
    const id = String(remote.fileId);
    if (!map.has(id)) map.set(id, { remote, overlays: [], scenario: s });
    if (!map.get(id).overlays.includes(o)) map.get(id).overlays.push(o);
  };
  for (const s of scenarios ?? []) {
    for (const o of s?.overlays ?? []) {
      if (o?.imageRemote) push(o.imageRemote, o, s);
      if (Array.isArray(o?.images)) {
        for (const im of o.images) push(im?.imageRemote, o, s);
      }
    }
  }
  return [...map.values()];
}

/** Isi URI lokal ke overlay (model lama) dan/atau entri images[] yang cocok. */
function assignImageUri(overlay, remote, uri) {
  // UNTUK APA? Mengisi URI lokal ke overlay yang cocok (localImage / images[].localImage) untuk satu fileId.
  // KENAPA? Satu file gambar bisa dipakai banyak slot; pencocokan per fileId memastikan semua pemakai ter-update.
  const fid = String(remote.fileId);
  if (overlay?.imageRemote && String(overlay.imageRemote.fileId) === fid) {
    overlay.localImage = uri;
  }
  if (Array.isArray(overlay?.images)) {
    for (const im of overlay.images) {
      if (im?.imageRemote && String(im.imageRemote.fileId) === fid) {
        im.localImage = uri;
      }
    }
  }
}

/** TRUE bila semua slot gambar overlay sudah ter-resolve ke URI lokal. */
export function overlayImagesResolved(o) {
  // UNTUK APA? Mengecek apakah semua slot gambar overlay sudah punya URI lokal.
  // KENAPA? Dipakai sebagai guard sebelum render; jika ada slot belum resolve, overlay belum boleh ditampilkan.
  if (o?.imageRemote?.fileId && !o.localImage) return false;
  if (Array.isArray(o?.images)) {
    for (const im of o.images) {
      if (im?.imageRemote?.fileId && !im.localImage) return false;
    }
  }
  return true;
}

/** Resolve URI lokal ke semua overlay gambar yang filenya sudah terunduh. */
export async function applyImageUris(scenarios) {
  // UNTUK APA? Mengisi ulang URI lokal ke semua overlay yang file gambarnya sudah ada di disk.
  // KENAPA? Dipanggil setelah load dan setelah unduh agar gambar langsung tampil tanpa unduh ulang.
  for (const { remote, overlays } of collectImageRemotes(scenarios)) {
    if (await isFileReady(remote)) {
      const uri = await localImageDataUrl(remote);
      overlays.forEach((o) => {
        assignImageUri(o, remote, uri);
      });
    }
  }
}

function safeIdOf(fileId) {
  // UNTUK APA? Menyamarkan fileId jadi aman untuk nama file (hanya huruf/angka/_/-).
  // KENAPA? Mencegah path traversal dan karakter ilegal; dipakai konsisten oleh localPathFor dan purge.
  return String(fileId).replace(/[^A-Za-z0-9_-]/g, '');
}

/**
 * Hapus file + state yang fileId-nya tak lagi dirujuk manifest
 * (mis. file pilot yang dipensiunkan). Dipanggil saat buka modul.
 * @returns jumlah file yatim yang dihapus.
 */
export async function purgeOrphanDownloads(scenarios) {
  // UNTUK APA? Menghapus file dan state yang fileId-nya sudah tidak dirujuk manifest.
  // KENAPA? Manifest bisa berubah (file pensiun); tanpa purge, storage penuh oleh file yatim yang tak terpakai.
  const referenced = new Set(uniqueRemotes(scenarios).map((g) => safeIdOf(g.remote.fileId)));
  collectImageRemotes(scenarios).forEach((g) => referenced.add(safeIdOf(g.remote.fileId)));
  let removed = 0;
  try {
    const listing = await Filesystem.readdir({ path: 'downloads/v1', directory: Directory.Data });
    for (const name of listing.files.map((f) => f.name)) {
      const m = /^([A-Za-z0-9_-]+)\.[A-Za-z0-9]+$/.exec(name ?? '');
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
  // UNTUK APA? Mengecek satu file remote: versi state cocok dan ukuran di disk cocok.
  // KENAPA? Hanya versi+ukuran yang menjamin file lengkap dan up-to-date; gagal stat berarti belum diunduh.
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
  // UNTUK APA? Menghitung ukuran yang diharapkan di storage (sadar platform web vs native).
  // KENAPA? Web menyimpan base64 (4*ceil(n/3)) sedangkan native byte mentah; tanpa ini verifikasi selalu gagal di web.
  if (Capacitor.getPlatform() === 'web') return Math.ceil(total / 3) * 4;
  return total;
}

/** Skenario remote yang BELUM lengkap di perangkat. */
export async function missingRemotes(scenarios) {
  // UNTUK APA? Mengembalikan daftar skenario remote yang filenya belum lengkap di perangkat.
  // KENAPA? Dipakai untuk memutuskan apakah layar download blocking perlu tampil dan apa saja yang diunduh.
  const out = [];
  for (const { remote, scenarios: group } of uniqueRemotes(scenarios)) {
    if (!(await isFileReady(remote))) out.push(...group);
  }
  return out;
}

/** URI file lokal yang siap diputar WebView (<video> & videosphere). */
const blobUrlCache = new Map();

export async function localFileUri(remote, mime = 'video/mp4') {
  // UNTUK APA? Membuat URI video lokal yang siap diputar <video>/videosphere (blob URL di web, file URL native).
  // KENAPA? Web simpan di IndexedDB (harus dibaca jadi blob) sedangkan native file nyata; cache mencegah blob ganda.
  // Web (dev/browser): file Filesystem tersimpan di IndexedDB — baca jadi blob URL.
  // Native (APK): file nyata di disk — convertFileSrc -> http://localhost/_capacitor_file_/...
  if (Capacitor.getPlatform() === 'web') {
    const cacheKey = `${remote.fileId}:${mime}`;
    if (blobUrlCache.has(cacheKey)) return blobUrlCache.get(cacheKey);
    const { data } = await Filesystem.readFile({
      path: localPathFor(remote),
      directory: Directory.Data,
    });
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    blobUrlCache.set(cacheKey, url);
    return url;
  }
  const { uri } = await Filesystem.getUri({
    path: localPathFor(remote),
    directory: Directory.Data,
  });
  return Capacitor.convertFileSrc(uri);
}

/** MIME dari nama file (untuk data-URL gambar). */
function mimeForFile(remote) {
  // UNTUK APA? Menebak MIME gambar dari ekstensi fileName untuk prefix data-URL.
  // KENAPA? data-URL butuh MIME tepat; default jpeg aman karena mayoritas overlay berupa jpg.
  const ext = /\.([A-Za-z0-9]+)$/.exec(String(remote.fileName ?? ''))?.[1]?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

/**
 * Gambar lokal sebagai data-URL (bukan blob/file-URL).
 * Alasan: tekstur WebGL (<a-image>) terbukti menolak blob: di sejumlah
 * environment, sedangkan data-URL jalan di mana-mana (termasuk headless).
 * Hanya untuk gambar kecil (ratusan KB); VIDEO tetap pakai localFileUri
 * (file/blob URL) agar hemat memori.
 */
const dataUrlCache = new Map();

export async function localImageDataUrl(remote) {
  // UNTUK APA? Membuat data-URL base64 untuk gambar lokal kecil (overlay/WebGL).
  // KENAPA? Tekstur WebGL menolak blob di sebagian env, sedangkan data-URL jalan; cache hemat baca file ulang.
  const fid = String(remote.fileId);
  if (dataUrlCache.has(fid)) return dataUrlCache.get(fid);
  const { data } = await Filesystem.readFile({
    path: localPathFor(remote),
    directory: Directory.Data,
  });
  const url = `data:${mimeForFile(remote)};base64,${data}`;
  dataUrlCache.set(fid, url);
  return url;
}

/**
 * Mutasi scenario.video -> URI lokal untuk semua file yang sudah terunduh.
 * Satu file yang dipakai banyak segmen dipetakan ke semua segmennya sekaligus.
 * Dipanggil setelah loadScenarios dan setelah tiap unduhan selesai.
 */
export async function applyLocalVideos(scenarios) {
  // UNTUK APA? Memutasi scenario.video ke URI lokal untuk semua file yang sudah terunduh.
  // KENAPA? Satu file dipakai banyak segmen; engine playback tak perlu diubah karena cukup baca field video.
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
  // UNTUK APA? Encoder base64 streaming yang membawa sisa 1-2 byte ke chunk berikut.
  // KENAPA? Base64 harus kelipatan 3 byte; tanpa carry, padding muncul di tengah dan file gabungan rusak.
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
  // UNTUK APA? Membangun URL Drive API alt=media untuk satu fileId beserta API key.
  // KENAPA? acknowledgeAbuse=true wajib agar file besar yang kena flag scan Google tetap bisa diunduh.
  // acknowledgeAbuse: amankan unduhan file besar yang ditandai hasil scan Google.
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&acknowledgeAbuse=true&key=${DRIVE_API_KEY}`;
}

function formatMB(bytes) {
  // UNTUK APA? Memformat byte ke string MB satu desimal untuk label progress UI.
  // KENAPA? Angka mentah sulit dibaca user; pembagi 1048576 memberi MB biner yang konsisten.
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
  // UNTUK APA? Mengunduh satu file remote (native downloadFile, web via fetch) lalu verifikasi ukuran dan simpan state.
  // KENAPA? Jalur produksi native tanpa CORS; mkdir induk wajib karena plugin tak buat folder otomatis (ENOENT).
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
  // UNTUK APA? Fallback web/dev: fetch per chunk 4MB dengan retry lalu tulis/append base64 streaming.
  // KENAPA? Selalu mulai dari nol agar sambungan base64 valid; retry menahan flaky network, error Drive diteruskan jelas.
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
 * Unduh semua file unik yang kurang (video + gambar overlay), berurutan —
 * satu fileId hanya sekali walau dipakai banyak segmen/gambar. Callback UI:
 * onFile({ scenario, remote, fileIndex, fileCount }) & onProgress({ loaded, total, scenario }).
 */
export async function downloadMissing(scenarios, { onFile, onProgress } = {}) {
  // UNTUK APA? Mengunduh semua file unik yang kurang (video lalu gambar) berurutan dan menerapkan URI lokalnya.
  // KENAPA? Berurutan hemat memori/bandwidth; gambar jadi data-URL (ramah WebGL) sedangkan video jadi file/blob URL.
  // NOTE: cancelled direset oleh startJob; jangan reset di sini (single-flight).
  // Job video: unduh -> mutasi scenario.video semua segmen pemakai.
  const jobs = [];
  for (const g of uniqueRemotes(scenarios)) {
    if (!(await isFileReady(g.remote))) {
      jobs.push({
        remote: g.remote,
        scenario: g.scenarios[0],
        apply: async (uri) => {
          g.scenarios.forEach((s) => {
            s.video = uri;
          });
        },
      });
    }
  }
  // Job gambar overlay: unduh -> isi overlay.localImage semua pemakai.
  for (const g of collectImageRemotes(scenarios)) {
    if (!(await isFileReady(g.remote))) {
      jobs.push({
        remote: g.remote,
        scenario: g.scenario,
        mime: 'image/jpeg',
        apply: async (uri) => {
          g.overlays.forEach((o) => {
            assignImageUri(o, g.remote, uri);
          });
        },
      });
    }
  }
  for (let i = 0; i < jobs.length; i += 1) {
    if (cancelled) throw new Error('dibatalkan');
    const job = jobs[i];
    onFile?.({ scenario: job.scenario, remote: job.remote, fileIndex: i, fileCount: jobs.length });
    await downloadOne(job.remote, (p) => onProgress?.({ ...p, scenario: job.scenario }));
    // Gambar -> data-URL (ramah tekstur WebGL); video -> file/blob URL (hemat memori).
    await job.apply(job.mime ? await localImageDataUrl(job.remote) : await localFileUri(job.remote));
  }
  return jobs.length;
}

/** Ambil elemen UI layar download (dipanggil tiap run agar tidak basi). */
function downloadUi() {
  // UNTUK APA? Mengambil elemen DOM layar download (judul, progress, tombol) tiap run.
  // KENAPA? Diambil ulang agar tidak basi setelah navigasi render ulang; get per id aman jika elemen belum ada.
  const get = (id) => document.getElementById(id);
  return {
    title: get('downloadTitle'),
    desc: get('downloadDesc'),
    fileInfo: get('downloadFileInfo'),
    fill: get('downloadFill'),
    percent: get('downloadPercent'),
    status: get('downloadStatus'),
    start: get('downloadStart'),
    cancel: get('downloadCancel'),
    retry: get('downloadRetry'),
    back: get('downloadBack'),
  };
}

function renderProgress(ui, loaded, total) {
  // UNTUK APA? Merender bar persen dan teks MB (loaded/total) ke elemen UI download.
  // KENAPA? Dipisah dari logika unduh agar callback onProgress ringan; guard total>0 mencegah NaN saat ukuran unknown.
  const pct = total > 0 ? Math.min(100, (loaded / total) * 100) : 0;
  if (ui.fill) ui.fill.style.width = `${pct.toFixed(1)}%`;
  if (ui.percent) ui.percent.textContent = `${pct.toFixed(0)}%`;
  if (ui.status) ui.status.textContent = `${formatMB(loaded)} / ${formatMB(total)}`;
}

/**
 * Single-flight: hanya 1 job download boleh jalan. Back = detach (job lanjut
 * di latar belakang), masuk lagi = attach ulang ke job yang sama.
 */
let activeJob = null; // { moduleId, loaded, total, percent, fileLabel }

export function isDownloading() {
  return !!activeJob;
}

export function getDownloadProgress() {
  return activeJob ? { ...activeJob } : null;
}

function emitProgress(job) {
  try {
    window.dispatchEvent(new CustomEvent('download-progress', { detail: { ...job } }));
  } catch { /* abaikan */ }
}

/**
 * Jalankan alur download: tampilkan info + tombol Mulai, jangan auto-download.
 * Back saat jalan = detach + toast (job lanjut background). Cancel = berhenti aman.
 */
export async function runDownloadFlow(scenarios, { moduleId = '', onDone, onBack } = {}) {
  const ui = downloadUi();
  if (ui.retry) ui.retry.classList.add('hidden');

  // Hitung total ukuran paket untuk label awal.
  let totalBytes = 0;
  let fileCount = 0;
  try {
    for (const g of uniqueRemotes(scenarios)) {
      if (!(await isFileReady(g.remote))) {
        totalBytes += Number(g.remote.size) || 0;
        fileCount += 1;
      }
    }
    for (const g of collectImageRemotes(scenarios)) {
      if (!(await isFileReady(g.remote))) {
        totalBytes += Number(g.remote.size) || 0;
        fileCount += 1;
      }
    }
  } catch { /* label gagal -> tetap tampil tombol */ }

  // Jika job modul ini sudah jalan -> attach ulang, jangan start baru.
  if (activeJob && activeJob.moduleId === moduleId) {
    wireAttachedMode(ui, onBack);
    renderProgress(ui, activeJob.loaded, activeJob.total);
    if (ui.fileInfo) ui.fileInfo.textContent = activeJob.fileLabel ?? `File • ${formatMB(totalBytes)}`;
    if (ui.title) ui.title.textContent = 'Melanjutkan unduhan…';
    return;
  }

  // Job modul lain jalan -> tombol Start disable, info siapa yang jalan.
  if (activeJob && activeJob.moduleId !== moduleId) {
    if (ui.title) ui.title.textContent = 'Ada unduhan berjalan';
    if (ui.status) ui.status.textContent = `Modul lain mengunduh ${activeJob.percent}% — tunggu selesai dulu.`;
    if (ui.start) ui.start.disabled = true;
    if (ui.back) ui.back.onclick = () => onBack?.();
    return;
  }

  if (ui.title) ui.title.textContent = 'Siap mengunduh modul';
  if (ui.fileInfo) ui.fileInfo.textContent = `${fileCount} file • ${formatMB(totalBytes)}`;
  if (ui.status) ui.status.textContent = 'Siap mengunduh.';
  renderProgress(ui, 0, 1);
  if (ui.start) {
    ui.start.classList.remove('hidden');
    ui.start.disabled = false;
    ui.start.onclick = () => startJob(scenarios, { moduleId, onDone, onBack });
  }
  if (ui.cancel) ui.cancel.classList.add('hidden');
  if (ui.back) ui.back.onclick = () => onBack?.();
}

function wireAttachedMode(ui, onBack) {
  if (ui.start) ui.start.classList.add('hidden');
  if (ui.cancel) {
    ui.cancel.classList.remove('hidden');
    ui.cancel.onclick = () => {
      cancelDownloads();
      showToast('Membatalkan unduhan…');
    };
  }
  if (ui.back) {
    ui.back.onclick = () => {
      showToast('Unduhan berjalan di latar belakang');
      onBack?.();
    };
  }
  const onProg = (e) => {
    const job = e.detail;
    if (ui.percent) ui.percent.textContent = `${job.percent}%`;
    if (ui.fill) ui.fill.style.width = `${job.percent}%`;
    if (ui.status) ui.status.textContent = `${formatMB(job.loaded)} / ${formatMB(job.total)}`;
    if (ui.fileInfo && job.fileLabel) ui.fileInfo.textContent = job.fileLabel;
  };
  window.addEventListener('download-progress', onProg, { once: false });
}

async function startJob(scenarios, { moduleId, onDone, onBack }) {
  const ui = downloadUi();
  if (activeJob) return; // guard dobel-klik / dobel flow.
  cancelled = false;
  activeJob = { moduleId, loaded: 0, total: 1, percent: 0, fileLabel: '' };
  if (ui.start) ui.start.classList.add('hidden');
  if (ui.retry) ui.retry.classList.add('hidden');
  if (ui.cancel) {
    ui.cancel.classList.remove('hidden');
    ui.cancel.onclick = () => {
      cancelDownloads();
      showToast('Membatalkan unduhan…');
    };
  }
  if (ui.back) {
    ui.back.onclick = () => {
      showToast('Unduhan berjalan di latar belakang');
      onBack?.();
    };
  }

  try {
    const count = await downloadMissing(scenarios, {
      onFile: ({ remote, fileIndex, fileCount }) => {
        if (!activeJob) return;
        activeJob.fileLabel = `File ${fileIndex + 1}/${fileCount} • ${formatMB(remote.size)}`;
        if (ui.title) ui.title.textContent = `Mengunduh: ${remote.fileName ?? 'file'}`;
        if (ui.fileInfo) ui.fileInfo.textContent = activeJob.fileLabel;
        if (ui.retry) ui.retry.classList.add('hidden');
        emitProgress(activeJob);
      },
      onProgress: ({ loaded, total }) => {
        if (!activeJob) return;
        activeJob.loaded = loaded;
        activeJob.total = total || 1;
        activeJob.percent = Math.round(Math.min(100, (loaded / activeJob.total) * 100));
        renderProgress(ui, loaded, total);
        emitProgress(activeJob);
      },
    });
    activeJob = null;
    if (count === 0) {
      onDone?.();
      return;
    }
    showToast('Unduhan selesai');
    if (ui.status) ui.status.textContent = 'Unduhan selesai. Membuka modul…';
    window.setTimeout(() => onDone?.(), 600);
  } catch (error) {
    activeJob = null;
    if (String(error?.message) === 'dibatalkan') {
      renderProgress(ui, 0, 1);
      if (ui.status) ui.status.textContent = 'Unduhan dibatalkan.';
      runDownloadFlow(scenarios, { moduleId, onDone, onBack });
      return;
    }
    console.warn('Unduhan gagal:', error);
    if (ui.status) ui.status.textContent = `Gagal: ${error?.message ?? error}`;
    if (ui.cancel) ui.cancel.classList.add('hidden');
    if (ui.retry) {
      ui.retry.classList.remove('hidden');
      ui.retry.onclick = () => runDownloadFlow(scenarios, { moduleId, onDone, onBack });
    }
  }
}

export { formatMB };
