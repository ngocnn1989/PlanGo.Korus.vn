// kr-motion-video frame renderer: drives headless Chrome/Edge/Chromium over the DevTools Protocol
// (Node >= 22, no npm deps) and streams its frames into ffmpeg (GPU-converted YUV by default, see --capture).
//
//   node render.mjs --stills 1,5.5,12 [--out stills] [--sheet] [--variant 9x16 | --page scene_v.html --w 1080 --h 1920]
//        --sheet writes <out>/_sheet.png (one contact sheet to review instead of N images)
//   node render.mjs --video out.mp4 [--variant 16x9] [--fps 60] [--workers auto] [--from 0] [--to 28] [--crf 14]
//        [--encoder auto|x264|nvenc|qsv|mf]  (default: video.config.json "encoder", else auto: with --gpu high the iGPU
//        encoder (qsv) first so the discrete GPU only draws, else nvenc -> qsv -> x264; see lib/encoders.mjs)
//   --scale 0.5 captures at half size (drafts: smaller files, layout unchanged; uses raw capture + ffmpeg scaling)
//   --gpu high|low|off  which GPU Chrome draws on (default high = discrete NVIDIA/AMD on dual-GPU laptops; config "gpu")
//   --capture yuv|raw|png|jpeg  frame transfer. yuv (default): the page converts its canvas to YUV 4:2:0 (BT.709) in a
//                       WebGL shader on the GPU and POSTs the planes as binary to a local port -> ffmpeg rawvideo (1.5 B/px,
//                       no screenshot, no PNG, no base64, no CPU colour conversion). raw = RGBA without the shader;
//                       png/jpeg = classic screenshots (slowest).
//   --timing            print where the time goes per frame (draw / capture / encoder wait)
//   node render.mjs --probe 1.5,4.2 --probe-out probe.json [--variant 9x16]   (KV pages: layout measured by kvProbe(t), no images)
//   common: --project <dir> (default: cwd)   env: CHROME=<browser exe>, FFMPEG=<ffmpeg exe>, MV_NO_SANDBOX=1
//
// Why one browser process per worker: a background tab stops producing frames, so tabs cannot share one browser.
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pickEncoder, encodeArgs } from './lib/encoders.mjs';
import { gpuFlags, RENDERER_JS } from './lib/gpuinfo.mjs';

