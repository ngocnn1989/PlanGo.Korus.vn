// Which GPU a headless browser really draws on, read from WebGL (the unmasked renderer string), for render.mjs logs
// and `kv doctor`. On dual-GPU laptops (Optimus) Chrome picks the power-saving iGPU unless --force_high_performance_gpu
// is passed; the flag only affects Chrome's own GPU process and changes no Windows setting.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const gpuFlags = mode => mode === 'high' ? ['--force_high_performance_gpu'] : mode === 'off' ? ['--disable-gpu'] : [];

export const RENDERER_JS = `(() => { const c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl');
  if (!g) return 'no WebGL (software only)'; const e = g.getExtension('WEBGL_debug_renderer_info');
  return String(e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)); })()`;

// Starts the browser once in the given mode, returns its WebGL renderer string (or 'error: ...').
export async function browserRenderer(exe, mode = 'high') {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mvrender-gpu-'));
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', ...gpuFlags(mode), 'about:blank'], { stdio: 'ignore' });
  try {
    let port = 0;
    for (let i = 0; i < 150 && !port; i++) { try { port = parseInt(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8'), 10) || 0; } catch { } if (!port) await new Promise(r => setTimeout(r, 100)); }
    if (!port) return 'error: browser did not start';
    const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    const r = await new Promise(ok => { ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id === 1) ok(m.result); }; ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: RENDERER_JS, returnByValue: true } })); });
    ws.close();
    return r?.result?.value || 'error: no answer';
  } catch (e) { return 'error: ' + e.message; } finally {
    proc.kill();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { } }, 500);
  }
}
