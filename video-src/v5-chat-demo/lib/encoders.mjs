// H.264 encoder selection shared by render.mjs and patch.mjs (master), plus the delivery encoders of deliver.mjs (end).
//   x264  CPU, reference quality (CRF)          nvenc  NVIDIA GPU (driver must match the ffmpeg build)
//   qsv   Intel iGPU (Quick Sync)               mf     Windows Media Foundation hardware (fallback, lower quality)
//   auto  first that works (probed once per process with a tiny test encode): qsv -> nvenc -> x264 when the browser
//         draws on the discrete GPU (gpu 'high', default), nvenc -> qsv -> x264 otherwise: drawing and encoding then run
//         on different chips. Measured 30/09/2026 (RTX 3050 Laptop + Intel iGPU, 3D pilot, 1224 frames 1080p, 2 runs each):
//         NVIDIA draw + QSV 57.6 s, Intel draw + QSV 69.7 s, NVIDIA draw + NVENC 73.2 s, Intel draw + NVENC 74.6 s;
//         QSV SSIM 0.99752 / PSNR 53.7 vs NVENC 0.99737 / 51.9 against a near-lossless render; QSV files ~17 % larger.
// Quality follows the x264 CRF: measured on real ad footage (5 s, 1080p60, 29/09/2026), nvenc cq = crf + 5 and
// qsv global_quality = crf + 2 match x264 CRF 14 SSIM with ~1/9 of its CPU time (files 1.8-2.7x larger).
// nvenc preset p5 + lookahead 16 (30/09/2026, RTX 3050 Laptop, 8 s real 1080p): 74 fps vs 26 fps for p7 + lookahead 32,
// SSIM 0.99669 vs 0.99702, same file size; p7 made the NVENC engine the bottleneck of every render.
// VMAF re-calibration (02/10/2026, V9 30 s 1080p30 dark grainy master, references/delivery_compression.md): at equal
// VMAF, QSV gq 20 ≈ x264 CRF 14 (15.5 vs 13.0 Mbps, VMAF 98.3) and NVENC p7 cq 21 ≈ CRF 17, so the VMAF-equivalent
// mapping is closer to qsv gq = crf + 5…6 and nvenc cq = crf + 4…5. The master mapping below is deliberately UNCHANGED:
// the render output is the mezzanine/archive (QSV gq 16 = ~27 Mbps) and deliver.mjs derives the upload files.
// Raising the master's gq is an owner opt-in (gq 20–22 ≈ 10–15 Mbps mezzanine).
import { spawnSync } from 'node:child_process';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const BT709 = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];

export const ENCODERS = {
  x264: crf => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-tune', 'animation', '-pix_fmt', 'yuv420p', '-profile:v', 'high'],
  nvenc: crf => ['-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', String(crf + 5), '-b:v', '0',
    '-spatial-aq', '1', '-rc-lookahead', '16', '-bf', '3', '-pix_fmt', 'yuv420p', '-profile:v', 'high'],
  qsv: crf => ['-c:v', 'h264_qsv', '-preset', 'veryslow', '-global_quality', String(crf + 2), '-look_ahead', '1', '-pix_fmt', 'nv12', '-profile:v', 'high'],
  mf: () => ['-c:v', 'h264_mf', '-hw_encoding', '1', '-rate_control', 'quality', '-quality', '95', '-pix_fmt', 'nv12']
};

const probed = new Map();
export function works(name) {
  if (name === 'x264') return true;
  if (!probed.has(name)) {
    const r = spawnSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=0.2', ...ENCODERS[name](14), '-f', 'null', '-'], { encoding: 'utf8', timeout: 30000 });
    probed.set(name, r.status === 0);
  }
  return probed.get(name);
}

// Returns the encoder actually used. An explicit choice that does not work falls back to x264 with a warning
// (a render never fails because a GPU is busy or a driver changed).
export function pickEncoder(pref = 'auto', { gpu = 'high' } = {}) {
  if (pref === 'auto') return (gpu === 'high' ? ['qsv', 'nvenc'] : ['nvenc', 'qsv']).find(works) || 'x264';
  if (!ENCODERS[pref]) throw new Error(`unknown encoder ${pref} (x264 | nvenc | qsv | mf | auto)`);
  if (works(pref)) return pref;
  console.warn(`encoder ${pref} is not usable on this machine; using x264`);
  return 'x264';
}

export const encodeArgs = (name, crf, fps) => [...ENCODERS[name](crf), ...BT709, '-r', String(fps)];

