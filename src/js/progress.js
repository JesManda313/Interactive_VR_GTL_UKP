/**
 * progress.js — progres tontonan per modul (course-path + resume).
 * Disimpan di localStorage per modul: { watched: [id...], last: id|null }.
 * Hilang bila aplikasi di-uninstall / data dihapus (keterbatasan bawaan).
 * Tanpa import agar bisa dipakai siapa saja tanpa siklus.
 *
 * UNTUK APA FILE INI?
 * Mencatat segmen mana yang sudah ditonton agar ada sistem kunci (lock):
 * segmen 2 terkunci sampai segmen 1 selesai. Juga untuk resume ("terakhir di...").
 */

// keyFor(moduleId): Untuk apa? Buat kunci unik localStorage per modul, mis. 'gtl_progress_modul1'.
// KENAPA perlu unik per modul? Agar progres modul A tidak tercampur dengan modul B.
// KENAPA ?? 'unknown'? Jaga-jaga moduleId null agar tidak jadi key 'gtl_progress_null' yang ambigu.
function keyFor(moduleId) {
  return `gtl_progress_${moduleId ?? 'unknown'}`;
}

/**
 * loadProgress(moduleId):
 * Untuk apa? Muat progres modul; selalu kembalikan bentuk valid {watched:[], last:null} walau storage rusak.
 * - JSON.parse(localStorage...) KENAPA try/catch? Data bisa korup (user edit manual) -> jangan crash, pakai default.
 * - Array.isArray(raw.watched) KENAPA dicek? Pastikan bentuk benar, kalau tidak ya default.
 * - .map(String) KENAPA? Samakan tipe id jadi string agar perbandingan includes() konsisten (hindari 1 vs "1").
 */
export function loadProgress(moduleId) {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(moduleId)) ?? 'null');
    if (raw && Array.isArray(raw.watched)) {
      return { watched: raw.watched.map(String), last: raw.last != null ? String(raw.last) : null };
    }
  } catch { /* abaikan, pakai default */ }
  return { watched: [], last: null };
}

// saveProgress(): Untuk apa? Tulis object progres ke localStorage sebagai JSON.
// KENAPA try/catch? Storage bisa penuh/diblokir mode privat — progres sesi ini saja, jangan crash app.
function saveProgress(moduleId, progress) {
  try {
    localStorage.setItem(keyFor(moduleId), JSON.stringify(progress));
  } catch { /* storage penuh/diblokir: progres sesi ini saja */ }
}

/**
 * markWatched(moduleId, scenarioId):
 * Untuk apa? Tandai satu segmen sudah ditonton (idempoten = dipanggil berkali-kali hasil sama).
 * - if (!scenarioId) return KENAPA? Jaga-jaga id kosong, jangan simpan sampah.
 * - if (!includes) push KENAPA? Agar tidak dobel entry bila video di-replay.
 * - progress.last = id KENAPA? Sekaligus jadikan posisi terakhir (untuk resume).
 */
export function markWatched(moduleId, scenarioId) {
  if (!scenarioId) return;
  const id = String(scenarioId);
  const progress = loadProgress(moduleId);
  if (!progress.watched.includes(id)) progress.watched.push(id);
  progress.last = id;
  saveProgress(moduleId, progress);
}

/**
 * setLast(moduleId, scenarioId):
 * Untuk apa? Set posisi terakhir TANPA menandai ditonton (mis. keluar di tengah).
 * KENAPA beda dengan markWatched? Agar segmen yang belum selesai tidak dianggap done (tetap terkunci berikutnya),
 * tapi saat buka lagi bisa resume dari situ (status 'current').
 */
export function setLast(moduleId, scenarioId) {
  if (!scenarioId) return;
  const progress = loadProgress(moduleId);
  progress.last = String(scenarioId);
  saveProgress(moduleId, progress);
}

/**
 * resetProgress(moduleId):
 * Untuk apa? Hapus progres satu modul (tombol "Mulai dari awal").
 * KENAPA removeItem (bukan set kosong)? Lebih bersih, loadProgress otomatis anggap kosong.
 */
export function resetProgress(moduleId) {
  try {
    localStorage.removeItem(keyFor(moduleId));
  } catch { /* abaikan */ }
}

/**
 * mainChainOrder(scenarios):
 * Untuk apa? Urutan path utama = urutan authoring di scenarios.json, KECUALI
 * konsekuensi loop-balik (punya `returnTo`) yang ditampilkan sebagai anak decision induknya.
 * KENAPA filter? Agar timeline lurus tidak bercabang panjang oleh video konsekuensi (hukuman salah jawab),
 * tapi tetap bisa diakses sebagai anak. Tahan terhadap decision tanpa `next` (tidak crash).
 */
export function mainChainOrder(scenarios) {
  const list = Array.isArray(scenarios) ? scenarios : []; // cek Array KENAPA? Jaga-jaga data belum load.
  return list
    .filter((s) => !(s?.type === 'consequence' && s?.returnTo)) // buang consequence loop-balik dari jalur utama.
    .map((s) => s.id); // ambil id saja untuk urutan.
}

/**
 * firstScenarioId(scenarios):
 * Untuk apa? Id segmen pertama modul (selalu terbuka agar pelajaran bisa dimulai).
 * KENAPA fallback berlapis? mainChainOrder bisa kosong bila data aneh -> pakai scenarios[0] -> null.
 * Selalu ada fallback agar openMode tidak buntu.
 */
export function firstScenarioId(scenarios) {
  return mainChainOrder(scenarios)[0] ?? scenarios?.[0]?.id ?? null;
}

/**
 * isUnlocked(moduleId, scenarioId, scenarios):
 * Untuk apa? TRUE bila segmen boleh dibuka: segmen pertama, pernah ditonton, atau posisi terakhir. Selain itu terkunci.
 * KENAPA aturan ini? Menerapkan pembelajaran berurutan (tidak bisa loncat), tapi tetap boleh replay materi lama.
 */
export function isUnlocked(moduleId, scenarioId, scenarios) {
  const id = String(scenarioId ?? '');
  if (!id) return false; // id kosong -> kunci. KENAPA? Jangan buka segmen tak dikenal.
  if (id === firstScenarioId(scenarios)) return true; // pertama selalu buka. KENAPA? Agar bisa mulai.
  const progress = loadProgress(moduleId);
  return progress.watched.includes(id) || progress.last === id; // pernah tonton / terakhir -> buka.
}

/**
 * scenarioStatus(moduleId, scenarioId, scenarios):
 * Untuk apa? Status satu segmen untuk label timeline: done | current | locked | open.
 * Urutan cek KENAPA current dulu baru done? Karena segmen terakhir yang ditonton harus tampil ▶ (sedang di sini),
 * bukan ✓, agar user tahu posisi resume. Lalu done, lalu open (terbuka tapi belum tonton), else locked.
 */
export function scenarioStatus(moduleId, scenarioId, scenarios) {
  const id = String(scenarioId ?? '');
  const progress = loadProgress(moduleId);
  if (progress.last === id) return 'current';
  if (progress.watched.includes(id)) return 'done';
  if (isUnlocked(moduleId, id, scenarios)) return 'open';
  return 'locked';
}
