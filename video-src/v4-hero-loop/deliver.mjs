// kr-motion-video delivery step: derives small platform upload files from the built masters <Name>_<aspect>.mp4
// (read-only) with a VMAF-guarded CRF search, rebuilds the AAC from music.wav under a true-peak-safe limiter, and
// self-verifies every file into qa/<Name>_<aspect>_<preset>_deliver.json. Spec + measurements:
// references/delivery_compression.md. Run AFTER build.mjs, never next to a render (it uses every CPU core).
//   node deliver.mjs [--preset social,small|compact|all] [--variant all|16x9,9x16] [--target-vmaf 95] [--floor 90] [--max-mb N]
//                    [--target-mb N] [--fast] [--threads N] [--jobs N] [--samples 4] [--sample-sec 3] [--force] [--dry-run]
//                    [--cambi-delta D] [--lufs-tol 0.3] [--keep-temp] [--nice] [--json] [--project <dir>]
// Presets  social     H.264 High 8-bit + AAC 192k, 2 s closed GOP, maxrate 20M: ONE upload file per aspect for YouTube/
//                     Shorts, IG, FB, TikTok, LinkedIn, X (VMAF >= 95, 1 %-low >= 90, CAMBI banding guard with
//                     cambiDelta 2 = size priority, owner 02/10/2026; --cambi-delta 1 = quality first for key uploads)
//          small      HEVC Main10 hvc1 + AAC 128k: Zalo / Messenger / WhatsApp / e-mail (VMAF >= 93, 1 %-low >= 88)
//          compact    HEVC Main10 hvc1 + AAC 128k at a SIZE TARGET (owner 02/10/2026: ~7 MB per 30 s, no visible loss on
//                     social platforms): two-pass ABR, default 7 MB per 30 s of master (scaled by duration), opt-in
//          small-av1  SVT-AV1 10-bit (web embeds, Android 10+) · small-h264 (legacy players)
//          archive    x264 veryslow CRF 16 + AAC 256k, only when the master is a QSV/NVENC/MF encode (--force: always)
// Size-target mode (compact always; social / small / small-h264 with --target-mb or deliver[.<preset>].targetMb): MB =
// MiB (1,048,576 bytes, as Windows shows sizes); video kbps = (N MiB * 8 / duration - audio bps) * (1 - 1.5 % container);
// muxed size <= N * 1.02 or ONE proportional pass-2 retry; the full file is scored once: PASS VMAF >= 96, 1 %-low >= 90,
// CAMBI <= max(master + 2, 5); WARN VMAF 93-96 or a 1 %-low / CAMBI miss ("content too complex", suggested size);
// FAIL VMAF < 93 or size still over (only *.FAILED.mp4, exit 1). Size has priority; quality is reported, not chased.
// video.config.json may pin { "deliver": { "presets": ["social","small"], "small": { "target": 93, "maxMB": 25 },
//                                          "compact": { "targetMb": 7 }, "targetMb": N (every preset in the run) } }.
// Search: N sample windows (FFV1, frame-exact): the master's worst-CAMBI window (cheap whole-file CAMBI pass, 8-bit
// presets), the most expensive seconds, then evenly spread; cut once per aspect,
// encoded + scored in parallel; interpolated search for the HIGHEST CRF that passes, seeded by the previous aspect or
// report; then ONE full encode and ONE full-file VMAF (n_subsample) vs the master. No CRF passes -> safest CRF + WARN.
// A full-file miss or platform-limit breach -> FAIL: the file is kept only as <out>.FAILED.mp4, never under the
// delivery name, and the exit code is 1 (2 = usage error). --json: summary JSON on stdout, progress on stderr.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const has = k => argv.includes('--' + k);
const J = has('json'), FAST = has('fast'), FORCE = has('force'), DRY = has('dry-run'), KEEP = has('keep-temp'), NICE = has('nice'); // --nice: below-normal priority (on hybrid CPUs Windows then parks ffmpeg on E-cores: ~5x slower)
const say = (...a) => (J ? console.error : console.log)(...a);
const usage = msg => { console.error('deliver: ' + msg); process.exit(2); };
for (const a of argv) { const m = /^--([^=]+)=(.*)$/.exec(a); if (m) usage(`${a}: use --${m[1]} ${m[2]} (the --name=value form is not read)`); }
const PROJECT = path.resolve(opt('project', process.cwd()));
if (!fs.existsSync(path.join(PROJECT, 'video.config.json'))) usage(`missing ${path.join(PROJECT, 'video.config.json')}`);
const CFG = JSON.parse(fs.readFileSync(path.join(PROJECT, 'video.config.json'), 'utf8')), DCFG = CFG.deliver || {};
// VERSION feeds the up-to-date hash and stays at /2 (CRF-mode output unchanged by 2.1); TOOL is what the JSON reports
const FFMPEG = process.env.FFMPEG || 'ffmpeg', FFPROBE = process.env.FFPROBE || 'ffprobe', VERSION = 'deliver.mjs/2 (2026-10-02)', TOOL = 'deliver.mjs/2.1 (2026-10-02, compact + size target)';
const enc = await import(pathToFileURL(path.join(HERE, 'lib', 'encoders.mjs')).href);
if (!enc.DELIVERY_ENCODERS) usage(`${path.join(HERE, 'lib', 'encoders.mjs')} predates deliver.mjs: copy scripts/lib/encoders.mjs from the kr-motion-video skill, or run the skill's deliver.mjs with --project`);
// loudness targets exactly as qa.mjs reads them (audio.class + explicit lufs/tp); EQ/LRA as build.mjs uses them
const CLASS = { social: { lufs: -14, tp: -1.5 }, r128: { lufs: -23, tp: -1.5 }, atsc: { lufs: -24, tp: -2.5 }, 'stream-music': { lufs: -16, tp: -1.5 }, 'stream-speech': { lufs: -18, tp: -1.5 } };
let audioTargets = (a = {}, aud) => Object.assign({}, CLASS[a.class || 'social'] || CLASS.social, aud === 'kids' && !a.eq ? { eq: 'highpass=f=30,lowshelf=f=90:g=-2' } : {}, a);
let loadTimeline = null;
try { ({ audioTargets, loadTimeline } = await import(pathToFileURL(path.join(HERE, 'lib', 'synth.mjs')).href)); } catch { /* keep the local copy */ }
let AUDIENCE = CFG.audience; // same convention as qa.mjs / measure.mjs: TL.audience || CFG.audience ('kids' drops the 5 kHz shelf)
try { if (loadTimeline && fs.existsSync(path.join(PROJECT, 'timeline.js'))) AUDIENCE = loadTimeline(PROJECT).audience || CFG.audience; } catch { /* no timeline: config only */ }
const A = Object.assign({ wav: 'music.wav', eq: 'highpass=f=30,lowshelf=f=90:g=-2,highshelf=f=5000:g=3', lra: 11 }, audioTargets(CFG.audio || {}, AUDIENCE === 'kids' ? 'kids' : undefined));
const TP_MAX = A.tp + 0.5;                                      // qa.mjs true_peak gate (-1.0 dBTP for the social class)
const TP_CEIL = +(DCFG.tpCeiling ?? Math.min(-2.0, A.tp - 0.5)); // first limiter ceiling, measured on 4x oversampled audio
const LUFS_TOL = +(opt('lufs-tol') ?? DCFG.lufsTol ?? 0.3);      // the encoded AAC must land at target +-LUFS_TOL
if (!Number.isFinite(LUFS_TOL) || LUFS_TOL <= 0) usage(`--lufs-tol / deliver.lufsTol must be a number > 0 (got ${opt('lufs-tol') ?? DCFG.lufsTol})`);
const MAX_MAKEUP = 6; // dB: more positive make-up gain than this means the mix needs fixing, not the delivery (WARN)

