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
  // UNTUK APA? Menentukan apakah video tampil sebagai layar datar (flat).
  // KENAPA? Mode flat butuh <a-video> bioskop, sedangkan 360 butuh <a-videosphere>; salah pilih = video tidak tampil benar.
  if (!scenario) return false;
  const projection = String(scenario.projection ?? scenario.videoType ?? '').toLowerCase();
  return projection === 'flat' || projection === '2d' || projection === 'rectilinear';
}

/**
 * Penanda italic *...* di scenarios.json.
 * <a-text> A-Frame standar tidak dukung inline italic per kata (tidak ada
 * atribut fontStyle), jadi untuk scene 3D (360 + VR) penanda dibersihkan
 * agar tidak tampil mentah — DOM mobile-flat yang render <i> beneran
 * (lihat richItalic di scenario.js).
 */
export function stripItalicMarkers(value) {
  // UNTUK APA? Menghapus penanda *miring* agar teks 3D <a-text> tampil bersih.
  // KENAPA? <a-text> A-Frame tidak bisa italic per kata, jadi penanda mentah harus dibuang (DOM mobile-flat render <i> secara terpisah).
  return String(value ?? '').replace(/\*([^*\n]+)\*/g, '$1');
}

/** TRUE bila teks mengandung penanda *...* (untuk data-has-italic). */
export function hasItalicMarkers(value) {
  // UNTUK APA? Cek apakah teks mengandung *...* untuk ditandai di atribut data-has-italic.
  // KENAPA? Info ini dipakai engine/overlay agar tahu teks aslinya punya bagian miring walau penandanya sudah dibersihkan.
  return /\*[^*\n]+\*/.test(String(value ?? ''));
}

/**
 * Bangun HTML A-Frame untuk daftar opsi kuis.
 * Menghitung posisi, ukuran, dan atribut data untuk tiap opsi.
 */