// ---- Delivery encoders (deliver.mjs): CPU encoders only — at equal VMAF the hardware encoders need +20 % (QSV H.264)
// to +75 % (NVENC H.264) more bitrate than x264 slow (benchmark 02/10/2026). q = CRF chosen by the VMAF-guarded search.
// o = { fps, gopSec, maxrateK, bufsizeK, threads }: maxrateK/bufsizeK add a VBV cap (capped CRF); threads limits one
// encode while several samples run in parallel. Video args only — deliver.mjs adds audio and +faststart.
const gopOf = o => Math.max(1, Math.round((o.gopSec || 2) * (o.fps || 30)));
const vbv = o => o.maxrateK ? ['-maxrate', `${Math.round(o.maxrateK)}k`, '-bufsize', `${Math.round(o.bufsizeK || 2 * o.maxrateK)}k`] : [];
const x264d = (preset, q, o) => ['-c:v', 'libx264', '-preset', preset, '-tune', 'animation', '-crf', String(q), ...vbv(o),
  '-g', String(gopOf(o)), '-keyint_min', String(Math.max(1, Math.round((o.fps || 30) / 2))), '-x264-params', 'open-gop=0',
  ...(o.threads ? ['-threads', String(o.threads)] : []), '-pix_fmt', 'yuv420p', '-profile:v', 'high'];
export const DELIVERY_ENCODERS = {
  // social upload file: H.264 High 8-bit, closed GOP (Meta 2–5 s, X no open GOP), VBV cap under IG 25 / LinkedIn 30 Mbps
  x264_social: (q, o = {}) => x264d('slow', q, o),
  // archive / re-delivery master when the render master came from QSV/NVENC (veryslow: −12 % vs slow at 2.5× the time)
  x264_archive: (q, o = {}) => x264d('veryslow', q, o),
  // small: HEVC Main10 — −37 % vs x264 at equal VMAF, 10-bit removes most banding (CAMBI 4.7 → 1.5–2); hvc1 for Apple
  x265_10bit: (q, o = {}) => ['-c:v', 'libx265', '-preset', 'slow', '-tune', 'animation', '-crf', String(q), ...vbv(o),
    '-g', String(gopOf(o)), '-keyint_min', String(Math.max(1, Math.round(o.fps || 30))),
    '-x265-params', `aq-mode=3:no-sao=1:log-level=error${o.threads ? `:pools=${o.threads}` : ''}`,
    '-pix_fmt', 'yuv420p10le', '-profile:v', 'main10', '-tag:v', 'hvc1'],
  // small-av1: SVT-AV1 preset 5, 10-bit, library default tune (VQ tune 0 measured worse per VMAF) + variance boost
  svtav1_10bit: (q, o = {}) => ['-c:v', 'libsvtav1', '-preset', '5', '-crf', String(q), ...(o.maxrateK ? ['-maxrate', `${Math.round(o.maxrateK)}k`] : []),
    '-g', String(gopOf(o)), '-pix_fmt', 'yuv420p10le', '-svtav1-params', 'enable-variance-boost=1'],
  // compact: HEVC Main10 sized by deliver.mjs's two-pass size target (deliveryTargetArgs swaps the CRF for -b:v);
  // closed GOP (open-gop=0: every keyframe an IDR, every gopSec) like the H.264 social file. V9 16:9 30 s at 1820 kbps
  // video: VMAF 97.16 / CAMBI 1.47 vs x264 8-bit at the same size 95.64 / 6.66 (banding) — the reason it is 10-bit HEVC.
  x265_compact: (q, o = {}) => ['-c:v', 'libx265', '-preset', 'slow', '-tune', 'animation', '-crf', String(q), ...vbv(o),
    '-g', String(gopOf(o)), '-keyint_min', String(Math.max(1, Math.round(o.fps || 30))),
    '-x265-params', `aq-mode=3:no-sao=1:open-gop=0:log-level=error${o.threads ? `:pools=${o.threads}` : ''}`,
    '-pix_fmt', 'yuv420p10le', '-profile:v', 'main10', '-tag:v', 'hvc1']
};
export const DELIVERY_LIB = { x264_social: 'libx264', x264_archive: 'libx264', x265_10bit: 'libx265', svtav1_10bit: 'libsvtav1', x265_compact: 'libx265' };
// Size-target mode (deliver.mjs --target-mb, preset compact): the same video args with the CRF replaced by a bitrate
// for two-pass ABR (deliver.mjs adds -pass 1|2 -passlogfile). libx264 and libx265 only; SVT-AV1 and archive have none.
export const DELIVERY_TARGET = new Set(['x264_social', 'x265_10bit', 'x265_compact']);
export function deliveryTargetArgs(name, kbps, o = {}) {
  if (!DELIVERY_TARGET.has(name)) throw new Error(`${name} has no size-target (two-pass) mode`);
  const a = deliveryArgs(name, 0, o), i = a.indexOf('-crf');
  a.splice(i, 2, '-b:v', `${Math.round(kbps)}k`);
  return a;
}

let encoderList = null;
/** True when this ffmpeg build has the delivery encoder's library (libsvtav1 is missing from some builds). */
export function deliveryEncoderAvailable(name) {
  if (encoderList === null) encoderList = spawnSync(FFMPEG, ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout || '';
  return new RegExp(`\\s${DELIVERY_LIB[name]}\\s`).test(encoderList);
}
export const deliveryArgs = (name, q, o = {}) => [...DELIVERY_ENCODERS[name](q, o), ...BT709];