if (typeof WebSocket === 'undefined') { console.error('render.mjs needs Node >= 22 (global WebSocket).'); process.exit(2); }
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const PROJECT = path.resolve(opt('project', process.cwd()));
const TL = (() => { const s = fs.readFileSync(path.join(PROJECT, 'timeline.js'), 'utf8'); return new Function(s + '; return TL;')(); })();
const CONFIG = (() => { const f = path.join(PROJECT, 'video.config.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; })();
const VAR = opt('variant') ? (CONFIG.variants || {})[opt('variant')] : null;
if (opt('variant') && !VAR) { console.error(`unknown variant ${opt('variant')} in video.config.json`); process.exit(2); }
const PAGE = opt('page', VAR?.page || 'scene.html');
const VW = +opt('w', VAR?.w || 1920), VH = +opt('h', VAR?.h || 1080);
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const SCALE = Math.min(1, Math.max(0.1, +opt('scale', 1)));
// Dual-GPU laptops (Optimus): Chrome picks the power-saving iGPU unless asked; this flag moves its GPU process
// (canvas raster, compositing) to the discrete GPU without changing any Windows setting.
const GPU = opt('gpu', CONFIG.gpu || process.env.KV_GPU || 'high');
const GPU_ARGS = gpuFlags(GPU);
let CAPTURE = opt('capture', CONFIG.capture || 'yuv');
if (CAPTURE === 'yuv' && (VW * SCALE % 8 || VH * SCALE % 2 || SCALE < 1)) CAPTURE = 'raw'; // shader packs 4 samples per texel
const TIMING = argv.includes('--timing'), T = { draw: 0, cap: 0, wait: 0, n: 0 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// GPU colour conversion installed in the page: canvas -> texture -> Y pass (W/4 x H RGBA = W*H luma bytes) and a chroma
// pass (W/8 x H RGBA: U rows then V rows, 2x2 averaged) -> one I420 buffer; BT.709 limited range like the output tags.
const GRAB_JS = `(() => {
  if (window.__kvYuv) return 1;
  const src = (window.MV && MV.cv) || document.querySelector('canvas'), W = src.width, H = src.height;
  const gl = document.createElement('canvas').getContext('webgl2', { antialias: false, powerPreference: 'high-performance' });
  if (!gl) return 0;
  const sh = (t, c) => { const s = gl.createShader(t); gl.shaderSource(s, c); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const VS = '#version 300 es\\nvoid main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }';
  const HEAD = '#version 300 es\\nprecision highp float; precision highp int; uniform highp sampler2D s; uniform int h2; out vec4 o;\\n';
  const FY = HEAD + 'float Y(int x, int y) { vec3 c = texelFetch(s, ivec2(x, y), 0).rgb; return (16.0 + 219.0 * dot(c, vec3(0.2126, 0.7152, 0.0722))) / 255.0; }\\n' +
    'void main() { ivec2 q = ivec2(gl_FragCoord.xy); int x = q.x * 4; o = vec4(Y(x, q.y), Y(x + 1, q.y), Y(x + 2, q.y), Y(x + 3, q.y)); }';
  const FC = HEAD + 'vec3 A(int cx, int r) { int x = cx * 2, y = r * 2; return 0.25 * (texelFetch(s, ivec2(x, y), 0).rgb + texelFetch(s, ivec2(x + 1, y), 0).rgb + texelFetch(s, ivec2(x, y + 1), 0).rgb + texelFetch(s, ivec2(x + 1, y + 1), 0).rgb); }\\n' +
    'float C(int cx, int r, bool v) { vec3 c = A(cx, r); return (128.0 + 224.0 * dot(c, v ? vec3(0.5, -0.4542, -0.0458) : vec3(-0.1146, -0.3854, 0.5))) / 255.0; }\\n' +
    'void main() { ivec2 q = ivec2(gl_FragCoord.xy); bool v = q.y >= h2; int r = v ? q.y - h2 : q.y, x = q.x * 4; o = vec4(C(x, r, v), C(x + 1, r, v), C(x + 2, r, v), C(x + 3, r, v)); }';
  const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); return p; };
  const pY = prog(FY), pC = prog(FC);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const target = (w, h) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h); const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; };
  const fY = target(W / 4, H), fC = target(W / 8, H), vao = gl.createVertexArray();
  window.__kvYuv = () => {
    const out = new Uint8Array(W * H * 3 / 2);
    gl.bindVertexArray(vao); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fY); gl.viewport(0, 0, W / 4, H); gl.useProgram(pY); gl.uniform1i(gl.getUniformLocation(pY, 's'), 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, W / 4, H, gl.RGBA, gl.UNSIGNED_BYTE, out, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fC); gl.viewport(0, 0, W / 8, H); gl.useProgram(pC); gl.uniform1i(gl.getUniformLocation(pC, 's'), 0); gl.uniform1i(gl.getUniformLocation(pC, 'h2'), H / 2); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, W / 8, H, gl.RGBA, gl.UNSIGNED_BYTE, out, W * H);
    return out;
  };
  return 1;
})()`;

// Page-side batch loop for raw/yuv capture: renders each time in ts, converts/reads the pixels and POSTs them to
// base + frame index without waiting for the previous POST (at most 3 in flight; the frame server re-orders and holds
// the reply until ffmpeg took the frame, which is the back-pressure). Returns [render, convert/read, send-wait] ms.
const RUN_JS = `(() => {
  window.__kvQ = [];
  window.__kvRun = async (ts, base, i0) => {
    const q = window.__kvQ, src = (window.MV && MV.cv) || document.querySelector('canvas'), r = [0, 0, 0];
    for (let k = 0; k < ts.length; k++) {
      const t0 = performance.now(); renderFrame(ts[k]);
      const t1 = performance.now(), body = window.__kvYuv ? __kvYuv() : src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
      const t2 = performance.now(), p = fetch(base + (i0 + k), { method: 'POST', body }).then(x => { if (!x.ok) return x.text().then(m => { throw new Error('frame server ' + x.status + ' ' + m); }); });
      p.catch(() => { }); q.push(p);
      while (q.length > 3) await q.shift();
      r[0] += t1 - t0; r[1] += t2 - t1; r[2] += performance.now() - t2;
    }
    return r;
  };
  window.__kvFlush = async () => { while (window.__kvQ.length) await window.__kvQ.shift(); return 1; };
  return 1;
})()`;

function findBrowser() {
  if (process.env.CHROME) return process.env.CHROME;
  const pf = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const cands = process.platform === 'win32'
    ? pf.flatMap(p => [`${p}/Google/Chrome/Application/chrome.exe`, `${p}/Microsoft/Edge/Application/msedge.exe`, `${p}/Chromium/Application/chrome.exe`])
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : [];
  for (const c of cands) if (fs.existsSync(c)) return c;
  for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [n], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  }
  throw new Error('No Chrome/Edge/Chromium found. Set CHROME=<path to browser executable>.');
}
const BROWSER = findBrowser();

// Kill the whole browser process tree (on Windows a plain kill can leave renderer children holding resources).
function kill(proc) {
  try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); else proc.kill(); } catch { }
}

// Port 0 lets the OS pick a free DevTools port (read back from <profile>/DevToolsActivePort), so parallel workers
// and lingering browsers from a previous render never collide. Cold starts under load can be slow: retry.
async function launch() {
  for (let attempt = 1; ; attempt++) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mvrender-'));
    const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
      `--window-size=${VW},${VH}`, '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1',
      '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check', '--force-color-profile=srgb',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
    args.push(...GPU_ARGS);
    if (process.env.MV_NO_SANDBOX || (process.getuid && process.getuid() === 0)) args.push('--no-sandbox');
    const proc = spawn(BROWSER, [...args, 'about:blank'], { stdio: 'ignore' });
    let exited = null;
    proc.on('exit', c => { exited = c ?? 'signal'; });
    proc.on('error', e => { exited = e.message; });
    for (let i = 0; i < 600 && exited === null; i++) { // up to 60 s
      try {
        const port = parseInt(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8'), 10);
        if (port > 0 && (await fetch(`http://127.0.0.1:${port}/json/version`)).ok) return { proc, profile, port };
      } catch { }
      await sleep(100);
    }
    kill(proc);
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { }
    const why = exited !== null ? `exited (${exited})` : 'no DevTools endpoint after 60 s';
    if (attempt >= 3) throw new Error(`browser did not start after ${attempt} attempts, ${why}: ${BROWSER}`);
    console.warn(`browser start attempt ${attempt} failed (${why}); retrying`);
    await sleep(1000 * attempt);
  }
}

async function openPage(port) {
  const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const target = await r.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), waiters = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method) for (const w of waiters.slice()) if (w.method === m.method) { waiters.splice(waiters.indexOf(w), 1); w.res(m.params); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const once = method => new Promise(res => waiters.push({ method, res }));
  const logs = [];
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails?.exception?.description || 'exception'); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: pathToFileURL(path.join(PROJECT, PAGE)).href });
  await loaded;
  const ev = async expr => {
    const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error('page: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text) + (logs.length ? '\n' + logs.join('\n') : ''));
    return res.result.value;
  };
  const ready = await ev('typeof window.__ready === "undefined" ? "missing" : window.__ready');
  if (!openPage.gpuShown) { openPage.gpuShown = true; console.log(`browser draws on: ${await ev(RENDERER_JS)} (--gpu ${GPU})`); }
  if (ready === 'missing') throw new Error(`${PAGE} did not define window.__ready (call MV.boot in scene.js)` + (logs.length ? '\n' + logs.join('\n') : ''));
  // raw/yuv: batches of frames rendered + converted in the page and POSTed to the local frame server (see RUN_JS)
  const yuv = CAPTURE === 'yuv' ? await ev(GRAB_JS) : 0;
  if (CAPTURE === 'yuv' && !yuv) throw new Error('WebGL2 unavailable in the page: use --capture raw');
  if (CAPTURE === 'yuv' || CAPTURE === 'raw') await ev(RUN_JS);
  const run = async (ts, base, i0) => {
    const a = performance.now(), tt = await ev(`__kvRun(${JSON.stringify(ts)}, ${JSON.stringify(base)}, ${i0})`);
    T.js = (T.js || 0) + tt[0]; T.read = (T.read || 0) + tt[1]; T.send = (T.send || 0) + tt[2];
    T.draw += performance.now() - a; T.n += ts.length;
  };
  const flush = () => ev('__kvFlush()');
  const frame = async (t, fmt = 'png') => {
    const a = performance.now();
    await ev(`renderFrame(${t})`);
    const b = performance.now();
    // optimizeForSpeed: PNG encoding in the browser is the main per-frame cost; jpeg q100 is cheaper still
    const s = await send('Page.captureScreenshot', { format: fmt, ...(fmt === 'jpeg' ? { quality: 100 } : {}), fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true,
      ...(SCALE < 1 ? { clip: { x: 0, y: 0, width: VW, height: VH, scale: SCALE } } : {}) });
    const buf = Buffer.from(s.data, 'base64');
    T.draw += b - a; T.cap += performance.now() - b; T.n++;
    return buf;
  };
  return { frame, run, flush, ev, close: () => ws.close() };
}

