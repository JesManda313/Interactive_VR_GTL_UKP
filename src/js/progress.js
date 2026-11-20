// progress.js: progres tontonan per modul di localStorage { watched, last } untuk kunci segmen dan resume.

// keyFor(): kunci localStorage unik per modul (fallback 'unknown' bila moduleId null).
function keyFor(moduleId) {
  return `gtl_progress_${moduleId ?? 'unknown'}`;
}

// loadProgress(): muat progres; bentuk selalu valid walau storage rusak; id di-map ke string.
export function loadProgress(moduleId) {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(moduleId)) ?? 'null');
    if (raw && Array.isArray(raw.watched)) {
      return { 
        watched: raw.watched.map(String), 
        last: raw.last != null ? String(raw.last) : null };
    }
  } catch { /* data korup: pakai default */ }
  return { watched: [], last: null };
}

// saveProgress(): simpan progres ke localStorage; storage penuh/privat diabaikan.
function saveProgress(moduleId, progress) {
  try {
    localStorage.setItem(keyFor(moduleId), JSON.stringify(progress));
  } catch { /* storage penuh/diblokir: abaikan */ }
}

// markWatched(): tandai segmen ditonton (idempoten) sekaligus jadi posisi terakhir.
export function markWatched(moduleId, scenarioId) {
  if (!scenarioId) return;
  const id = String(scenarioId);
  const progress = loadProgress(moduleId);
  if (!progress.watched.includes(id)) progress.watched.push(id);
  progress.last = id;
  saveProgress(moduleId, progress);
}

// setLast(): set posisi terakhir tanpa menandai ditonton (segmen belum selesai tetap terkunci).
export function setLast(moduleId, scenarioId) {
  if (!scenarioId) return;
  const progress = loadProgress(moduleId);
  progress.last = String(scenarioId);
  saveProgress(moduleId, progress);
}

// resetProgress(): hapus progres satu modul (tombol "Mulai dari awal").
export function resetProgress(moduleId) {
  try {
    localStorage.removeItem(keyFor(moduleId));
  } catch { /* abaikan */ }
}

// mainChainOrder(): urutan jalur utama; consequence dengan returnTo dibuang dari timeline
// (tetap tampil sebagai anak decision).
export function mainChainOrder(scenarios) {
  const list = Array.isArray(scenarios) ? scenarios : []; // guard data belum load.
  return list
    .filter((s) => !(s?.type === 'consequence' && s?.returnTo)) // buang consequence loop-balik dari jalur utama.
    .map((s) => s.id); // id saja untuk urutan.
}

// firstScenarioId(): id segmen pertama; fallback berlapis agar openMode tidak buntu.
export function firstScenarioId(scenarios) {
  return mainChainOrder(scenarios)[0] ?? scenarios?.[0]?.id ?? null;
}

// isUnlocked(): true bila segmen pertama, sudah ditonton, atau posisi terakhir;
// selain itu terkunci.
export function isUnlocked(moduleId, scenarioId, scenarios) {
  const id = String(scenarioId ?? '');
  if (!id) return false; // id kosong: kunci.
  if (id === firstScenarioId(scenarios)) return true; // segmen pertama selalu terbuka.
  const progress = loadProgress(moduleId);
  return progress.watched.includes(id) || progress.last === id; // pernah tonton / terakhir: buka.
}

// scenarioStatus(): status segmen done | current | locked | open; current dicek dulu
// agar posisi resume tampil.
export function scenarioStatus(moduleId, scenarioId, scenarios) {
  const id = String(scenarioId ?? '');
  const progress = loadProgress(moduleId);
  if (progress.last === id) return 'current';
  if (progress.watched.includes(id)) return 'done';
  if (isUnlocked(moduleId, id, scenarios)) return 'open';
  return 'locked';
}