export function buildOptionsHtml(options = [], variant = 'mobile') {
  // UNTUK APA? Membangun tombol-tombol jawaban kuis (<a-entity> + <a-plane> + <a-text>) dalam satu baris.
  // KENAPA? Opsi harus terpusat rapi di semua ukuran layar/VR, jadi posisi dihitung otomatis bukan hardcode.
  const count = options.length || 1;

  // Total lebar yang tersedia untuk baris opsi (di dalam panel)
  // Perhitungan lebar opsi: bagi ruang tersedia dikurangi total jeda antar tombol,
  // agar N opsi selalu pas selebar panel tanpa tumpuk atau keluar bingkai.
  const availableWidth = variant === 'vr' ? 2.2 : 4.2;
  const gapX = variant === 'vr' ? 0.08 : 0.15;

  const optionWidth = (availableWidth - gapX * (count - 1)) / count;
  const optionHeight = variant === 'vr' ? 0.62 : 1.05;

  const totalRowWidth = optionWidth * count + gapX * (count - 1);
  // startX = titik kiri agar baris terpusat (setengah total dikurangi setengah tombol pertama).
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
  // UNTUK APA? Merakit panel kuis lengkap: judul DECISION POINT + pertanyaan + opsi + teks feedback.
  // KENAPA? Panel disembunyikan dulu (visible=false) lalu dimunculkan engine saat video dijeda; satu fungsi agar mobile & VR konsisten.
  if (!scenario.question || !Array.isArray(scenario.options)) {
    return '';
  }

  const panelWidth = variant === 'vr' ? '2.5' : '4.7';
  const panelHeight = variant === 'vr' ? '2.35' : '3.05';
  const questionWidth = variant === 'vr' ? '1.95' : '3.4';
  const questionY = variant === 'vr' ? '0.62' : '0.8';
  const options = buildOptionsHtml(scenario.options, variant);

  return `
    <a-entity
      class="quiz-panel"
      visible="false"
      // Posisi kuis: y=3 (agak di atas mata 1.6) + quizZ kedalaman; VR-flat dimajukan (-2.45) agar di depan layar bioskop.
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

/**
 * Zona tampilan overlay terjadwal per tipe video (m, relatif kamera di y=1.6).
 * Cinema/flat: strip bawah layar (layar di y 1.7–3.9) atau atas untuk judul.
 * 360: depan-bawah / depan-atas, di luar garis pandang utama.
 * Override koordinat bebas "pos3d": [x, y, z] untuk video 360
 * (mobile-360 + VR-360); di mode flat (kartu DOM mobile / ruang bioskop VR)
 * diabaikan + warn.
 * Acuan aman depan kamera: x -3..3, y 0..6, z -5..-2.
 */
function customOverlayZone(overlay) {
  // UNTUK APA? Membaca pos3d [x,y,z] kustom khusus video 360 menjadi posisi entity overlay.
  // KENAPA? Hanya 360 (mobile + VR) yang bebas menaruh overlay di ruang 3D; flat memakai preset agar tidak menutupi layar.
  const p = overlay?.pos3d;
  if (p == null) return null;
  const id = overlay?.id ?? '?';
  if (!Array.isArray(p) || p.length !== 3 || !p.every((v) => Number.isFinite(Number(v)))) {
    console.warn(`[overlay] ${id}: pos3d tidak valid (butuh [x, y, z] angka), dipakai preset pos.`);
    return null;
  }
  const [x, y, z] = p.map(Number);
  if (x < -3 || x > 3 || y < 0 || y > 6 || z < -5 || z > -2) {
    console.warn(`[overlay] ${id}: pos3d [${x}, ${y}, ${z}] di luar batas aman (x -3..3, y 0..6, z -5..-2).`);
  }
  return { position: `${x} ${y} ${z}`, width: 2.3, custom: true };
}

function timedOverlayZone(overlay, { isFlat = false, isVr = false } = {}) {
  // UNTUK APA? Memilih preset posisi overlay (atas/bawah) sesuai tipe video: flat bioskop vs 360/VR.
  // KENAPA? Tiap tipe punya titik aman berbeda (strip bawah layar vs depan-bawah 360) agar teks tidak menutupi pandangan utama.
  if (!isFlat) {
    const custom = customOverlayZone(overlay);
    if (custom) return custom;
  } else if (overlay?.pos3d != null || overlay?.textX != null || overlay?.textY != null || overlay?.rot != null) {
    console.warn(`[overlay] ${overlay?.id ?? '?'}: pos3d/textX/textY/rot hanya berlaku di video 360, diabaikan di mode flat.`);
  }
  const atas = overlay?.pos === 'atas';
  if (isFlat) {
    return atas
      ? { position: '0 4.45 -2.55', width: 2.1 }// pos atas
      : { position: '0 1.25 -2.55', width: 2.1 };// pos bawah bioskop: bawah bingkai, atas garis biru
  }
  return atas
    ? { position: '0 5.2 -3', width: 2.3 }// pos atas 
    : { position: '0 0.8 -3', width: 2.3 }; // pos bawah
}

/**
 * Normalisasi daftar gambar satu overlay.
 * Mendukung model baru `images: [{ image, imageRemote, localImage, x, y, w }]`
 * dan model lama (satu `image`/`imageRemote` + `localImage` di overlay).
 * @returns {Array<{ src, remote, x|null, y|null, w|null }>} (src boleh kosong bila hanya remote — tetap ikut antre unduh)
 */
export function listOverlayImages(overlay) {
  // UNTUK APA? Menyeragamkan daftar gambar overlay dari format baru (images[]) maupun lama (image tunggal).
  // KENAPA? Skenario lama & baru harus sama-sama jalan; hasil seragam {src, remote, x, y, w} memudahkan perhitung tata letak.
  if (Array.isArray(overlay?.images) && overlay.images.length) {
    return overlay.images.map((im) => ({
      src: im?.localImage || im?.image || '',
      remote: im?.imageRemote ?? null,
      x: im?.x ?? null,
      y: im?.y ?? null,
      w: im?.w ?? null,
    }));
  }
  const legacySrc = overlay?.localImage || overlay?.image || '';
  const legacyRemote = overlay?.imageRemote ?? null;
  if (legacySrc || legacyRemote?.fileId) {
    return [{ src: legacySrc, remote: legacyRemote, x: null, y: null, w: null }];
  }
  return [];
}

/** Clamp angka dengan warn bila nilai eksplisit di luar batas. */
function clampOverlayImg(v, lo, hi, fb, label) {
  // UNTUK APA? Membatasi angka koordinat/ukuran gambar ke rentang aman + peringatan bila keluar batas.
  // KENAPA? Nilai liar (mis. x=100) bisa melempar gambar keluar pandangan; clamp menjaga tetap terlihat.
  const n = Number(v);
  if (!Number.isFinite(n)) return fb;
  if (n < lo || n > hi) {
    console.warn(`[overlay] ${label} di luar batas [${lo}, ${hi}], dipakai ${Math.min(hi, Math.max(lo, n))}.`);
    return Math.min(hi, Math.max(lo, n));
  }
  return n;
}

/**
 * Bangun entity overlay terjadwal (teks/gambar) di dalam scene 3D.
 * Dipakai mode 360 (mobile) + semua mode VR; mobile-flat memakai kartu DOM.
 * Visibilitas diatur engine via atribut visible + data-overlay-id.
 * Field opsional khusus video 360 (mobile + VR; diabaikan di flat): "pos3d": [x, y, z]
 * (posisi bebas entity), "textX"/"textY" (offset teks lokal entity),
 * "rot": [x, y, z] derajat (putaran teks + kotaknya; Y negatif = kiri menjauh).
 * Teks mendukung \n manual (maks 2 baris disarankan, 3 bila ekstrem).
 */
export function buildTimedOverlaysHtml(scenario, { isVr = false, isFlat = false } = {}) {
  // UNTUK APA? Membangun semua overlay terjadwal (teks/gambar + kotak backing + data-start/end) untuk scene 3D.
  // KENAPA? Overlay 3D hanya untuk 360 & VR (mobile-flat pakai kartu DOM), dan visibilitasnya dikendalikan engine per waktu video.
  const list = Array.isArray(scenario?.overlays) ? scenario.overlays : [];
  if (!list.length) return '';

  return list
    .map((overlay, index) => {
      const id = safeText(overlay.id ?? `t${index}`);
      const start = Number(overlay.start ?? 0);
      const end = overlay.end == null ? '' : Number(overlay.end);
      const zone = timedOverlayZone(overlay, { isFlat, isVr });
      const only360 = !isFlat;
      // Skala tulisan: judul 2, selainnya 3. Ditempel di <a-text> saja
      // agar kotak dan gambar tidak ikut membesar.
      const tsNum = overlay.size === 'judul' ? 2 : 3;
      const textScale = `${tsNum} ${tsNum} ${tsNum}`;
      const textWidth = (zone.width - 0.3).toFixed(2);
      const PAD_H = 0.03;
      const PAD_V = 0.12;

      // Estimasi blok teks (lebar/tinggi lokal, sebelum skala) agar backing
      // pas membungkus isi + padding tipis.
      // Catatan: hitung dari teks bersih tanpa penanda *...* agar kotak pas.
      // Sadar \n manual: tiap segmen di-wrap per 40 karakter (sama seperti
      // wrap-count pada <a-text>), lebar = segmen terpanjang.
      const estimateBlock = (text) => {
        const segs = stripItalicMarkers(text).split('\n');
        const maxLen = segs.reduce((a, s) => Math.max(a, s.length), 0);
        const lines = segs.reduce((a, s) => a + Math.max(1, Math.ceil(s.length / 40)), 0);
        const cell = (zone.width - 0.3) / 40;
        return {
          localW: Math.min(maxLen, 40) * cell,
          localH: lines * cell * 1.25,
        };
      };

      // Daftar gambar (multi + koordinat manual, atau model lama tunggal).
      const rawImgs = listOverlayImages(overlay);
      const overlayItalic = hasItalicMarkers(overlay.kind === 'image' ? (overlay.caption ?? '') : (overlay.text ?? ''));
      const cleanCaption = stripItalicMarkers(overlay.caption ?? '');
      const cleanText = stripItalicMarkers(overlay.text ?? '');
      const nImg = rawImgs.length;
      rawImgs.forEach((im, i) => {
        const wDef = nImg === 1
          ? (overlay.kind === 'image' ? Math.min(zone.width, 1.8) : Math.min(zone.width, 1.2))
          : Math.min(1.1, zone.width / 2 - 0.1);
        im.w = im.w == null ? wDef : clampOverlayImg(im.w, 10, 10, wDef, `${overlay.id}[${i}].w`);
        im.h = im.w * 9 / 16;
        if (im.x == null) {
          im.x = nImg === 1 ? 0 : (i - (nImg - 1) / 2) * (im.w + 0.16);
        } else {
          im.x = clampOverlayImg(im.x, -10, 10, 0, `${overlay.id}[${i}].x`);
        }
      });

      // Blok teks utama (caption untuk kind image, text untuk lainnya).
      const bodyRaw = overlay.kind === 'image' ? (overlay.caption ?? '') : (overlay.text ?? '');
      const block = estimateBlock(bodyRaw);
      const hasBody = stripItalicMarkers(bodyRaw).length > 0;
      const textH = hasBody ? block.localH * tsNum : 0;
      const textW = hasBody ? Math.min(block.localW * tsNum, zone.width * tsNum) : 0;

      // Baris gambar tanpa y eksplisit ditumpuk di atas teks; yang berkoordinat tetap.
      const GAP = 0.15;
      const autoRow = rawImgs.filter((im) => im.y == null);
      const rowH = autoRow.length ? Math.max(...autoRow.map((im) => im.h)) : 0;
      const totalH = rowH + (autoRow.length && hasBody ? GAP : 0) + textH;
      const rowY = totalH / 2 - rowH / 2;
      const textY = -totalH / 2 + textH / 2;
      // Offset teks manual (koordinat lokal entity, meter) — video 360 (mobile + VR).
      // "textX"/"textY" null/absen = otomatis seperti sekarang.
      let textX = 0;
      let finalTextY = textY;
      if (only360 && overlay?.textX != null) {
        textX = clampOverlayImg(overlay.textX, -2, 2, 0, `${overlay.id}.textX`);
      }
      if (only360 && overlay?.textY != null) {
        finalTextY = clampOverlayImg(overlay.textY, -2, 2, textY, `${overlay.id}.textY`);
      }
      // Putaran teks manual (derajat, [x, y, z]) — video 360 (mobile + VR).
      // "rot" null/absen = tegak [0,0,0]. Y negatif = sisi kiri menjauh.
      const fmtDeg = (v) => String(Math.round(Number(v) * 100) / 100);
      let rotX = 0, rotY = 0, rotZ = 0;
      if (only360 && overlay?.rot != null) {
        const r = overlay.rot;
        if (!Array.isArray(r) || r.length !== 3 || !r.every((v) => Number.isFinite(Number(v)))) {
          console.warn(`[overlay] ${overlay.id ?? '?'}: rot tidak valid (butuh [x, y, z] derajat), dipakai [0, 0, 0].`);
        } else {
          [rotX, rotY, rotZ] = r.map(Number);
          if ([rotX, rotY, rotZ].some((v) => Math.abs(v) > 60)) {
            console.warn(`[overlay] ${overlay.id ?? '?'}: rot [${rotX}, ${rotY}, ${rotZ}] curam (>60°), keterbacaan menurun.`);
          }
        }
      }
      const rotAttr = `${fmtDeg(rotX)} ${fmtDeg(rotY)} ${fmtDeg(rotZ)}`;
      autoRow.forEach((im) => { im.y = rowY; });
      rawImgs.forEach((im, i) => {
        if (im.y == null) im.y = rowY;
        else im.y = clampOverlayImg(im.y, -10, 10, rowY, `${overlay.id}[${i}].y`);
      });

      // Backing: overlay yang me-render gambar = satu kotak per elemen
      // (tiap gambar + teks/caption masing-masing); overlay teks saja =
      // satu kotak union seperti sebelumnya. Gaya kotak sama persis.
      // Backing kotak overlay: <a-plane> gelap semi-transparan di belakang isi agar teks/gambar terbaca di atas video terang.
      const splitBox = rawImgs.some((im) => im.src);
      const boxPlane = (w, h, x, y, rot = '0 0 0') => `
          <a-plane
            width="${w.toFixed(3)}"
            height="${h.toFixed(3)}"
            position="${x.toFixed(3)} ${y.toFixed(3)} 0"
            rotation="${rot}"
            color="#0a1016"
            opacity="0.55"
            material="shader: flat"
          ></a-plane>
      `;
      let backingPlanes = '';
      if (!splitBox) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const im of rawImgs) {
          minX = Math.min(minX, im.x - im.w / 2); maxX = Math.max(maxX, im.x + im.w / 2);
          minY = Math.min(minY, im.y - im.h / 2); maxY = Math.max(maxY, im.y + im.h / 2);
        }
        if (hasBody) {
          minX = Math.min(minX, textX - textW / 2); maxX = Math.max(maxX, textX + textW / 2);
          minY = Math.min(minY, finalTextY - textH / 2); maxY = Math.max(maxY, finalTextY + textH / 2);
        }
        let backingW, backingH, backingX, backingY;
        if (!rawImgs.length && !hasBody) {
          backingW = zone.width; backingH = 0.7; backingX = 0; backingY = 0;
        } else {
          backingW = (maxX - minX) + PAD_H * 2;
          backingH = (maxY - minY) + PAD_V * 2;
          backingX = (minX + maxX) / 2;
          backingY = (minY + maxY) / 2;
        }
        backingPlanes = boxPlane(backingW, backingH, backingX, backingY, rotAttr);
      }

      let inner = '';
      rawImgs.forEach((im, i) => {
        if (!im.src) {
          const fid = im?.remote?.fileId ?? overlay?.imageRemote?.fileId ?? '?';
          console.warn(`[overlay] ${overlay.id ?? '?'}[${i}] (fileId ${fid}): gambar dilewati (belum diunduh?), unduh ulang modul.`);
          return;
        }
        if (splitBox) backingPlanes += boxPlane(im.w + PAD_H * 2, im.h + PAD_V * 2, im.x, im.y);
        inner += `
          <a-image
            src="${safeText(im.src)}"
            width="${im.w.toFixed(2)}"
            height="${im.h.toFixed(3)}"
            position="${im.x.toFixed(3)} ${im.y.toFixed(3)} 0.02"
            material="shader: flat"
          ></a-image>
        `;
      });
      if (hasBody) {
        if (splitBox) backingPlanes += boxPlane(textW + PAD_H * 2, textH + PAD_V * 2, textX, finalTextY, rotAttr);
        inner += `
          <a-text
            value="${safeText(overlay.kind === 'image' ? cleanCaption : cleanText)}"
            align="center"
            width="${textWidth}"
            color="#ffffff"
            position="${textX.toFixed(3)} ${finalTextY.toFixed(3)} 0.02"
            rotation="${rotAttr}"
            scale="${textScale}"
            wrap-count="40"
          ></a-text>
        `;
      }

      return `
        <a-entity
          class="timed-overlay"
          data-overlay-id="${id}"
          data-start="${start}"
          data-end="${end}"
          data-has-italic="${overlayItalic ? 'true' : 'false'}"
          visible="false"
          position="${zone.position}"
        >
          ${backingPlanes}
          ${inner}
        </a-entity>
      `;
    })
    .join('');
}

/** Bangun HTML A-Frame untuk tombol 'Kembali' di dunia VR/mobile. */
export function buildWorldBackButtonHtml() {
  // UNTUK APA? Membuat tombol "← Kembali" 3D yang selalu menghadap pengguna di dunia VR/mobile.
  // KENAPA? Navigasi keluar scene butuh objek klikable (raycaster .clickable) dengan posisi/rotasi tetap di depan kamera.
  return `
    <a-entity
      class="world-back-button clickable"
      position="-5 4 -3.2"
      rotation="0 30 0"
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

/** Bangun HTML A-Frame untuk gerbang START VR (jeda tiap segmen sampai user siap). */
export function buildVrStartGateHtml() {
  // UNTUK APA? Panel "siap putar" di depan kamera VR: video di-pause sampai
  // user memasang HP ke kacamata lalu menatap panel + tekan tombol remote.
  // KENAPA? Tanpa jeda, video langsung jalan saat HP masih di tangan user.
  // KENAPA seluruh panel clickable (bukan cuma tombol)? Target tatap lebih
  // besar = lebih mudah kena gaze cursor + remote.
  return `
    <a-entity
      class="vr-start-gate"
      visible="true"
      position="0 1.9 -2.2"
    >
      <a-plane
        class="clickable"
        width="1.7"
        height="1.15"
        color="#0b1520"
        opacity="0.94"
        material="shader: flat"
      ></a-plane>
      <a-plane
        class="clickable"
        width="1.7"
        height="0.08"
        color="#facc15"
        position="0 0.53 0.02"
        material="shader: flat"
      ></a-plane>
      <a-text
        class="clickable"
        value="SIAP MEMUTAR?"
        align="center"
        width="1.5"
        color="#facc15"
        position="0 0.32 0.02"
        wrap-count="20"
      ></a-text>
      <a-text
        class="clickable"
        value="Pasang HP ke kacamata VR, lalu arahkan pandangan ke START dan tekan tombol confirmation."
        align="center"
        width="1.5"
        color="#ffffff"
        position="0 0.02 0.02"
        wrap-count="28"
      ></a-text>
      <a-plane
        class="clickable"
        width="0.9"
        height="0.34"
        color="#16a34a"
        opacity="0.97"
        position="0 -0.36 0.02"
        material="shader: flat"
      ></a-plane>
      <a-text
        class="clickable"
        value="START"
        align="center"
        width="1.2"
        color="#ffffff"
        position="0 -0.36 0.04"
        wrap-count="12"
      ></a-text>
    </a-entity>
  `;
}

/**
 * Bangun string HTML A-Frame untuk sebuah scene kalibrasi (mata kiri/kanan).
 */
export function buildCalibrationSceneHtml({ eye = 'left' } = {}) {
  // UNTUK APA? Membangun scene kalibrasi mata kiri/kanan (target silang + panel instruksi + kamera + tombol kembali).
  // KENAPA? VR butuh penyelarasan panel kiri/kanan agar tidak double; scene terpisah per mata memudahkan kalibrasi.
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

      <a-entity position="0 2.2 2.5" rotation="0 180 0">
        <a-plane
          width="2.4"
          height="0.7"
          color="#0b1520"
          opacity="0.92"
          material="shader: flat"
        ></a-plane>
        <a-text
          value="Putar badan untuk melihat guide."
          align="center"
          width="2.0"
          color="#ffffff"
          position="0 0 0.02"
          wrap-count="30"
        ></a-text>
      </a-entity>

      <a-entity position="0 1.6 -3">
        <a-ring
          radius="0.3"
          color="#facc15"
          opacity="0.9"
          material="shader: flat; side: double"
          position="0 0 0"
        ></a-ring>
        <a-plane
          width="0.03"
          height="0.44"
          color="#facc15"
          opacity="0.9"
          material="shader: flat"
          position="0 0 0.02"
        ></a-plane>
        <a-plane
          width="0.44"
          height="0.03"
          color="#facc15"
          opacity="0.9"
          material="shader: flat"
          position="0 0 0.02"
        ></a-plane>
      </a-entity>

      <a-entity position="0 2.2 -2.5">
        <a-plane
          width="2.4"
          height="2.2"
          color="#0b1520"
          opacity="0.92"
          material="shader: flat"
        ></a-plane>
        <a-text
          value="KALIBRASI"
          align="center"
          width="1.8"
          color="#facc15"
          position="0 0.92 0.02"
          wrap-count="20"
        ></a-text>
        <a-text
          value="Tombol B : atur panel kiri."
          align="center"
          width="2.0"
          color="#ffffff"
          position="0 0.66 0.02"
          wrap-count="30"
        ></a-text>
        <a-text
          value="Tombol Y : atur panel kanan."
          align="center"
          width="2.0"
          color="#ffffff"
          position="0 0.40 0.02"
          wrap-count="30"
        ></a-text>
        <a-text
          value="Joystick : geser panel aktif ke kiri / kanan."
          align="center"
          width="2.0"
          color="#ffffff"
          position="0 0.14 0.02"
          wrap-count="30"
        ></a-text>
        <a-text
          value="Tombol X : naikkan volume HP. Tombol A : turunkan volume HP."
          align="center"
          width="2.0"
          color="#ffffff"
          position="0 -0.14 0.02"
          wrap-count="30"
        ></a-text>
        <a-text
          value="Arahkan kursor ke tombol, lalu tekan tombol konfirmasi pada remote untuk memilih."
          align="center"
          width="2.0"
          color="#ffffff"
          position="0 -0.44 0.02"
          wrap-count="30"
        ></a-text>
        <a-text
          value="Atur sampai terlihat tidak double."
          align="center"
          width="2.0"
          color="#9fb3c8"
          position="0 -0.74 0.02"
          wrap-count="30"
        ></a-text>
      </a-entity>

      <a-entity position="2.3 2.0 -2.5" rotation="0 -30 0">
        <a-plane
          width="2.2"
          height="2.15"
          color="#0b1520"
          opacity="0.92"
          material="shader: flat"
        ></a-plane>
        <a-image
          src="/content/assets/gambar-remote.jpeg"
          width="2.0"
          height="1.93"
          position="0 0 0.02"
          material="shader: flat"
        ></a-image>
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
  // UNTUK APA? Merakit satu <a-scene> utuh: aset video + tampilan utama + kamera/cursor + overlay + kuis + tombol kembali.
  // KENAPA? Satu pintu pembangun scene agar mobile & VR konsisten; perbedaan flat vs 360 ditangani di sini lewat isFlatVideo.
  const isVr = mode === 'vr';

  // VR memakai 1 shared video.
  // Mobile memakai 1 video sendiri di dalam scene.
  const videoId = isVr ? 'sharedVrVideo' : `${mode}-video`;
  const sceneId = `${mode}-${eye}-scene`;

  // Quiz VR-flat dimajukan ke depan layar bioskop; VR-360 & mobile tidak berubah.
  // Posisi kuis: -2.45 (depan layar bioskop z=-2.6) vs -3.1 (standar 360) agar panel tidak tenggelam di belakang layar.
  const quizHtml = buildQuizPanelHtml(
    scenario,
    isVr ? 'vr' : 'mobile',
    isVr && isFlatVideo(scenario) ? '-2.45' : '-3.1',
  );
  const worldBackButtonHtml = buildWorldBackButtonHtml();
  // Gerbang START khusus VR: jeda tiap segmen sampai user siap (mobile tidak pakai).
  const vrStartGateHtml = isVr ? buildVrStartGateHtml() : '';

  const cameraControls = isVr
    ? 'look-controls="touchEnabled: false; mouseEnabled: false; magicWindowTrackingEnabled: true"'
    : 'look-controls="touchEnabled: true; mouseEnabled: true; magicWindowTrackingEnabled: true"';

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
  // Bioskop flat vs videosphere 360: flat = <a-video> datar + bingkai di ruang gelap; 360 = <a-videosphere> melingkupi kamera.
  const isFlat = isFlatVideo(scenario);

  const cinemaScreenHtml = `
    <a-sky color="#020304"></a-sky>
    <a-light type="ambient" color="#39424e" intensity="0.7"></a-light>

    <!-- bingkai layar -->
    <a-plane
      width="4"
      height="2.5"
      color="#101418"
      position="0 2.8 -2.63"
      material="shader: flat"
    ></a-plane>
    <!-- layar video 16:9 -->
    <a-video
      src="#${videoId}"
      width="4.0"
      height="2.25"
      position="0 2.8 -2.6"
      material="shader: flat"
    ></a-video>
    <!-- garis aksen bawah layar -->
    <a-plane
      width="4.3"
      height="0.045"
      color="#78b7dc"
      position="0 0.7 -2.62"
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

  // Overlay terjadwal 3D: semua mode VR + mobile-360.
  // Mobile-flat memakai kartu DOM (mount dikosongkan), jadi tidak dibangun di sini.
  const timedOverlaysHtml = !isVr && isFlat
    ? ''
    : buildTimedOverlaysHtml(scenario, { isVr, isFlat });

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
        <a-camera ${cameraControls} wasd-controls-enabled="false"${isVr ? ' fov="65"' : ''}>
          ${cursor}
        </a-camera>
      </a-entity>

      ${worldBackButtonHtml}
      ${vrStartGateHtml}
      ${timedOverlaysHtml}
      ${quizHtml}
    </a-scene>
  `;
}