// Ingest limits (official docs read 2026-10-02 unless marked secondary; table in references/delivery_compression.md).
const PLATFORMS = {
  youtube: { name: 'YouTube / Shorts', codecs: ['h264', 'hevc'], fps: [1, 60] }, // H.264 recommended; HEVC is an accepted upload format (compact)
  ig_reels: { name: 'Instagram Reels', codecs: ['h264', 'hevc'], maxMB: 300, maxKbps: 25000, fps: [23, 60], dur: [3, 900], maxW: 1920 },
  ig_story: { name: 'Instagram Stories', codecs: ['h264', 'hevc'], maxMB: 100, maxKbps: 25000, fps: [23, 60], dur: [0, 60], maxW: 1920 },
  fb_reels: { name: 'Facebook Reels', codecs: ['h264', 'hevc', 'vp9', 'av1'], fps: [24, 60], dur: [3, 90] },
  tiktok: { name: 'TikTok', codecs: ['h264', 'hevc', 'vp8', 'vp9'], maxMB: 4096, fps: [23, 60], dur: [0, 600], side: [360, 4096] },
  linkedin: { name: 'LinkedIn', codecs: ['h264', 'vp8', 'vp9'], maxMB: 5120, minKbps: 192, maxKbps: 30000, fps: [10, 60], dur: [3, 600] },
  x: { name: 'X', codecs: ['h264'], pix: ['yuv420p'], maxMB: 8192, fps: [1, 60], dur: [0, 1200] },
  zalo: { name: 'Zalo in-chat video [secondary]', maxMB: 100 },
  messenger: { name: 'Messenger attachment [secondary]', maxMB: 25 },
  whatsapp: { name: 'WhatsApp document [secondary]', maxMB: 2048 }
};
// q range / start / VMAF slope per CRF (search step estimate) from the 02/10/2026 sweep; hard = platforms whose
// format/size/bitrate limits FAIL the file (duration misfits WARN), soft = listed for information. cambiDelta = banding
// tolerance (CAMBI <= max(master + cambiDelta, 5)): social 2 = size priority (owner 02/10/2026: V9 16:9 15.6 MB vs
// 28.4 MB at 1); the others keep 1 (10-bit small/small-av1 never bind: CAMBI ~1.9 vs master 3-4; small-h264 opt-in,
// unmeasured); archive uses its own master + 0.5.
const PRESETS = {
  social: { enc: 'x264_social', cambiDelta: 2, codec: 'h264', bits: 8, lo: 16, hi: 26, start: 20, slope: 0.4, target: 95, audioK: 192, maxrateK: 20000, peakK: 20000, gopSec: 2, profile: /^High$/, tag: 'avc1', hard: ['youtube', 'ig_reels', 'fb_reels', 'tiktok', 'linkedin', 'x'], soft: ['ig_story', 'zalo', 'messenger'] },
  small: { enc: 'x265_10bit', codec: 'hevc', bits: 10, lo: 20, hi: 32, start: 26, slope: 0.45, target: 93, audioK: 128, maxrateK: 8000, peakK: 8000, gopSec: 5, profile: /Main 10/, tag: 'hvc1', hard: ['zalo'], soft: ['messenger', 'whatsapp'], fallback: 'small-h264' },
  'small-av1': { enc: 'svtav1_10bit', codec: 'av1', bits: 10, lo: 26, hi: 46, start: 36, slope: 0.2, target: 93, audioK: 128, peakK: 8000, gopSec: 5, hard: ['zalo'], soft: ['messenger', 'whatsapp'], fallback: 'small' },
  'small-h264': { enc: 'x264_social', codec: 'h264', bits: 8, lo: 18, hi: 30, start: 24, slope: 0.4, target: 93, audioK: 128, maxrateK: 8000, peakK: 8000, gopSec: 2, profile: /^High$/, tag: 'avc1', hard: ['zalo'], soft: ['messenger', 'whatsapp'] },
  // compact: always size-target mode (no CRF search); mbPer30 = default target per 30 s of master; closedGop = gop check strict
  compact: { enc: 'x265_compact', codec: 'hevc', bits: 10, mbPer30: 7, audioK: 128, gopSec: 2, closedGop: true, profile: /Main 10/, tag: 'hvc1', hard: ['youtube', 'ig_reels', 'fb_reels', 'tiktok'], soft: ['ig_story', 'zalo', 'messenger'] },
  archive: { enc: 'x264_archive', codec: 'h264', bits: 8, fixed: 16, target: 97, floor: 94, audioK: 256, gopSec: 2, cambiPlus: 0.5, profile: /^High$/, tag: 'avc1', hard: [], soft: [] }
};
// Size-target mode: gate on the full file (size has priority; quality is measured and reported honestly), MB = MiB.
const MIB = 1048576, OVERHEAD = 0.015, SIZE_TOL = 1.02;
const TGATE = { vmaf: 96, p1: 90, fail: 93, cambiDelta: 2 };
// Suggested size when the gate is missed: piecewise log-linear model of the VMAF deficit D = 100 - VMAF against video
// kbps, d ln D / d ln kbps = -e(D). V9 HEVC 10-bit two-pass: e = 0.55 near the top (full 16:9 file 1526 -> 1802k,
// D 3.3 -> 3.1; experiment 1400 -> 1820k: 0.56) and 1.0-1.2 lower down (7 s cut: 282k / 808k / 1800k -> VMAF
// 56.7 / 85.5 / 94.5). One constant slope fitted at the top over-suggested a far miss 6-8x; e(D) is interpolated in
// ln D between D 3.5 and 7, and the rate factor integrates 1 / e(D) from the target deficit to the measured one.
const deficitExp = D => D <= 3.5 ? 0.55 : D >= 7 ? 1.1 : 0.55 + 0.55 * Math.log(D / 3.5) / Math.log(2);
function rateFactor(dNow, dWant) {
  if (!(dNow > dWant)) return 1;
  const a = Math.log(dWant), b = Math.log(dNow), n = 64; let s = 0;
  for (let i = 0; i < n; i++) s += (b - a) / n / deficitExp(Math.exp(a + (b - a) * (i + 0.5) / n));
  return Math.exp(s);
}
const VARIANTS = Object.keys(CFG.variants || {});
const names = opt('variant', 'all') === 'all' ? VARIANTS : opt('variant').split(',');
for (const n of names) if (!CFG.variants?.[n]) usage(`unknown variant ${n} (${VARIANTS.join(', ')})`);
let presets = (opt('preset') || (DCFG.presets || ['social', 'small']).join(',')).split(',');
if (presets.includes('all')) presets = Object.keys(PRESETS);
for (const p of presets) if (!PRESETS[p]) usage(`unknown preset ${p} (${Object.keys(PRESETS).join(', ')}, all)`);
for (const [k, v] of [['--target-mb', has('target-mb') ? opt('target-mb', '') : undefined], ['deliver.targetMb', DCFG.targetMb], ...presets.map(p => [`deliver.${p}.targetMb`, DCFG[p]?.targetMb])])
  if (v !== undefined && v !== null && !(Number.isFinite(+v) && +v > 0)) usage(`${k} must be a finite number > 0 (MB = MiB; got ${typeof v === 'string' ? JSON.stringify(v) : String(v)})`);
if ((presets.some(p => PRESETS[p].mbPer30) || has('target-mb') || DCFG.targetMb != null || presets.some(p => DCFG[p]?.targetMb != null)) && !enc.DELIVERY_TARGET)
  usage(`${path.join(HERE, 'lib', 'encoders.mjs')} predates the size-target mode (compact, --target-mb): copy scripts/lib/encoders.mjs from the kr-motion-video skill, or run the skill's deliver.mjs with --project`);
const NEED_CAMBI = presets.some(p => PRESETS[p].bits === 8 && !PRESETS[p].fixed); // 8-bit searches use the CAMBI guard
const CORES = os.availableParallelism?.() || os.cpus().length, THREADS = Math.max(1, +opt('threads', CORES));
const NS = Math.max(1, +opt('samples', DCFG.samples || (FAST ? 3 : 4))), SS = Math.max(1, +opt('sample-sec', DCFG.sampleSec || (FAST ? 2 : 3)));
const JOBS = Math.max(1, Math.min(NS, +opt('jobs', 4))), JT = Math.max(1, Math.floor(THREADS / JOBS));
const SUB = 2, FULL_SUB = FAST ? 4 : 2, MAXP = FAST ? 4 : 6;
const QA_DIR = path.join(PROJECT, 'qa');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'krdeliver-'));
const sec = t => +((Date.now() - t) / 1000).toFixed(1);
const r2 = x => (x == null || !Number.isFinite(x)) ? x : +x.toFixed(2);