function ffmpegOut(file, fps, crf, encoder) {
  const input = CAPTURE === 'yuv' ? ['-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-s', `${VW}x${VH}`, '-framerate', String(fps), '-i', 'pipe:0']
    : CAPTURE === 'raw' ? ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${VW}x${VH}`, '-framerate', String(fps), '-i', 'pipe:0', ...(SCALE < 1 ? ['-vf', `scale=${Math.round(VW * SCALE)}:-2:flags=lanczos`] : [])]
    : ['-f', 'image2pipe', '-c:v', CAPTURE === 'jpeg' ? 'mjpeg' : 'png', '-framerate', String(fps), '-i', 'pipe:0'];
  const p = spawn(FFMPEG, ['-v', 'error', '-y', ...input,
    ...encodeArgs(encoder, crf, fps), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => p.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))));
  const write = buf => new Promise(res => { const a = performance.now(); const done = () => { T.wait += performance.now() - a; res(); }; if (p.stdin.write(buf)) done(); else p.stdin.once('drain', done); });
  return { write, end: () => { p.stdin.end(); return done; } };
}

// Purge this tool's own browser profiles left by earlier runs (Windows or antivirus can hold their files a while
// after the browser exits). Only profiles older than 2 h, so a render running in another project is never touched.
for (const d of fs.readdirSync(os.tmpdir())) {
  if (!d.startsWith('mvrender-')) continue;
  const p = path.join(os.tmpdir(), d);
  try { if (Date.now() - fs.statSync(p).mtimeMs > 2 * 3600e3) fs.rmSync(p, { recursive: true, force: true }); } catch { }
}

// local frame server for --capture raw|yuv: POST /f/<worker>/<frame> with the pixel bytes -> that worker's ffmpeg stdin in
// frame order (POSTs may overlap and arrive out of order); the reply waits until ffmpeg took the frame (CORS for file:// pages)
const SINKS = {};
async function frameServer() {
  const srv = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Private-Network', 'true'); res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const m = req.url.match(/^\/f\/(\d+)\/(\d+)/), sink = m && SINKS[m[1]];
    if (!sink) { res.writeHead(404); return res.end(); }
    const parts = []; req.on('data', c => parts.push(c));
    req.on('end', async () => { try { await sink(+m[2], Buffer.concat(parts)); res.writeHead(200); res.end(); } catch (e) { res.writeHead(500); res.end(String(e.message || e)); } });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, port: srv.address().port };
}
function orderedSink(first, bytes, write) {
  let next = first, busy = false; const held = new Map();
  const pump = async () => {
    if (busy) return; busy = true;
    try { while (held.has(next)) { const [buf, ok, no] = held.get(next); held.delete(next); next++; try { await write(buf); ok(); } catch (e) { no(e); } } } finally { busy = false; }
  };
  return (i, buf) => new Promise((ok, no) => {
    if (buf.length !== bytes) return no(new Error(`frame ${i}: ${buf.length} bytes, expected ${bytes} (${CAPTURE})`));
    held.set(i, [buf, ok, no]); pump();
  });
}
const browsers = [];
// Workers start 250 ms apart so parallel cold starts do not all compete at once.
async function browser(w) { await sleep(w * 250); const b = await launch(); browsers.push(b); return openPage(b.port); }
async function cleanup() {
  for (const b of browsers) kill(b.proc);
  // Windows releases the profile's file locks a moment after the processes die: retry for up to ~8 s.
  let left = browsers.map(b => b.profile);
  for (let i = 0; i < 32 && left.length; i++) {
    await sleep(250);
    left = left.filter(p => { try { fs.rmSync(p, { recursive: true, force: true }); } catch { } return fs.existsSync(p); });
  }
  if (left.length) console.warn(`note: ${left.length} temporary browser profile(s) still locked; a later render removes them.`);
}
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

const t0 = Date.now();
let code = 0;
try {
  if (opt('probe')) {
    const page = await browser(0), res = [];
    if (!(await page.ev('typeof window.kvProbe'))?.startsWith('function')) throw new Error(`${PAGE} has no kvProbe (not a KV page)`);
    for (const s of opt('probe').split(',')) res.push(await page.ev(`kvProbe(${parseFloat(s)})`));
    fs.writeFileSync(path.resolve(PROJECT, opt('probe-out', 'probe.json')), JSON.stringify(res));
    console.log(`probe -> ${opt('probe-out', 'probe.json')} (${res.length} frames, ${VW}x${VH})`);
  } else if (opt('stills')) {
    const out = path.resolve(PROJECT, opt('out', 'stills'));
    fs.mkdirSync(out, { recursive: true });
    const page = await browser(0), files = [];
    for (const s of opt('stills').split(',')) {
      const t = parseFloat(s), f = path.join(out, `f_${t.toFixed(2).padStart(5, '0')}.png`);
      fs.writeFileSync(f, await page.frame(t)); files.push(f);
    }
    console.log(`stills -> ${out} (${VW}x${VH}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (argv.includes('--sheet')) {
      const { makeSheet } = await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'sheet.mjs')).href);
      console.log('sheet  -> ' + makeSheet(files, path.join(out, '_sheet.png')));
    }
  } else {
    const file = path.resolve(PROJECT, opt('video', `_video_only_${VW}x${VH}.mp4`));
    const fps = +opt('fps', CONFIG.fps || TL.fps || 60), from = +opt('from', 0), to = +opt('to', TL.dur);
    const encoder = pickEncoder(opt('encoder', CONFIG.encoder || 'auto'), { gpu: GPU }), crf = +opt('crf', VAR?.crf || 14);
    // Default workers: one browser + one ffmpeg each (~1 GB). With GPU capture and a hardware encoder every worker shares
    // the same GPU and encoder engine, so more than 2 only adds contention (30/09/2026: 3 workers slower than 1-2); a
    // machine short of free RAM pages instead of rendering faster. x264/screenshot capture stay CPU-bound: up to 8.
    const gpuPath = encoder !== 'x264' && (CAPTURE === 'yuv' || CAPTURE === 'raw');
    const nwAuto = Math.max(1, Math.min(os.cpus().length - 2, Math.floor(os.freemem() / 1e9), gpuPath ? 2 : 8));
    const wSet = opt('workers', CONFIG.workers), nw = wSet && wSet !== 'auto' ? Math.max(1, +wSet || 1) : nwAuto;
    if (!wSet || wSet === 'auto') console.log(`workers: ${nw} (auto: ${gpuPath ? 'GPU capture + ' + encoder : 'CPU path'}, ${(os.freemem() / 1e9).toFixed(1)} GB RAM free; --workers N to override)`);
    const f0 = Math.round(from * fps), f1 = Math.round(to * fps), n = f1 - f0, chunk = Math.ceil(n / nw), parts = [];
    let doneFrames = 0; const BATCH = 10;
    const FS = CAPTURE === 'raw' || CAPTURE === 'yuv' ? await frameServer() : null;
    await Promise.all(Array.from({ length: nw }, async (_, w) => {
      const a = f0 + w * chunk, b = Math.min(f1, a + chunk);
      if (a >= b) return;
      const part = file.replace(/\.mp4$/, `.part${w}.mp4`); parts[w] = part;
      const page = await browser(w), enc = ffmpegOut(part, fps, crf, encoder);
      T.boot = Math.max(T.boot || 0, Date.now() - t0);
      if (FS) SINKS[w] = orderedSink(a, CAPTURE === 'yuv' ? VW * VH * 3 / 2 : VW * VH * 4, enc.write);
      for (let i = a; i < b; i += BATCH) {
        const j = Math.min(b, i + BATCH);
        if (FS) await page.run(Array.from({ length: j - i }, (_, k) => (i + k) / fps), `http://127.0.0.1:${FS.port}/f/${w}/`, i);
        else for (let k = i; k < j; k++) await enc.write(await page.frame(k / fps, CAPTURE));
        const was = doneFrames; doneFrames += j - i;
        if (Math.floor(doneFrames / 120) > Math.floor(was / 120)) console.log(`${doneFrames}/${n} frames  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
      if (FS) await page.flush();
      T.cap1 = Math.max(T.cap1 || 0, Date.now() - t0);
      await enc.end(); page.close();
      T.enc1 = Math.max(T.enc1 || 0, Date.now() - t0);
    }));
    if (FS) FS.srv.close();
    const list = file.replace(/\.mp4$/, '.parts.txt');
    fs.writeFileSync(list, parts.filter(Boolean).map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
    const c = spawnSync(FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', file], { stdio: 'inherit' });
    if (c.status !== 0) throw new Error('concat failed');
    for (const p of parts.filter(Boolean)) fs.unlinkSync(p);
    fs.unlinkSync(list);
    if (TIMING && T.n) console.log(CAPTURE === 'raw' || CAPTURE === 'yuv' ? `timing per frame (per worker, ${CAPTURE}): total ${(T.draw / T.n).toFixed(1)} ms = draw ${(T.js / T.n).toFixed(1)} + convert/read ${(T.read / T.n).toFixed(1)} + wait for send slot ${(T.send / T.n).toFixed(1)} (ffmpeg stdin wait ${(T.wait / T.n).toFixed(1)}) · gpu ${GPU} · phases: browsers ready ${(T.boot / 1000).toFixed(1)} s, frames sent ${(T.cap1 / 1000).toFixed(1)} s, encoders closed ${(T.enc1 / 1000).toFixed(1)} s`
      : `timing per frame (per worker): draw ${(T.draw / T.n).toFixed(1)} ms · capture ${(T.cap / T.n).toFixed(1)} ms · encoder wait ${(T.wait / T.n).toFixed(1)} ms · gpu ${GPU} · capture ${CAPTURE}`);
    console.log(`video -> ${file} (${n} frames, ${VW}x${VH}@${fps}, ${encoder}, gpu ${GPU}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
} catch (e) {
  console.error(String(e.stack || e)); code = 1;
} finally {
  await cleanup();
}
process.exit(code);