function run(cmd, args, cwd = TMP) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    if (NICE) try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not permitted: keep normal priority */ }
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; if (err.length > 4e6) err = err.slice(-1e6); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve({ out, err }) : reject(new Error(`${path.basename(cmd)} failed (exit ${code}) on ${path.basename(args[args.indexOf('-i') + 1] || '?')}: ${err.slice(-800)}`)));
  });
}
const ff = (args, cwd) => run(FFMPEG, ['-hide_banner', '-nostdin', '-y', '-v', 'error', ...args], cwd);
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const sha = (...parts) => { const h = crypto.createHash('sha1'); for (const p of parts) h.update(p); return h.digest('hex').slice(0, 16); };
function masterHash(f) {
  const st = fs.statSync(f), fd = fs.openSync(f, 'r'), b = Buffer.alloc(Math.min(1 << 20, st.size));
  fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
  return sha(`${st.size}:${Math.round(st.mtimeMs)}:`, b);
}
function topAtoms(f) { // MP4 top-level boxes; faststart = moov before mdat
  const fd = fs.openSync(f, 'r'), size = fs.fstatSync(fd).size, h = Buffer.alloc(16), atoms = [];
  for (let o = 0; o + 8 <= size && atoms.length < 64;) {
    fs.readSync(fd, h, 0, 16, o);
    let n = h.readUInt32BE(0); atoms.push(h.toString('latin1', 4, 8));
    if (n === 1) n = Number(h.readBigUInt64BE(8)); else if (n === 0) n = size - o;
    if (n < 8) break; o += n;
  }
  fs.closeSync(fd); return atoms;
}
function x265Gop(f) { // x265 writes its option string into an SEI of the first access unit: 'no-open-gop' = closed GOP
  const fd = fs.openSync(f, 'r'), b = Buffer.alloc(Math.min(4 << 20, fs.fstatSync(fd).size));
  fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
  return (b.toString('latin1').match(/ (no-)?open-gop /) || [''])[0].trim() || null;
}
function inspect(file) { // container/stream facts + per-second video bytes (complexity map / peak bitrate) + keyframes
  const pr = JSON.parse(spawnSync(FFPROBE, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '{}');
  const v = pr.streams?.find(s => s.codec_type === 'video'), a = pr.streams?.find(s => s.codec_type === 'audio');
  if (!v) throw new Error(`no video stream in ${file}`);
  const [fn, fd] = (v.r_frame_rate || '30/1').split('/').map(Number), dur = +(pr.format.duration || v.duration), size = +pr.format.size;
  const pk = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,size,flags', '-of', 'csv=p=0', file], { encoding: 'utf8', maxBuffer: 256 << 20 }).stdout.trim().split(/\r?\n/).map(l => l.split(','));
  const bytes = new Array(Math.max(1, Math.ceil(dur))).fill(0), keys = [];
  for (const [t, s, fl] of pk) { const i = Math.floor(+t); if (i >= 0 && i < bytes.length) bytes[i] += +s; if ((fl || '').includes('K')) keys.push(+t); }
  keys.sort((x, y) => x - y);
  const gaps = keys.map((k, i) => (i + 1 < keys.length ? keys[i + 1] : dur) - k);
  const atoms = topAtoms(file);
  return { pr, v, a, fps: `${fn}/${fd}`, fpsNum: fn / fd, dur, size, bytes, kbps: size * 8 / dur / 1000, videoKbps: bytes.reduce((x, y) => x + y, 0) * 8 / dur / 1000,
    peakKbps: Math.max(...bytes) * 8 / 1000, maxKeyint: gaps.length ? Math.max(...gaps) : dur, atoms, faststart: atoms.indexOf('moov') >= 0 && atoms.indexOf('moov') < atoms.indexOf('mdat'),
    encoder: v.tags?.encoder || pr.format.tags?.encoder || '' };
}
async function vmaf(dist, ref, { bits, fps, sub = 1, cambi = true, src = false, threads = THREADS, tag }) {
  const fmt = bits === 10 ? 'format=yuv420p10le' : 'format=yuv420p', log = `vmaf_${tag}.json`; // frame-index alignment on both sides
  const feat = cambi ? `:feature='name=cambi${src ? '\\:full_ref=true' : ''}'` : '';
  await ff(['-i', dist, '-i', ref, '-lavfi', `[0:v]${fmt},setpts=N/((${fps})*TB)[d];[1:v]${fmt},setpts=N/((${fps})*TB)[r];[d][r]libvmaf=model=version=vmaf_v0.6.1${feat}:n_threads=${threads}:n_subsample=${sub}:log_fmt=json:log_path=${log}:shortest=1`, '-f', 'null', '-']);
  const j = JSON.parse(fs.readFileSync(path.join(TMP, log), 'utf8')), v = j.frames.map(f => f.metrics.vmaf).sort((x, y) => x - y), pm = j.pooled_metrics;
  return { mean: pm.vmaf.mean, p1: v[Math.floor(0.01 * v.length)], min: v[0], frames: v.length, cambi: pm.cambi?.mean ?? null, src: pm.cambi_source?.mean ?? null };
}
async function loudness(file) { // identical parse to qa.mjs (ebur128 summary: integrated + true peak)
  const { err } = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const s = err.slice(err.lastIndexOf('Summary:'));
  return { lufs: parseFloat((s.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]), tp: parseFloat((s.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]) };
}

// Audio: rebuilt ONCE per bitrate from music.wav with build.mjs's EQ + two-pass linear loudnorm, then make-up gain and a
// limiter run at 4x oversampling (catches inter-sample peaks). The ENCODED AAC is measured and the loop corrects both:
// AAC's band limit loses loudness (V9 cut: PCM -14.2, 320k -14.5, 192k -15.2, 128k -15.8 LUFS) -> gain += target - I;
// codec overshoot raises true peak -> ceiling -= overshoot + 0.2 dB. Stops when I is within +-LUFS_TOL and TP <= TP_MAX
// - 0.1 (<= 6 tries; otherwise the closest TP-safe try ships and the loudness gate decides). Re-encoding the master's AAC
// instead raised true peak from -1.8 to -0.7 dBTP (benchmark), which fails qa.mjs.
const audioCache = new Map();
const deliveryAudio = (kbps, master) => { if (!audioCache.has(kbps)) audioCache.set(kbps, buildAudio(kbps, master)); return audioCache.get(kbps); };
let LN = null;
async function buildAudio(kbps, master) {
  const t0 = Date.now(), wav = path.join(PROJECT, A.wav), fromWav = fs.existsSync(wav);
  if (!fromWav && !inspect(master).a) return null;
  let pre = 'anull';
  if (fromWav) {
    if (!LN) {
      const { err } = await run(FFMPEG, ['-hide_banner', '-nostats', '-i', wav, '-af', `${A.eq},loudnorm=I=${A.lufs}:TP=${A.tp}:LRA=${A.lra}:print_format=json`, '-f', 'null', '-']);
      const m = JSON.parse(err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1));
      LN = `loudnorm=I=${A.lufs}:TP=${A.tp}:LRA=${A.lra}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    }
    pre = `${A.eq},${LN}`;
  }
  const tries = []; let ceil = TP_CEIL, gain = 0, best = null, last = null, capped = false;
  for (let k = 0; k < 6; k++) {
    const file = path.join(TMP, `audio_${kbps}k_${k}.m4a`);
    await ff(['-i', fromWav ? wav : master, '-vn', '-af', `${pre},volume=${gain.toFixed(2)}dB,aresample=192000,alimiter=limit=${Math.pow(10, ceil / 20).toFixed(4)}:attack=1:release=60:level=false,aresample=48000`,
      '-c:a', 'aac', '-b:a', `${kbps}k`, '-ar', '48000', '-ac', '2', file]);
    const m = await loudness(file), okTp = m.tp <= TP_MAX - 0.1, okI = Math.abs(m.lufs - A.lufs) <= LUFS_TOL + 1e-6;
    last = { file, gain, ceil, lufs: m.lufs, tp: m.tp }; tries.push({ gain_db: r2(gain), ceiling: r2(ceil), lufs: m.lufs, tp: m.tp });
    if (okTp && (!best || Math.abs(m.lufs - A.lufs) < Math.abs(best.lufs - A.lufs))) best = last;
    if (okTp && okI) break;
    if (!okTp) ceil -= m.tp - (TP_MAX - 0.1) + 0.2;
    if (!okI) { gain += A.lufs - m.lufs; if (gain > MAX_MAKEUP) { gain = MAX_MAKEUP; if (capped) break; capped = true; } } // one try at the cap, then stop
  }
  const pick = best || last;
  return { file: pick.file, source: fromWav ? path.basename(wav) : 'master AAC (no music.wav)', kbps, compensation_db: r2(pick.gain), ceiling: r2(pick.ceil),
    converged: !!best && Math.abs(pick.lufs - A.lufs) <= LUFS_TOL + 1e-6, makeup_capped: capped, eq: fromWav ? A.eq : null, audience: AUDIENCE || null, tries, secs: sec(t0) };
}

// ---------------------------------------------------------------- per aspect: analyse the master, cut samples once
async function prepareVariant(name) {
  const t0 = Date.now(), master = path.join(PROJECT, `${CFG.name}_${name}.mp4`);
  if (!fs.existsSync(master)) return { name, master, missing: true };
  const info = inspect(master), dur = info.dur;
  const N = Math.max(1, Math.min(NS, Math.floor(dur / SS))), S = Math.min(SS, dur), windows = [];
  const V = { name, master, info, hash: masterHash(master), hw: /qsv|nvenc|_mf|amf|videotoolbox|vaapi/i.test(info.encoder), windows, S, cambiFull: {}, t: { analyse: sec(t0), samples: 0 } };
  let cut = null; // windows + FFV1 cuts: made on the first probe only (an up-to-date or fixed-q run never pays for them)
  V.refs = () => cut || (cut = (async () => {
    const t1 = Date.now(), free = st => st >= 0 && st + S <= dur + 1e-6 && windows.every(w => st + S <= w || st >= w + S);
    if (NEED_CAMBI) { // 1. the master's worst-banding window, from a cheap no-reference CAMBI pass (every ~6th frame)
      const step = Math.max(1, Math.round(info.fpsNum / 5)), log = `cambimap_${name}.json`;
      await ff(['-i', master, '-lavfi', `[0:v]format=yuv420p,split[d][r];[d][r]libvmaf=model=version=vmaf_v0.6.1:feature='name=cambi':n_threads=${THREADS}:n_subsample=${step}:log_fmt=json:log_path=${log}`, '-f', 'null', '-']);
      const pts = JSON.parse(fs.readFileSync(path.join(TMP, log), 'utf8')).frames.map(fr => [fr.frameNum / info.fpsNum, fr.metrics.cambi]);
      let best = null;
      for (let st = 0; st + S <= dur + 1e-6; st += 0.25) {
        const v = pts.filter(([t]) => t >= st && t < st + S).map(p => p[1]); if (!v.length) continue;
        const m = v.reduce((x, y) => x + y, 0) / v.length; if (!best || m > best.mean) best = { st: +st.toFixed(2), mean: m };
      }
      if (best) { windows.push(best.st); V.cambiWindow = { start: best.st, end: r2(best.st + S), master_cambi: r2(best.mean), frames_scored: pts.length }; }
    }
    const nCost = windows.length + Math.ceil((N - windows.length) / 2); // 2. the most expensive seconds (packet bytes)
    for (const [, i] of info.bytes.map((x, i) => [x, i]).sort((x, y) => y[0] - x[0])) {
      if (windows.length >= nCost) break;
      const st = +Math.max(0, Math.min(dur - S, i + 0.5 - S / 2)).toFixed(3); if (free(st)) windows.push(st);
    }
    for (let j = 0, rest = N - windows.length; j < rest; j++) { // 3. the rest evenly spread: nearest free start to the ideal
      const want = (dur - S) * (j + 0.5) / rest;
      for (let d = 0; d <= dur; d += 0.1) { const st = [want - d, want + d].map(x => +x.toFixed(3)).find(free); if (st !== undefined) { windows.push(st); break; } }
    }
    windows.sort((x, y) => x - y); fs.mkdirSync(path.join(TMP, name), { recursive: true });
    say(`  samples ${windows.map(w => `${w}+${S}s`).join(' ')}${V.cambiWindow ? ` (worst-CAMBI window ${V.cambiWindow.start}s, master CAMBI ${V.cambiWindow.master_cambi})` : ''}`);
    const r = await pool(windows, JOBS, (st, k) => { const f = path.join(name, `ref${k}.mkv`); return ff(['-ss', String(st), '-i', master, '-t', String(S), '-an', '-c:v', 'ffv1', '-threads', String(JT), f]).then(() => f); });
    V.t.samples = sec(t1); return r;
  })());
  return V;
}

// ---------------------------------------------------------------- one deliverable
const SEEDS = new Map();
function platformFit(id, info, codec) {
  const p = PLATFORMS[id], v = info.v, mb = info.size / 1e6, issues = [];
  if (p.codecs && !p.codecs.includes(codec)) issues.push({ kind: 'format', why: `codec ${codec} not in ${p.codecs.join('/')}` });
  if (p.pix && !p.pix.includes(v.pix_fmt)) issues.push({ kind: 'format', why: `pix_fmt ${v.pix_fmt}` });
  if (p.maxMB && mb > p.maxMB) issues.push({ kind: 'size', why: `${mb.toFixed(1)} MB > ${p.maxMB} MB` });
  if (p.maxKbps && info.kbps > p.maxKbps) issues.push({ kind: 'bitrate', why: `${Math.round(info.kbps)} kbps > ${p.maxKbps}` });
  if (p.minKbps && info.kbps < p.minKbps) issues.push({ kind: 'bitrate', why: `${Math.round(info.kbps)} kbps < ${p.minKbps}` });
  if (p.fps && (info.fpsNum < p.fps[0] || info.fpsNum > p.fps[1])) issues.push({ kind: 'format', why: `${r2(info.fpsNum)} fps outside ${p.fps.join('-')}` });
  if (p.maxW && v.width > p.maxW) issues.push({ kind: 'format', why: `width ${v.width} > ${p.maxW}` });
  if (p.side && (Math.min(v.width, v.height) < p.side[0] || Math.max(v.width, v.height) > p.side[1])) issues.push({ kind: 'format', why: `side outside ${p.side.join('-')} px` });
  if (p.dur && (info.dur < p.dur[0] || info.dur > p.dur[1])) issues.push({ kind: 'duration', why: `${r2(info.dur)} s outside ${p.dur.join('-')} s` });
  return { id, name: p.name, fit: !issues.length, issues };
}
// Size target of one deliverable (null = CRF mode). Precedence: --target-mb > deliver.<preset>.targetMb >
// deliver.targetMb > the preset's default (compact: 7 MB per 30 s of master). MB = MiB.
function sizeTarget(V, pname) {
  const P = PRESETS[pname], pc = DCFG[pname] || {}, dur = V.info.dur;
  const [src, raw] = has('target-mb') ? ['--target-mb', opt('target-mb')] : pc.targetMb != null ? [`deliver.${pname}.targetMb`, pc.targetMb]
    : DCFG.targetMb != null ? ['deliver.targetMb', DCFG.targetMb] : P.mbPer30 ? [`default ${P.mbPer30} MB per 30 s x ${r2(dur)} s`, P.mbPer30 * dur / 30] : [];
  if (!src) return null;
  if (!enc.DELIVERY_TARGET.has(P.enc)) { say(`  note: ${pname} has no size-target mode (${src} ignored: ${P.fixed ? 'fixed CRF' : 'CRF search'})`); return null; }
  const mb = r2(+raw), audioBps = fs.existsSync(path.join(PROJECT, A.wav)) || V.info.a ? P.audioK * 1000 : 0, totalBps = mb * MIB * 8 / dur;
  return { mb, src, bytes: mb * MIB, totalK: Math.round(totalBps / 1000), videoK: Math.round((totalBps - audioBps) * (1 - OVERHEAD) / 1000), audioBps };
}
async function deliverOne(V, pname) {
  const P = PRESETS[pname], pc = DCFG[pname] || {}, T0 = Date.now(), t = { search: 0, audio: 0, encode: 0, verify: 0, qa: 0 };
  const base = `${CFG.name}_${V.name}_${pname}`, out = path.join(PROJECT, base + '.mp4'), part = path.join(PROJECT, base + '.part.mp4');
  const failed = path.join(PROJECT, base + '.FAILED.mp4'), qaFile = path.join(QA_DIR, base + '_deliver.json');
  const TG = sizeTarget(V, pname); // size-target mode (two-pass ABR, full-file gate TGATE) when not null
  const target = TG ? +(opt('target-vmaf') ?? opt('target') ?? TGATE.vmaf) : +(opt('target-vmaf') ?? opt('target') ?? pc.target ?? P.target);
  const floor = TG ? +(opt('floor') ?? TGATE.p1) : +(opt('floor') ?? pc.floor ?? P.floor ?? target - 5), failBelow = Math.min(TGATE.fail, target - 3);
  const cd = +(opt('cambi-delta') ?? pc.cambiDelta ?? DCFG.cambiDelta ?? (TG ? TGATE.cambiDelta : P.cambiDelta) ?? 1); // banding tolerance: CAMBI <= max(master + cd, 5)
  const userMB = +(opt('max-mb') ?? pc.maxMB ?? NaN), capMB = Math.min(...[userMB, ...P.hard.map(h => PLATFORMS[h].maxMB)].filter(Number.isFinite));
  const capKbps = Math.min(...P.hard.map(h => PLATFORMS[h].maxKbps).filter(Number.isFinite));
  const fps = V.info.fps, o = { fps: V.info.fpsNum, gopSec: P.gopSec, maxrateK: P.maxrateK };
  const presetHash = TG ? sha(JSON.stringify({ TOOL, mode: 'target', a: enc.deliveryTargetArgs(P.enc, TG.videoK, o), target_mb: TG.mb, target, floor, failBelow, cd, capMB, audioK: P.audioK, A, TP_CEIL, LUFS_TOL }))
    : sha(JSON.stringify({ VERSION, a: enc.deliveryArgs(P.enc, 0, o), target, floor, capMB, audioK: P.audioK, A, TP_CEIL, LUFS_TOL, ...(cd !== 1 ? { cd } : {}) }));
  const prev = fs.existsSync(qaFile) ? (() => { try { return JSON.parse(fs.readFileSync(qaFile, 'utf8')); } catch { return null; } })() : null;
  const res = { variant: V.name, preset: pname, file: path.relative(PROJECT, out) };
  if (TG && !DRY) say(`  ${pname}: size target ${TG.mb} MB (MiB; ${TG.src}) = ${TG.totalK} kbps total -> video ${TG.videoK} kbps two-pass + AAC ${TG.audioBps / 1000}k`);
  if (!FORCE && prev && prev.master?.hash === V.hash && prev.preset_hash === presetHash && prev.status !== 'FAIL' && fs.existsSync(out) && fs.statSync(out).size === prev.size) {
    say(`  ${pname}: up to date (${prev.mb} MB, ${prev.target_mb != null ? `${prev.mib} MiB for a ${prev.target_mb} MiB target` : `q=${prev.q}`}, VMAF ${prev.vmaf?.mean}); --force to redo`); if (!P.fixed) SEEDS.set(pname, prev.q);
    return Object.assign(res, { status: prev.status, skipped: true, mb: prev.mb, q: prev.q, vmaf: prev.vmaf?.mean, p1: prev.vmaf?.p1, cambi: prev.cambi, tp: prev.audio?.tp, ...(prev.target_mb != null ? { mib: prev.mib, target_mb: prev.target_mb, video_kbps: prev.video_kbps } : {}) });
  }
  if (P.fixed && !V.hw && !FORCE) { say(`  ${pname}: skipped, master is already a software encode (${V.info.encoder || 'unknown encoder'}); --force writes it anyway`); return Object.assign(res, { status: 'SKIP' }); }
  if (TG && TG.videoK < 50) { say(`  FAIL ${pname}: a ${TG.mb} MiB target over ${r2(V.info.dur)} s leaves ${TG.videoK} kbps for video (< 50): raise --target-mb`); return Object.assign(res, { status: 'FAIL', error: `target ${TG.mb} MiB too small (${TG.videoK} kbps video)` }); }
  const seed = Math.min(P.hi ?? 99, Math.max(P.lo ?? 0, Math.round(SEEDS.get(pname) ?? prev?.q ?? P.start ?? P.fixed)));
  if (DRY && TG) {
    say(`  ${pname}: ${path.basename(V.master)} -> ${path.basename(out)}\n    target: ${TG.mb} MiB (${TG.src}) over ${r2(V.info.dur)} s = ${TG.totalK} kbps total -> video ${TG.videoK} kbps two-pass ABR + AAC ${TG.audioBps / 1000}k (container overhead ${OVERHEAD * 100} %)`
      + `\n    video: ${enc.deliveryTargetArgs(P.enc, TG.videoK, o).join(' ')} -pass 1|2\n    audio: ${A.wav} -> ${A.eq},loudnorm(2-pass, ${A.lufs} LUFS),alimiter@4x ${TP_CEIL} dBTP -> AAC ${P.audioK}k`
      + `\n    gate: size <= ${r2(TG.mb * SIZE_TOL)} MiB (target x ${SIZE_TOL}; over -> one proportional pass-2 retry, still over = FAIL); full file once (n_subsample ${FULL_SUB}): PASS VMAF >= ${target}, 1 %-low >= ${floor}, CAMBI <= max(master + ${cd}, 5); WARN VMAF ${failBelow}-${target} or a 1 %-low / CAMBI miss (ships, suggested size printed); FAIL VMAF < ${failBelow}; platform cap ${Number.isFinite(capMB) ? capMB + ' MB' : 'none'}`);
    return Object.assign(res, { status: 'DRY' });
  }
  if (DRY) { say(`  ${pname}: ${path.basename(V.master)} -> ${path.basename(out)}\n    video: ${enc.deliveryArgs(P.enc, P.fixed ?? seed, o).join(' ')}\n    audio: ${A.wav} -> ${A.eq},loudnorm(2-pass, ${A.lufs} LUFS),alimiter@4x ${TP_CEIL} dBTP -> AAC ${P.audioK}k\n    gate: VMAF >= ${target}, 1 %-low >= ${floor}, ${P.cambiPlus != null ? `CAMBI <= master + ${P.cambiPlus}` : `CAMBI <= max(master + ${cd}, 5)${P.bits === 8 ? ' per sample' : ' (full file)'} [cambi-delta ${cd}]`}, size cap ${Number.isFinite(capMB) ? capMB + ' MB' : 'none'}`); return Object.assign(res, { status: 'DRY' }); }
  // 1. search (sample windows, parallel encode + VMAF; CAMBI only for 8-bit, where it binds). The banding guard is per
  // sample, like with like: candidate CAMBI[k] <= max(master CAMBI[k] + 1, 5) in every window.
  // (size-target mode skips the search: the bitrate comes from the target, the full file is scored once)
  const ts = Date.now(), cache = new Map(), search = { seed, probes: [], status: 'PASS', cambi_delta: cd };
  let guards = null;
  const pass = r => r.worstMean >= target && r.worstP1 >= floor && (r.cambiExcess == null || r.cambiExcess <= 0);
  async function probe(q) {
    if (cache.has(q)) return cache.get(q);
    const tp0 = Date.now(), wantSrc = P.bits === 8 && !guards;
    const ms = await pool(await V.refs(), P.codec === 'av1' ? Math.min(2, JOBS) : JOBS, async (ref, k) => { // SVT-AV1 threads itself
      const f = path.join(V.name, `${pname}_s${k}_q${q}.mp4`);
      await ff(['-i', ref, ...enc.deliveryArgs(P.enc, q, Object.assign({}, o, { threads: JT })), '-an', f]);
      return Object.assign(await vmaf(f, ref, { bits: P.bits, fps, sub: SUB, cambi: P.bits === 8, src: wantSrc, threads: JT, tag: `${V.name}_${pname}_s${k}_q${q}` }), { bytes: fs.statSync(path.join(TMP, f)).size });
    });
    if (wantSrc) { guards = ms.map(m => Math.max(m.src + cd, 5)); search.master_cambi_samples = ms.map(m => r2(m.src)); search.cambi_guard_samples = guards.map(r2); }
    const r = { q, mean: ms.reduce((s, m) => s + m.mean, 0) / ms.length, worstMean: Math.min(...ms.map(m => m.mean)), worstP1: Math.min(...ms.map(m => m.p1)),
      cambi: P.bits === 8 ? Math.max(...ms.map(m => m.cambi)) : null, cambiExcess: P.bits === 8 ? Math.max(...ms.map((m, k) => m.cambi - guards[k])) : null,
      kbps: Math.round(ms.reduce((s, m) => s + m.bytes, 0) * 8 / (V.S * ms.length) / 1000), secs: sec(tp0) };
    r.pass = pass(r); cache.set(q, r);
    search.probes.push({ q, pass: r.pass, mean: r2(r.mean), worst_mean: r2(r.worstMean), worst_p1: r2(r.worstP1), cambi_samples: P.bits === 8 ? ms.map(m => r2(m.cambi)) : null, cambi_excess: r2(r.cambiExcess), kbps: r.kbps, secs: r.secs });
    say(`    probe q=${q}: worst-sample VMAF ${r.worstMean.toFixed(2)} p1 ${r.worstP1.toFixed(2)}${r.cambi != null ? ` CAMBI ${ms.map(m => m.cambi.toFixed(2)).join('/')} (worst vs guard ${r.cambiExcess >= 0 ? '+' : ''}${r.cambiExcess.toFixed(2)})` : ''} ~${r.kbps} kbps ${r.pass ? 'pass' : 'fail'} (${r.secs}s)`);
    return r;
  }
  const margin = r => Math.min((r.worstMean - target) / P.slope, (r.worstP1 - floor) / (2 * P.slope), r.cambiExcess == null ? Infinity : -r.cambiExcess / 0.2); // in CRF steps
  let q = TG ? null : P.fixed ?? seed;
  if (!P.fixed && !TG) {
    let lo = P.lo, hi = P.hi;
    for (let n = 0; n < MAXP && lo <= hi; n++) {
      const r = await probe(q);
      if (r.pass) lo = q + 1; else hi = q - 1;
      if (lo > hi) break;
      const pts = [...cache.values()].sort((x, y) => x.q - y.q), a = pts.filter(p => p.pass).pop(), b = pts.find(p => !p.pass && (!a || p.q > a.q));
      let next;
      if (a && b) { const ma = margin(a), mb = margin(b); next = a.q + Math.round((b.q - a.q) * ma / Math.max(1e-6, ma - mb)); }
      else if (a) next = a.q + Math.max(1, Math.min(4, Math.floor(margin(a))));
      else next = b.q - Math.max(1, Math.min(4, Math.ceil(-margin(b))));
      q = Math.min(hi, Math.max(lo, next));
    }
    const best = [...cache.values()].filter(r => r.pass).sort((x, y) => y.q - x.q)[0];
    if (best) q = best.q; else { q = P.lo; search.status = 'WARN'; say(`    WARN no CRF in ${P.lo}-${P.hi} met the sample guard (VMAF ${target}, p1 ${floor}${P.bits === 8 ? `, CAMBI master + ${cd} per sample` : ''}); using the safest q=${q}`); }
    SEEDS.set(pname, q);
  }
  t.search = sec(ts);
  // 2. audio (cached per bitrate) + full encode + ONE full-file VMAF vs the master; step back <= 2 CRF on a miss
  let ta = Date.now(); const audio = await deliveryAudio(P.audioK, V.master); t.audio = sec(ta);
  const minQ = P.fixed ? P.fixed - 2 : P.lo, extra = {}, encodeFull = async qq => {
    const te = Date.now();
    // no -shortest: with libx265's encoder delay it dropped the last frame (899/900). The picture is pinned to the master's
    // frame count and the audio input is trimmed to the picture's duration instead.
    const nf = +V.info.v.nb_frames, vdur = Number.isFinite(nf) && nf > 0 ? nf / V.info.fpsNum : V.info.dur;
    await ff(['-i', V.master, ...(audio ? ['-t', vdur.toFixed(6), '-i', audio.file] : []), '-map', '0:v:0', ...(audio ? ['-map', '1:a:0', '-c:a', 'copy'] : ['-an']),
      ...(Number.isFinite(nf) && nf > 0 ? ['-frames:v', String(nf)] : []),
      ...enc.deliveryArgs(P.enc, qq, Object.assign({}, o, extra, { threads: THREADS })), '-movflags', '+faststart', '-f', 'mp4', part]);
    t.encode += sec(te);
    const tv = Date.now(), wantSrc = V.cambiFull[P.bits] == null;
    const m = await vmaf(part, V.master, { bits: P.bits, fps, sub: FULL_SUB, cambi: true, src: wantSrc, threads: THREADS, tag: `${V.name}_${pname}_full_q${qq}` });
    if (wantSrc) V.cambiFull[P.bits] = m.src;
    t.verify += sec(tv); say(`    full q=${qq}${extra.maxrateK ? ` maxrate ${Math.round(extra.maxrateK)}k` : ''}: VMAF ${m.mean.toFixed(2)} p1 ${m.p1.toFixed(2)} min ${m.min.toFixed(2)} CAMBI ${m.cambi.toFixed(2)}`);
    return m;
  };
  // size-target mode: pass 1 (stats only) + pass 2 (muxed like encodeFull); muxed size > target x SIZE_TOL -> the video
  // bitrate is lowered by the excess share of the video bytes and pass 2 runs ONCE more on the same first-pass stats;
  // then ONE full-file VMAF/CAMBI vs the master
  const TR = TG ? { video_kbps: TG.videoK, passes: 0, size_retry: null } : null, encodeTarget = async () => {
    const nf = +V.info.v.nb_frames, vdur = Number.isFinite(nf) && nf > 0 ? nf / V.info.fpsNum : V.info.dur, pin = Number.isFinite(nf) && nf > 0 ? ['-frames:v', String(nf)] : [];
    const targs = kbps => enc.deliveryTargetArgs(P.enc, kbps, Object.assign({}, o, { threads: THREADS })), plog = `pass_${V.name}_${pname}`; // stats in TMP (cwd)
    const pass2 = async kbps => {
      const te = Date.now();
      await ff(['-i', V.master, ...(audio ? ['-t', vdur.toFixed(6), '-i', audio.file] : []), '-map', '0:v:0', ...(audio ? ['-map', '1:a:0', '-c:a', 'copy'] : ['-an']), ...pin,
        ...targs(kbps), '-pass', '2', '-passlogfile', plog, '-movflags', '+faststart', '-f', 'mp4', part]);
      t.encode += sec(te); TR.passes++; return inspect(part);
    };
    const te = Date.now();
    await ff(['-i', V.master, '-map', '0:v:0', '-an', ...pin, ...targs(TG.videoK), '-pass', '1', '-passlogfile', plog, '-f', 'null', '-']);
    t.encode += sec(te); TR.passes++;
    let fi = await pass2(TG.videoK);
    say(`    two-pass video ${TG.videoK}k: ${(fi.size / MIB).toFixed(3)} MiB (target ${TG.mb}, limit ${(TG.mb * SIZE_TOL).toFixed(3)} MiB)`);
    if (fi.size > TG.bytes * SIZE_TOL) {
      const vBytes = fi.videoKbps * 125 * fi.dur, k2 = Math.max(50, Math.round(TG.videoK * Math.max(0.5, (vBytes - (fi.size - TG.bytes)) / vBytes) * 0.99));
      TR.size_retry = { first_mib: r2(fi.size / MIB), first_video_kbps: TG.videoK, video_kbps: k2, reason: `${(fi.size / MIB).toFixed(3)} MiB > ${(TG.mb * SIZE_TOL).toFixed(3)} MiB` };
      say(`    size retry: ${TR.size_retry.reason} -> video ${TG.videoK}k -> ${k2}k, pass 2 again (first-pass stats reused)`);
      TR.video_kbps = k2; fi = await pass2(k2);
      TR.size_retry.result_mib = r2(fi.size / MIB); say(`    after retry: ${(fi.size / MIB).toFixed(3)} MiB`);
    }
    const tv = Date.now(), wantSrc = V.cambiFull[P.bits] == null;
    const m = await vmaf(part, V.master, { bits: P.bits, fps, sub: FULL_SUB, cambi: true, src: wantSrc, threads: THREADS, tag: `${V.name}_${pname}_full_${TR.video_kbps}k` });
    if (wantSrc) V.cambiFull[P.bits] = m.src;
    t.verify += sec(tv); say(`    full ${TR.video_kbps}k: VMAF ${m.mean.toFixed(2)} p1 ${m.p1.toFixed(2)} min ${m.min.toFixed(2)} CAMBI ${m.cambi.toFixed(2)} (master ${r2(V.cambiFull[P.bits])})`);
    return m;
  };
  let m = TG ? await encodeTarget() : await encodeFull(q), tries = 0;
  while (!TG && (m.mean < target || m.p1 < floor) && q > minQ && tries < 2) { q -= 1; tries++; m = await encodeFull(q); }
  let info = inspect(part), remedy = null;
  // 3. platform caps: size / avg bitrate (hard platforms, --max-mb) and 1 s peak -> one capped re-encode, then re-verify
  // (not in size-target mode: the rate is already set by the target; the checks below still gate every cap)
  const overMB = Number.isFinite(capMB) && info.size / 1e6 > capMB, overPeak = P.peakK && info.peakKbps > P.peakK, overAvg = Number.isFinite(capKbps) && info.kbps > capKbps;
  if (!TG && (overMB || overPeak || overAvg)) {
    const audK = audio ? P.audioK : 0, fitK = Math.min(overMB ? capMB * 8000 / info.dur * 0.92 - audK : Infinity, overAvg ? capKbps * 0.9 - audK : Infinity, overPeak ? P.peakK * 0.8 : Infinity);
    remedy = { reason: [overMB && `size ${r2(info.size / 1e6)} MB > ${capMB} MB`, overAvg && `avg ${Math.round(info.kbps)} kbps > ${capKbps}`, overPeak && `1 s peak ${Math.round(info.peakKbps)} kbps > ${P.peakK}`].filter(Boolean).join('; '), maxrate_kbps: Math.round(fitK) };
    say(`    cap breach (${remedy.reason}) -> re-encode with maxrate ${Math.round(fitK)}k`);
    if (fitK >= 50) { Object.assign(extra, { maxrateK: fitK, bufsizeK: overPeak && !overMB && !overAvg ? fitK : 2 * fitK }); m = await encodeFull(q); info = inspect(part); }
    else remedy.result = 'cap needs < 50 kbps of video: not attempted';
  }
  // 4. self-verification (qa.mjs-style checks) on the exact file that would ship
  const tq = Date.now(), loud = audio ? await loudness(part) : null, v = info.v, a = info.a, M = V.info, checks = [];
  const add = (id, status, value, expected) => checks.push({ id, status, value, expected });
  const ok = (id, cond, value, expected, soft) => add(id, cond ? 'PASS' : soft ? 'WARN' : 'FAIL', value, expected);
  if (TG) { // size has priority: quality misses WARN (ship + suggested size), only VMAF < failBelow FAILs
    add('vmaf_vs_master', m.mean >= target ? 'PASS' : m.mean >= failBelow ? 'WARN' : 'FAIL', r2(m.mean), `>= ${target} (WARN ${failBelow}-${target}: content too complex for ${TG.mb} MB; FAIL < ${failBelow}; full file, n_subsample ${FULL_SUB})`);
    ok('vmaf_p1_vs_master', m.p1 >= floor, r2(m.p1), `>= ${floor} (WARN below: size target has priority)`, true);
  } else {
    add('vmaf_vs_master', m.mean >= target ? 'PASS' : m.mean >= target - 0.3 ? 'WARN' : 'FAIL', r2(m.mean), `>= ${target} (WARN within 0.3: n_subsample ${FULL_SUB})`);
    ok('vmaf_p1_vs_master', m.p1 >= floor, r2(m.p1), `>= ${floor}`);
  }
  add('vmaf_min', 'INFO', r2(m.min), 'worst frame (info)');
  const cg = P.cambiPlus != null ? V.cambiFull[P.bits] + P.cambiPlus : Math.max(V.cambiFull[P.bits] + cd, 5);
  ok('cambi_banding', m.cambi <= cg, r2(m.cambi), `<= ${r2(cg)} (master ${r2(V.cambiFull[P.bits])})${TG ? ' (WARN above: size target has priority)' : ''}`, !!TG);
  if (TG) {
    add('rate_control', 'INFO', `two-pass ABR, video ${TR.video_kbps} kbps, ${TR.passes} passes${TR.size_retry ? `, size retry from ${TR.size_retry.first_video_kbps}k (${TR.size_retry.reason})` : ''}`, `target ${TG.mb} MiB (${TG.src}) = ${TG.totalK} kbps total`);
    ok('target_size', info.size <= TG.bytes * SIZE_TOL, `${r2(info.size / MIB)} MiB (${r2(info.size / 1e6)} MB)`, `<= ${r2(TG.mb * SIZE_TOL)} MiB (target ${TG.mb} MiB x ${SIZE_TOL})`);
  } else add('search', P.fixed ? 'INFO' : search.status, P.fixed ? `fixed q=${q}` : `q=${q} after ${search.probes.length} probes`, P.fixed ? 'no search (archive)' : `highest CRF passing the sample guard in ${P.lo}-${P.hi}`);
  ok('size_limit', !Number.isFinite(capMB) || info.size / 1e6 <= capMB, `${r2(info.size / 1e6)} MB`, Number.isFinite(capMB) ? `<= ${capMB} MB${Number.isFinite(userMB) ? ' (declared cap)' : ''}` : 'no cap');
  ok('avg_bitrate', (!P.maxrateK || info.videoKbps <= P.maxrateK) && (!Number.isFinite(capKbps) || info.kbps <= capKbps), `${Math.round(info.kbps)} kbps (video ${Math.round(info.videoKbps)})`, `video <= ${P.maxrateK || '-'} kbps, total <= ${Number.isFinite(capKbps) ? capKbps : '-'} kbps`);
  ok('peak_bitrate_1s', !P.peakK || info.peakKbps <= P.peakK, `${Math.round(info.peakKbps)} kbps`, P.peakK ? `<= ${P.peakK} kbps` : 'no cap');
  ok('faststart', info.faststart, info.atoms.join(','), 'moov before mdat');
  const fmtOk = v.codec_name === P.codec && v.pix_fmt === (P.bits === 10 ? 'yuv420p10le' : 'yuv420p') && (!P.profile || P.profile.test(v.profile || '')) && (!P.tag || v.codec_tag_string === P.tag);
  ok('video_format', fmtOk, `${v.codec_name}/${v.profile}/${v.pix_fmt}/${v.codec_tag_string}`, `${P.codec}/${P.profile ? P.profile.source.replace(/[\^$]/g, '') : 'any'}/${P.bits === 10 ? 'yuv420p10le' : 'yuv420p'}/${P.tag || 'any'}`);
  const gopSei = P.closedGop && P.codec === 'hevc' ? x265Gop(part) : null; // closedGop presets: strict, and x265 must report no-open-gop
  ok('gop', info.maxKeyint <= P.gopSec + 1.5 / info.fpsNum && (!P.closedGop || P.codec !== 'hevc' || gopSei === 'no-open-gop'), `${r2(info.maxKeyint)} s max keyframe interval${gopSei ? `, x265 ${gopSei}` : ''}`, `<= ${P.gopSec} s, closed GOP`, P.codec !== 'h264' && !P.closedGop);
  ok('picture', v.width === M.v.width && v.height === M.v.height && Math.abs(info.fpsNum - M.fpsNum) < 0.01 && +v.nb_frames === +M.v.nb_frames,
    `${v.width}x${v.height} ${r2(info.fpsNum)} fps ${v.nb_frames} frames`, `${M.v.width}x${M.v.height} ${r2(M.fpsNum)} fps ${M.v.nb_frames} frames (master)`);
  ok('duration', Math.abs(info.dur - M.dur) <= 0.1, r2(info.dur), `${r2(M.dur)} ±0.1 s (master)`);
  if (audio) {
    ok('audio_format', a?.codec_name === 'aac' && a?.profile === 'LC' && +a?.sample_rate === 48000 && a?.channels === 2, `${a?.codec_name}/${a?.profile}/${a?.sample_rate}/${a?.channels}ch`, 'aac/LC/48000/2ch');
    const ak = Math.round(+a?.bit_rate / 1000); ok('audio_bitrate', ak >= P.audioK * 0.7 && ak <= P.audioK * 1.15, `${ak} kbps`, `${P.audioK} kbps (-30/+15 %)`, true);
    const dI = Math.abs(loud.lufs - A.lufs); // PASS within the loop tolerance, WARN up to the qa.mjs bound (+-1), FAIL beyond
    if (audio.makeup_capped) add('audio_makeup', 'WARN', `+${MAX_MAKEUP} dB cap reached`, `make-up gain <= +${MAX_MAKEUP} dB (a quieter mix needs fixing in the score, not here)`);
    add('integrated_loudness', dI <= LUFS_TOL + 0.05 ? 'PASS' : dI <= 1.0 ? 'WARN' : 'FAIL', loud.lufs, `${A.lufs} ±${LUFS_TOL} LUFS (WARN to ±1; make-up ${audio.compensation_db >= 0 ? '+' : ''}${audio.compensation_db} dB)`);
    ok('true_peak', loud.tp <= TP_MAX, loud.tp, `<= ${TP_MAX} dBTP (limiter ceiling ${audio.ceiling} dBTP @4x)`);
  } else add('audio', 'WARN', 'none', 'no music.wav and no audio in the master');
  const platforms = [...P.hard, ...P.soft].map(id => Object.assign(platformFit(id, info, P.codec), { role: P.hard.includes(id) ? 'target' : 'info' }));
  for (const p of platforms.filter(p => p.role === 'target' && !p.fit)) {
    const hardIssue = p.issues.some(i => i.kind !== 'duration');
    add(`platform_${p.id}`, hardIssue ? 'FAIL' : 'WARN', p.issues.map(i => i.why).join('; '), `${p.name} ingest limits`);
  }
  add('platform_fit', 'INFO', platforms.map(p => `${p.id}:${p.fit ? 'ok' : p.issues.map(i => i.kind).join('+')}`).join(' '), 'per-platform fit (info rows included)');
  t.qa = sec(tq);
  const status = checks.some(c => c.status === 'FAIL') ? 'FAIL' : checks.some(c => c.status === 'WARN') ? 'WARN' : 'PASS';
  // size-target quality miss -> suggested --target-mb: video kbps x rateFactor(measured deficit, wanted deficit) for
  // VMAF (pass line + 0.3) and 1 %-low (floor + 0.5); a CAMBI-only miss scales by 1.5 (no model; 8-bit: use compact)
  let suggest = null;
  const miss = TG ? { vmaf: m.mean < target, p1: m.p1 < floor, cambi: !(m.cambi <= cg) } : null;
  if (TG && (miss.vmaf || miss.p1 || miss.cambi)) {
    const f = Math.max(1, miss.vmaf ? rateFactor(100 - m.mean, 100 - Math.min(99, target + 0.3)) : 1, miss.p1 ? rateFactor(100 - m.p1, 100 - Math.min(99, floor + 0.5)) : 1, miss.cambi ? 1.5 : 1);
    suggest = Math.ceil((info.videoKbps * f * 1000 / (1 - OVERHEAD) + TG.audioBps) * info.dur / 8 / MIB * 10) / 10;
    suggest = Math.max(suggest, r2(TG.mb + 0.1)); // a miss never suggests the same or a smaller target
  }
  // 5. ship or quarantine
  if (status === 'FAIL') { fs.rmSync(out, { force: true }); fs.renameSync(part, failed); } else { fs.rmSync(failed, { force: true }); fs.renameSync(part, out); }
  const report = {
    tool: TOOL, generated_at: new Date().toISOString(), status, variant: V.name, preset: pname, file: path.relative(PROJECT, status === 'FAIL' ? failed : out),
    master: { file: path.basename(V.master), hash: V.hash, mb: r2(M.size / 1e6), kbps: Math.round(M.kbps), encoder: M.encoder, hardware_encode: V.hw, cambi: r2(V.cambiFull[P.bits]) },
    ...(TG ? { mode: 'target', target_mb: TG.mb, target_source: TG.src, target_kbps: TG.totalK, video_kbps: TR.video_kbps, passes: TR.passes, size_retry: TR.size_retry, mib: r2(info.size / MIB), fail_below: failBelow, suggested_target_mb: suggest, quality_miss: miss } : {}),
    q, target, floor, cambi_delta: P.cambiPlus != null ? null : cd, size: info.size, mb: r2(info.size / 1e6), pct_of_master: r2(100 * info.size / M.size),
    bitrate_kbps: { total: Math.round(info.kbps), video: Math.round(info.videoKbps), peak_1s: Math.round(info.peakKbps), cap_peak: P.peakK || null, cap_avg: Number.isFinite(capKbps) ? capKbps : null },
    vmaf: { mean: r2(m.mean), p1: r2(m.p1), min: r2(m.min), frames_scored: m.frames, n_subsample: FULL_SUB }, cambi: r2(m.cambi),
    video: { codec: v.codec_name, profile: v.profile, pix_fmt: v.pix_fmt, tag: v.codec_tag_string, w: v.width, h: v.height, fps: r2(info.fpsNum), max_keyint_s: r2(info.maxKeyint), faststart: info.faststart, atoms: info.atoms },
    audio: audio ? { source: audio.source, codec: a?.codec_name, profile: a?.profile, rate: +a?.sample_rate, channels: a?.channels, kbps: Math.round(+a?.bit_rate / 1000), lufs: loud.lufs, tp: loud.tp, compensation_db: audio.compensation_db, limiter_ceiling_db: audio.ceiling, lufs_tol: LUFS_TOL, converged: audio.converged, makeup_capped: audio.makeup_capped, eq: audio.eq, audience: audio.audience, tries: audio.tries } : null,
    search: TG ? null : Object.assign(search, { samples: V.windows.map(w => [w, r2(w + V.S)]), master_cambi_window: V.cambiWindow || null, n_subsample: SUB, max_probes: MAXP }), remedy, platforms, checks,
    encoder_args: TG ? `${enc.deliveryTargetArgs(P.enc, TR.video_kbps, o).join(' ')} -pass 1|2` : enc.deliveryArgs(P.enc, q, Object.assign({}, o, extra)).join(' '), ffmpeg: (spawnSync(FFMPEG, ['-version'], { encoding: 'utf8' }).stdout || '').split(/\r?\n/)[0],
    preset_hash: presetHash, timings_s: Object.assign({ analyse: V.t.analyse, samples: V.t.samples }, t, { total: sec(T0) })
  };
  fs.mkdirSync(QA_DIR, { recursive: true }); fs.writeFileSync(qaFile, JSON.stringify(report, null, 2));
  if (TG) {
    say(`  ${status.padEnd(4)} ${pname}: ${report.mib} MiB = ${report.mb} MB (target ${TG.mb} MiB; ${report.bitrate_kbps.total} kbps, ${report.pct_of_master} % of master) two-pass video ${TR.video_kbps}k VMAF ${report.vmaf.mean} p1 ${report.vmaf.p1} CAMBI ${report.cambi} (master ${report.master.cambi})${loud ? ` TP ${loud.tp} dBTP ${loud.lufs} LUFS` : ''}`);
    say(`    time: audio ${t.audio.toFixed(1)}s · encode ${t.encode.toFixed(1)}s (${TR.passes} passes) · verify ${t.verify.toFixed(1)}s · qa ${t.qa.toFixed(1)}s · total ${report.timings_s.total.toFixed(1)}s`);
  } else {
    say(`  ${status.padEnd(4)} ${pname}: ${report.mb} MB (${report.bitrate_kbps.total} kbps, ${report.pct_of_master} % of master) q=${q} VMAF ${report.vmaf.mean} p1 ${report.vmaf.p1} CAMBI ${report.cambi} (delta ${cd})${loud ? ` TP ${loud.tp} dBTP ${loud.lufs} LUFS` : ''}`);
    say(`    time: samples ${V.t.samples}s (once per aspect) · search ${t.search}s (${search.probes.length} probes) · audio ${t.audio}s · encode ${t.encode}s · verify ${t.verify}s · qa ${t.qa}s · total ${report.timings_s.total}s`);
  }
  for (const c of checks.filter(c => c.status === 'FAIL' || c.status === 'WARN')) say(`    ${c.status} ${c.id}: ${c.value} (expected ${c.expected})`);
  if (suggest != null) say(`    content too complex for ${TG.mb} MB (VMAF ${report.vmaf.mean}, 1 %-low ${report.vmaf.p1}, CAMBI ${report.cambi}): suggested --target-mb ${suggest} (log-linear estimate)${P.bits === 8 && miss.cambi ? '; 8-bit H.264 bands at small sizes: --preset compact (HEVC 10-bit)' : ''}${status === 'FAIL' ? `; nothing shipped under ${path.basename(out)}` : ''}`);
  return Object.assign(res, { status, file: report.file, mb: report.mb, q, vmaf: report.vmaf.mean, p1: report.vmaf.p1, cambi: report.cambi, tp: loud?.tp, secs: report.timings_s.total, ...(TG ? { mib: report.mib, target_mb: TG.mb, video_kbps: TR.video_kbps, suggested_target_mb: suggest } : {}) });
}

// ---------------------------------------------------------------- main
const T0 = Date.now(), results = [];
let code = 0, errored = false;
try {
  for (const name of names) {
    say(`== ${name}`);
    const V = await prepareVariant(name);
    if (V.missing) { say(`  FAIL master missing: ${V.master} (run build.mjs first)`); results.push({ variant: name, preset: '*', status: 'FAIL', error: 'master missing' }); continue; }
    say(`  master ${path.basename(V.master)}: ${(V.info.size / 1e6).toFixed(1)} MB, ${Math.round(V.info.kbps)} kbps, ${V.info.encoder || 'encoder ?'}${V.hw ? ' (hardware encode)' : ''} (analyse ${V.t.analyse}s)`);
    for (let pname of presets) {
      while (!enc.deliveryEncoderAvailable(PRESETS[pname].enc) && PRESETS[pname].fallback) { say(`  WARN ${PRESETS[pname].enc} missing in this ffmpeg build: ${pname} -> ${PRESETS[pname].fallback}`); pname = PRESETS[pname].fallback; }
      if (!enc.deliveryEncoderAvailable(PRESETS[pname].enc)) { results.push({ variant: name, preset: pname, status: 'FAIL', error: `${PRESETS[pname].enc} missing` }); continue; }
      try { results.push(await deliverOne(V, pname)); } catch (e) { // tool error: no partial file left behind, temp kept for diagnosis
        errored = true; fs.rmSync(path.join(PROJECT, `${CFG.name}_${name}_${pname}.part.mp4`), { force: true });
        say(`  FAIL ${pname}: ${e.message}`); results.push({ variant: name, preset: pname, status: 'FAIL', error: e.message.slice(0, 400) });
      }
    }
  }
} catch (e) { say(`deliver: ${e.message}`); code = 1; errored = true; }
if (!errored && !KEEP) fs.rmSync(TMP, { recursive: true, force: true }); else say(`temp kept: ${TMP}`);
if (results.some(r => r.status === 'FAIL')) code = 1;
say(`\n${code ? 'DELIVER FAILED' : 'DELIVER OK'} in ${sec(T0)}s`);
for (const r of results) say(`  ${r.status.padEnd(4)} ${r.variant.padEnd(5)} ${r.preset.padEnd(10)} ${r.mb != null ? `${r.target_mb != null ? `${r.mib} MiB (target ${r.target_mb}${r.suggested_target_mb != null ? `, suggested ${r.suggested_target_mb}` : ''})` : `${r.mb} MB q=${r.q}`} VMAF ${r.vmaf} p1 ${r.p1} CAMBI ${r.cambi} TP ${r.tp}` : r.error || ''}${r.skipped ? ' (up to date)' : ''}`);
if (J) console.log(JSON.stringify({ ok: !code, project: PROJECT, results }));
process.exit(code);
