// KV — script-to-video CLI (Node >= 22, Chrome/Edge, ffmpeg; no npm). Run inside the project folder (or --project).
//   node kv.mjs init <dir> --name <File_Base> [--theme bright|dark|light|steel] [--aspects 16x9,4x5,9x16] [--fps 60]
//               [--logo a.png] [--logo-inverse b.png] [--mark m.png] [--force]
//               [--template <id> [--len 6|15|30]]   ad starter from templates/ads (--template list; INDEX.md)
//   node kv.mjs compile            storyboard.js -> timeline.js + scene_<aspect>.html + video.config.json
//   node kv.mjs lint [--json]      content rules + layout measured in the browser (overlap, safe zone, size, contrast)
//   node kv.mjs legal [--fix] [--write] [--json] [--summary]   legal gate (kv-legal.mjs): superlatives, absolute claims, political,
//                                  obscene, prohibited products, foreign-currency prices in every text + say line; exit 1 on error
//                                  final by default: legal_review.json needs verdict 'ok' for every text unit
//                                  (--review-template writes it; --draft = drafting, a pending review is a warning)
//   node kv.mjs stills [--aspect 9x16] [--at mid|all|t1,t2] [--scale 0.5]   -> stills/<aspect>/_sheet.png
//   node kv.mjs score              music + SFX + voice -> music.wav, vo.json, captions (srt/vtt)
//   node kv.mjs build [--encoder auto|x264|nvenc|qsv] [--workers N] [--aspect a,b]
//   node kv.mjs qa | readme | status | doctor [--json] | illus [--sheet] | clean [--stills]
//   node kv.mjs make [--until legal|lint|score|stills|legal-final|build|qa]   compile -> legal (draft) -> lint -> score
//                  -> stills -> legal-final (semantic review, legal_review.json) -> build -> qa -> readme
//   --motion reduced   (compile / lint / stills / build / make) reduced-motion cut: fades instead of moves, no parallax /
//                      shake / spin / blur; outputs <Name>_rm_<aspect>.mp4 and stills_rm/
//   node kv.mjs deliver [--preset social,small|compact|all] [--aspect a,b] [--target-vmaf 95] [--max-mb N] [--target-mb N]
//                  [--fast] [--json]   VMAF-guarded upload files <Name>_<aspect>_<preset>.mp4 + qa/*_deliver.json
//                  (scripts/deliver.mjs); compact = HEVC 10-bit at a size target (default 7 MB per 30 s, --target-mb N)
//   node kv.mjs make ... --deliver social[,small|,compact]   adds deliver after build + qa (exit 1 = a deliverable FAILed)
//   node kv.mjs qa --deliver       also gates the deliver outputs (missing / stale / FAIL = exit 1)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));           // <skill>/scripts/kv  or  <project>/kv
const TOOLS = path.dirname(HERE);                                      // <skill>/scripts    or  <project>
const require = createRequire(import.meta.url);
const argv = process.argv.slice(2), cmd = argv[0];
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const has = k => argv.includes('--' + k);
const P = path.resolve(opt('project', cmd === 'init' ? '.' : process.cwd()));
const J = has('json');
const RMO = opt('motion') === 'reduced'; // reduced-motion variant (kv-runtime.js reads window.KV_MOTION)
const log = (...a) => { if (!J) console.log(...a); };
const tool = f => fs.existsSync(path.join(P, f)) ? path.join(P, f) : path.join(TOOLS, f);
const run = (file, args, o = {}) => { const r = spawnSync(process.execPath, [file, ...args], { cwd: P, stdio: o.capture ? 'pipe' : 'inherit', encoding: 'utf8' }); if (r.status !== 0 && !o.soft) { if (o.capture) process.stderr.write(r.stderr || ''); fail(`${path.basename(file)} ${args[0] || ''} exited ${r.status}`); } return r; };
function fail(msg, code = 1) { if (J) console.log(JSON.stringify({ ok: false, error: msg })); else console.error('kv: ' + msg); process.exit(code); }

const KVC = require(path.join(HERE, 'kv-core.js'));
const PRESETS = require(path.join(HERE, 'kv-presets.js'));
const KV_FILES = ['kv-core.js', 'kv-runtime.js', 'kv-blocks.js', 'kv-illus.js', 'kv-presets.js', 'kv-presets-ad.js', 'kv.mjs', 'kv-score.mjs', 'kv-lint.mjs', 'kv-legal.mjs', 'tts.mjs'];

// ------------------------------------------------------------------ storyboard in Node
function loadSB() {
  const f = path.join(P, 'storyboard.js');
  if (!fs.existsSync(f)) fail(`missing ${f} (run: node kv.mjs init <dir> --name N)`);
  const defined = new Set();
  const stub = { define: (k) => (defined.add(k), k), presets: PRESETS, R: v => v, col: c => c };
  let BRAND = {}; const bf = path.join(P, 'brand.js');
  if (fs.existsSync(bf)) BRAND = new Function(fs.readFileSync(bf, 'utf8') + '\n;return BRAND;')();
  const SB = new Function('KV', 'BRAND', 'MV', fs.readFileSync(f, 'utf8') + '\n;return typeof SB !== "undefined" ? SB : null;')(stub, BRAND, {});
  if (!SB) fail('storyboard.js must define `var SB = { ... }`');
  return { SB, defined, BRAND };
}
function compile() {
  const { SB, defined, BRAND } = loadSB();
  let TL; try { TL = KVC.compile(SB, PRESETS); } catch (e) { fail('compile: ' + e.message); }
  const aspects = SB.aspects || ['16x9', '4x5', '9x16'];
  for (const a of aspects) if (!KVC.ASPECTS[a]) fail(`unknown aspect ${a} (${Object.keys(KVC.ASPECTS).join(', ')})`);
  const slim = Object.assign({}, TL, { scenes: TL.scenes.map(s => ({ id: s.id, t0: +s.t0.toFixed(4), t1: +s.t1.toFixed(4), energy: s.energy, trans: s.trans, hit: !!s.hit, end: !!s.end, layers: s.layers.length })) });
  fs.writeFileSync(path.join(P, 'timeline.js'), `// generated by kv.mjs compile from storyboard.js — do not edit (edit storyboard.js)\nvar TL = ${JSON.stringify(slim, null, 1)};\nif (typeof module !== 'undefined') module.exports = TL;\n`);
  const brand = fs.existsSync(path.join(P, 'brand.js')) ? '<script src="brand.js"></script>\n' : '';
  const vf = path.join(P, 'vo.json');
  if (fs.existsSync(vf)) fs.writeFileSync(path.join(P, 'vo.js'), `// generated from vo.json (kv score): spoken line times for talking characters\nvar VO = ${fs.readFileSync(vf, 'utf8')};\n`);
  const voTag = fs.existsSync(path.join(P, 'vo.js')) ? '<script src="vo.js"></script>\n' : '';
  const bdir = path.join(P, 'kv', 'blocks'); // library extensions (vision, weld, ...) load after the core blocks
  const extra = (fs.existsSync(bdir) ? fs.readdirSync(bdir).filter(f => f.endsWith('.js')).sort().map(f => `<script src="kv/blocks/${f}"></script>\n`).join('') : '')
    + [].concat(SB.scripts || []).map(f => { if (!fs.existsSync(path.join(P, f))) fail(`SB.scripts: ${f} not found in the project`); return `<script src="${f}"></script>\n`; }).join(''); // project tier-3 files
  for (const a of aspects) {
    const { w, h } = KVC.ASPECTS[a];
    fs.writeFileSync(path.join(P, `scene_${a}.html`), `<!doctype html>\n<html lang="${SB.lang || 'vi'}">\n<head><meta charset="utf-8"><title>${SB.name || 'kv'} ${a}</title>\n<style>html,body{margin:0;background:#000;overflow:hidden}canvas{display:block}</style></head>\n<body>\n<canvas id="c" width="${w}" height="${h}"></canvas>\n<script src="lib/engine.js"></script>\n${['kv-core.js', 'kv-runtime.js', 'kv-blocks.js', 'kv-illus.js', 'kv-presets.js', 'kv-presets-ad.js'].filter(f => fs.existsSync(path.join(HERE, f))).map(f => `<script src="kv/${f}"></script>`).join('\n')}\n${extra}${brand}${voTag}<script src="storyboard.js"></script>\n<script>${RMO ? "window.KV_MOTION = 'reduced'; " : ''}KV.boot(SB);</script>\n</body>\n</html>\n`);
  }
  const cf = path.join(P, 'video.config.json'), old = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, 'utf8')) : {};
  // no 'workers' key: render.mjs picks --workers auto (GPU path <= 2, capped by free RAM); a value here pins it
  const cfg = Object.assign({ name: SB.name || 'KV_Video', encoder: 'auto' }, old, { fps: TL.fps, loop: !!SB.loop || undefined, audience: SB.audience || undefined });
  cfg.name = String(cfg.name).replace(/_rm$/, '') + (RMO ? '_rm' : '');
  // loudness: build/qa derive lufs/tp from audio.class (default social -14 / -1.5); only explicit user values are kept.
  // Older kv.mjs wrote lufs -14 / tp -1.5 into every config: with an audio.class set, those legacy defaults are dropped.
  cfg.audio = Object.assign({ script: 'kv/kv-score.mjs', wav: 'music.wav' }, old.audio || {});
  if (cfg.audio.class && cfg.audio.lufs === -14 && cfg.audio.tp === -1.5) { delete cfg.audio.lufs; delete cfg.audio.tp; }
  const cover = SB.cover ?? +(TL.scenes[Math.min(1, TL.scenes.length - 1)].t0 + TL.scenes[Math.min(1, TL.scenes.length - 1)].dur * 0.6).toFixed(2);
  cfg.variants = Object.fromEntries(aspects.map(a => [a, Object.assign({ page: `scene_${a}.html`, w: KVC.ASPECTS[a].w, h: KVC.ASPECTS[a].h, crf: 14, cover }, (old.variants || {})[a] || {}, { page: `scene_${a}.html`, w: KVC.ASPECTS[a].w, h: KVC.ASPECTS[a].h }, KVC.ASPECTS[a].A === 'f' ? { safeZones: false } : {})]));
  fs.writeFileSync(cf, JSON.stringify(cfg, null, 2) + '\n');
  return { SB, TL, aspects, defined, BRAND, cfg };
}

// ------------------------------------------------------------------ commands
const C = {};
// ad starters: templates/ads/<id>_<len>.js; <id> = file prefix or any alias on the file's "// @template a,b,7" line
function adStarters() {
  const dir = path.join(HERE, 'templates', 'ads');
  if (!fs.existsSync(dir)) fail(`no ad starters in ${dir}`);
  return fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort().map(f => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8'), m = /^\/\/\s*@template\s+([^\s·]+)\s*·?\s*(.*)$/m.exec(src);
    return { f, src, base: f.replace(/\.js$/, '').replace(/_\d+$/, ''), len: +((/_(\d+)\.js$/.exec(f) || [])[1] || 0), ids: m ? m[1].split(',') : [], title: m ? m[2] : '' };
  });
}
function adTemplate(id, len) {
  const all = adStarters(), want = String(id).replace(/\.js$/, '').replace(/^[#Tt](?=\d)/, ''); // T7 / #7 / 7
  const hit = all.filter(x => x.f.replace(/\.js$/, '') === want || x.base === want || x.ids.includes(want));
  const pick = (len && hit.find(x => x.len === +len)) || hit[0];
  if (!pick) fail(`unknown --template ${id} — node kv.mjs init --template list (templates/ads/INDEX.md)`, 2);
  if (len && pick.len !== +len) log(`note: no ${len} s starter for ${id}; using ${pick.f} — re-time bars and claims (references/ad_script_templates.md, cut-downs)`);
  log(`starter: templates/ads/${pick.f} — ${pick.title}`);
  return pick.src;
}
C.init = () => {
  if (opt('template') === 'list') { for (const x of adStarters()) console.log(`${x.f.padEnd(22)} ${x.ids.join(',').padEnd(30)} ${x.title}`); return; }
  const dest = path.resolve(argv[1] && !argv[1].startsWith('--') ? argv[1] : '.'), name = opt('name');
  if (!name || !/^[A-Za-z0-9._-]+$/.test(name)) fail('usage: node kv.mjs init <dir> --name <File_Base> (letters, digits, . _ -)', 2);
  // the classic scaffold copies tools/libs/brand.js; KV then adds its runtime and a storyboard
  const args = [path.join(TOOLS, 'init.mjs'), '--dest', dest, '--name', name, '--kv'];
  for (const f of ['logo-wide', 'logo-wide-inverse', 'mark']) if (opt(f)) args.push('--' + f, opt(f));
  if (opt('logo')) args.push('--logo-wide', opt('logo'));
  if (opt('logo-inverse')) args.push('--logo-wide-inverse', opt('logo-inverse'));
  if (has('force')) args.push('--force');
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' }); if (r.status !== 0) fail('init.mjs failed');
  if (!fs.existsSync(path.join(dest, 'deliver.mjs')) && fs.existsSync(path.join(TOOLS, 'deliver.mjs'))) fs.copyFileSync(path.join(TOOLS, 'deliver.mjs'), path.join(dest, 'deliver.mjs')); // older init.mjs
  fs.mkdirSync(path.join(dest, 'kv'), { recursive: true });
  for (const f of KV_FILES) if (fs.existsSync(path.join(HERE, f))) fs.copyFileSync(path.join(HERE, f), path.join(dest, 'kv', f));
  if (fs.existsSync(path.join(HERE, 'blocks'))) fs.cpSync(path.join(HERE, 'blocks'), path.join(dest, 'kv', 'blocks'), { recursive: true });
  if (fs.existsSync(path.join(HERE, 'legal'))) fs.cpSync(path.join(HERE, 'legal'), path.join(dest, 'kv', 'legal'), { recursive: true }); // legal gate lexicon + tests
  if (!fs.existsSync(path.join(dest, 'kv.mjs'))) fs.writeFileSync(path.join(dest, 'kv.mjs'), "// entry point: node kv.mjs <command>  (implementation in kv/kv.mjs)\nimport './kv/kv.mjs';\n");
  const sb = path.join(dest, 'storyboard.js');
  if (!fs.existsSync(sb) || has('force')) {
    let t = (opt('template') ? adTemplate(opt('template'), opt('len')) : fs.readFileSync(path.join(HERE, 'templates', 'storyboard.js'), 'utf8')).replace('__NAME__', name);
    if (opt('theme')) t = t.replace(/theme: '[a-z]+'/, `theme: '${opt('theme')}'`);
    if (opt('fps')) t = t.replace(/fps: \d+/, `fps: ${+opt('fps')}`);
    if (opt('aspects')) t = t.replace(/aspects: \[[^\]]*\]/, `aspects: ${JSON.stringify(opt('aspects').split(','))}`);
    fs.writeFileSync(sb, t);
  }
  for (const f of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']) { const s = path.join(HERE, 'templates', f); if (fs.existsSync(s) && (!fs.existsSync(path.join(dest, f)) || has('force'))) fs.copyFileSync(s, path.join(dest, f)); }
  log(`KV project -> ${dest}\nnext: edit storyboard.js, then  node kv.mjs make --until stills   (review stills/*/_sheet.png)`);
};
C.compile = () => { const { TL, aspects } = compile(); out({ ok: true, dur: TL.dur, fps: TL.fps, scenes: TL.scenes.length, events: TL.events.length, aspects }, `compiled: ${TL.scenes.length} scenes, ${TL.dur.toFixed(2)} s @ ${TL.fps} fps, ${TL.events.length} sound events -> timeline.js, ${aspects.map(a => `scene_${a}.html`).join(', ')}`); };
function stillTimes(TL, at) {
  if (at && at !== 'mid' && at !== 'all') return at.split(',').map(Number);
  const ts = [];
  for (const s of TL.scenes) {
    ts.push(+(s.t0 + Math.min(s.dur * 0.62, s.dur - 0.1)).toFixed(2));
    if (at === 'all') { if (s.trans.d > 0) ts.push(+(s.t0 - (s.trans.o || 0) + s.trans.d / 2).toFixed(2)); ts.push(+(s.t0 + 0.3).toFixed(2)); } // transition: window midpoint (align shifts it)
  }
  if (at === 'all') ts.push(0, +(TL.dur - 1 / TL.fps).toFixed(3));
  return [...new Set(ts)].sort((a, b) => a - b);
}
C.stills = () => {
  const { TL, aspects } = compile(), want = opt('aspect') ? opt('aspect').split(',') : aspects, times = stillTimes(TL, opt('at', 'mid')), sheets = [];
  for (const a of want) {
    const dir = path.join(RMO ? 'stills_rm' : 'stills', a); fs.rmSync(path.join(P, dir), { recursive: true, force: true });
    run(tool('render.mjs'), ['--project', P, '--variant', a, '--stills', times.join(','), '--out', dir, '--sheet', ...(opt('scale') ? ['--scale', opt('scale')] : [])], { capture: J });
    sheets.push(path.join(P, dir, '_sheet.png'));
  }
  out({ ok: true, times, sheets }, `sheets:\n  ${sheets.join('\n  ')}`);
};
C.legal = () => {
  const gone = ['kv-legal.mjs', 'legal/lexicon.json'].filter(f => !fs.existsSync(path.join(HERE, f)));
  if (gone.length) fail(`legal gate not installed (kv/${gone.join(', kv/')} missing): copy kv/kv-legal.mjs + kv/legal/ from the skill (scripts/kv/) or re-run kv init — the gate is mandatory`);
  const args = [path.join(HERE, 'kv-legal.mjs'), P];
  for (const k of ['json', 'fix', 'write', 'summary', 'draft', 'review-template']) if (has(k)) args.push('--' + k);
  for (const k of ['audience', 'lang']) if (opt(k)) args.push('--' + k, opt(k));
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' }); process.exit(r.status ?? 1);
};
C.lint = () => { compile(); const r = run(path.join(HERE, 'kv-lint.mjs'), ['--project', P, ...(J ? ['--json'] : [])], { soft: true }); process.exit(r.status); };
C.score = () => { compile(); run(path.join(HERE, 'kv-score.mjs'), [path.join(P, 'music.wav')]); };
C.build = () => {
  compile();
  const args = ['--project', P]; for (const k of ['encoder', 'workers']) if (opt(k)) args.push('--' + k, opt(k));
  if (opt('aspect')) args.push('--variant', opt('aspect'));
  if (has('skip-audio')) args.push('--skip-audio');
  const t0 = Date.now(); run(tool('build.mjs'), args);
  status({ build: { at: new Date().toISOString(), secs: Math.round((Date.now() - t0) / 1000), encoder: opt('encoder') || 'auto' } });
};
C.qa = () => { const r = run(tool('qa.mjs'), ['--project', P, ...(opt('aspect') ? ['--variant', opt('aspect')] : []), ...(has('deliver') ? ['--deliver'] : [])], { soft: true }); status({ qa: { at: new Date().toISOString(), exit: r.status } }); process.exit(r.status); };
C.deliver = () => { // scripts/deliver.mjs: every flag passes through; --aspect maps to --variant
  const args = ['--project', P], rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--project' || rest[i] === '--motion') { i++; continue; } // --motion: kv.mjs only (config name)
    if (rest[i] === '--aspect') { args.push('--variant', rest[++i]); continue; }
    args.push(rest[i]);
  }
  const t0 = Date.now(), r = run(tool('deliver.mjs'), args, { soft: true });
  status({ deliver: { at: new Date().toISOString(), secs: Math.round((Date.now() - t0) / 1000), exit: r.status } });
  process.exit(r.status);
};
C.readme = () => { compile(); run(path.join(HERE, 'kv-lint.mjs'), ['--project', P, '--readme']); };
C.make = () => {
  const until = opt('until', 'readme'), steps = ['compile', 'legal', 'lint', 'score', 'stills', 'legal-final', 'build', 'qa', 'readme'];
  for (const s of steps.slice(0, steps.indexOf(until) + 1)) {
    log(`\n== kv ${s}`);
    const pass = [];
    for (const k of ['encoder', 'workers', 'motion']) if (opt(k)) pass.push('--' + k, opt(k));
    if (s === 'build' && steps.indexOf(until) >= steps.indexOf('score')) pass.push('--skip-audio'); // score already ran
    if (s === 'stills') pass.push('--at', opt('at', 'all')); // start + middle + transitions of every scene, frame 0, last frame
    if (s === 'legal') pass.push('--draft', '--summary'); // drafting: lexical errors stop make, a pending review is a warning
    if (s === 'legal-final') pass.push('--summary'); // final: every text unit needs verdict 'ok' in legal_review.json (node kv.mjs legal)
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), s === 'legal-final' ? 'legal' : s, '--project', P, ...pass], { stdio: 'inherit' });
    if (r.status !== 0) fail(`make stopped at ${s} (exit ${r.status})`);
  }
  if (opt('deliver') && !['compile', 'legal', 'lint', 'score', 'stills', 'legal-final', 'build'].includes(opt('until', 'readme'))) { // optional final step
    log('\n== kv deliver');
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'deliver', '--project', P, '--preset', opt('deliver'), ...(opt('motion') ? ['--motion', opt('motion')] : [])], { stdio: 'inherit' });
    if (r.status !== 0) fail(`make stopped at deliver (exit ${r.status})`);
  }
};
// --motion reduced writes <Name>_rm into video.config.json (compile). Commands that read the config without compiling
// (qa, deliver, status, clean) first re-sync the name to their own mode: a plain command after a reduced one addresses
// the normal outputs, `--motion reduced` the _rm ones.
function syncName() {
  const cf = path.join(P, 'video.config.json'); if (!fs.existsSync(cf)) return;
  const c = JSON.parse(fs.readFileSync(cf, 'utf8')), want = String(c.name).replace(/_rm$/, '') + (RMO ? '_rm' : '');
  if (c.name !== want) { c.name = want; fs.writeFileSync(cf, JSON.stringify(c, null, 2) + '\n'); }
}
function status(patch) {
  const f = path.join(P, '.kv-status.json'), s = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  Object.assign(s, patch); fs.writeFileSync(f, JSON.stringify(s, null, 2));
}
// intermediates: picture-only tracks (needed only by patch.mjs), stills, probe files
C.clean = () => {
  const gone = [];
  for (const f of fs.readdirSync(P)) if (/^_video_only_.*\.mp4$|^_patch_|^\.probe_/.test(f)) { fs.rmSync(path.join(P, f), { force: true }); gone.push(f); }
  if (has('stills')) { fs.rmSync(path.join(P, 'stills'), { recursive: true, force: true }); gone.push('stills/'); }
  out({ ok: true, removed: gone }, `removed: ${gone.join(', ') || '-'} (late fixes with patch.mjs need a new build afterwards)`);
};
C.status = () => {
  const f = path.join(P, '.kv-status.json'), s = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(P, 'video.config.json'), 'utf8')); } catch { }
  s.outputs = Object.keys(cfg.variants || {}).map(a => { const p = path.join(P, `${cfg.name}_${a}.mp4`); return { aspect: a, file: path.basename(p), exists: fs.existsSync(p), mtime: fs.existsSync(p) ? fs.statSync(p).mtime.toISOString() : null }; });
  console.log(JSON.stringify(s, null, J ? 0 : 2));
};
C.doctor = async () => {
  const v = (c, a) => { const r = spawnSync(c, a, { encoding: 'utf8' }); return r.status === 0 ? (r.stdout || r.stderr).split(/\r?\n/)[0].trim() : null; };
  const rep = { node: process.version, nodeOk: +process.versions.node.split('.')[0] >= 22, platform: `${process.platform} ${os.release()}`, cores: os.cpus().length };
  rep.ffmpeg = v(process.env.FFMPEG || 'ffmpeg', ['-hide_banner', '-version']); rep.ffprobe = !!v(process.env.FFPROBE || 'ffprobe', ['-version']);
  const pf = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const cands = process.env.CHROME ? [process.env.CHROME] : process.platform === 'win32' ? pf.flatMap(p => [`${p}/Google/Chrome/Application/chrome.exe`, `${p}/Microsoft/Edge/Application/msedge.exe`])
    : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  rep.browser = cands.find(c => fs.existsSync(c)) || null;
  const enc = await import(pathToFileURL(fs.existsSync(path.join(TOOLS, 'lib', 'encoders.mjs')) ? path.join(TOOLS, 'lib', 'encoders.mjs') : path.join(P, 'lib', 'encoders.mjs')).href);
  rep.encoders = Object.fromEntries(['nvenc', 'qsv', 'mf', 'x264'].map(e => [e, e === 'mf' && process.platform !== 'win32' ? false : enc.works(e)]));
  rep.encoderAuto = enc.pickEncoder('auto');
  rep.gpu = v('nvidia-smi', ['--query-gpu=name,driver_version', '--format=csv,noheader']);
  // which GPU the headless browser really draws on: default mode (high) and power-saving mode (low)
  const gi = await import(pathToFileURL(path.join(fs.existsSync(path.join(TOOLS, 'lib', 'gpuinfo.mjs')) ? TOOLS : P, 'lib', 'gpuinfo.mjs')).href).catch(() => null);
  rep.browserGpu = gi && rep.browser ? { high: await gi.browserRenderer(rep.browser, 'high'), low: await gi.browserRenderer(rep.browser, 'low') } : null;
  const tts = await import(pathToFileURL(path.join(HERE, 'tts.mjs')).href).catch(() => null);
  rep.tts = tts ? tts.voices() : [];
  rep.freeRamGB = +(os.freemem() / 1e9).toFixed(1); // same rule as render.mjs --workers auto
  rep.workers = Math.max(1, Math.min(rep.cores - 2, Math.floor(rep.freeRamGB), rep.encoderAuto === 'x264' ? 8 : 2));
  rep.ok = rep.nodeOk && !!rep.ffmpeg && !!rep.browser;
  if (J) return console.log(JSON.stringify(rep));
  console.log(`node      ${rep.node} ${rep.nodeOk ? 'ok' : 'NEED >= 22'}\nbrowser   ${rep.browser || 'NOT FOUND (set CHROME=<exe>)'}\nffmpeg    ${rep.ffmpeg || 'NOT FOUND'}\nencoders  ${Object.entries(rep.encoders).map(([k, x]) => `${k}:${x ? 'yes' : 'no'}`).join('  ')}  -> auto = ${rep.encoderAuto} (browser on the discrete GPU; --gpu low reverses the order)\ngpu       ${rep.gpu || '-'}${rep.browserGpu ? `\nbrowser   draws on (--gpu high, default): ${rep.browserGpu.high}\n          draws on (--gpu low): ${rep.browserGpu.low}` : ''}\ntts       ${rep.tts.map(x => `${x.name} (${x.lang}, ${x.engine})`).join('; ') || 'none (supply WAV files for voice lines)'}\nworkers   ${rep.workers} auto (${rep.cores} cores, ${rep.freeRamGB} GB RAM free)\n${rep.ok ? 'OK' : 'MISSING REQUIREMENTS'}`);
  process.exit(rep.ok ? 0 : 1);
};
C.illus = () => {
  // renders the illustration + icon catalogue into one contact sheet (a throwaway project in the OS temp dir)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-illus-'));
  fs.cpSync(path.join(TOOLS, 'lib'), path.join(dir, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'kv'));
  for (const f of KV_FILES) if (fs.existsSync(path.join(HERE, f))) fs.copyFileSync(path.join(HERE, f), path.join(dir, 'kv', f));
  if (fs.existsSync(path.join(HERE, 'blocks'))) fs.cpSync(path.join(HERE, 'blocks'), path.join(dir, 'kv', 'blocks'), { recursive: true });
  const names = ['buddy', 'cat', 'dog', 'bird', 'fish', 'sun', 'moon', 'star', 'cloud', 'rainbow', 'tree', 'flower', 'mountain', 'wave', 'sunset', 'snowflake', 'flame', 'planet', 'house', 'car', 'book', 'ball', 'gift', 'trophy', 'bulb', 'gear', 'laptop', 'phone', 'rocket', 'balloon', 'cake', 'clock', 'apple', 'pencil', 'bell', 'note', 'heart'];
  const icons = ['check', 'cross', 'star', 'heart', 'play', 'arrow', 'chat', 'globe', 'phone', 'mail', 'clock', 'pin', 'user', 'home', 'bolt', 'search', 'calendar', 'chart', 'lock', 'thumb', 'cart', 'shield'];
  const theme = opt('theme', 'bright'), cols = 8;
  const cell = (i, n, c) => [((i % c) + 0.5) / c, (Math.floor(i / c) + 0.5) / Math.ceil(n / c)];
  const sb = `var SB = { name: 'illus', bpm: 120, fps: 30, theme: '${theme}', aspects: ['16x9'], scenes: [
    { id: 'a', bars: 1, layers: ${JSON.stringify(names.map((n, i) => ({ kind: 'group', at: 'full', pos: cell(i, names.length, cols), w: 1 / cols, h: 1 / Math.ceil(names.length / cols), enter: 'none', layers: [{ kind: 'illus', name: n, pos: [0.5, 0.42], size: 0.72, enter: 'none', pose: n === 'buddy' ? 'wave' : undefined }, { kind: 'text', text: n, style: 'label', pos: [0.5, 0.92], enter: 'none' }] })))} },
    { id: 'b', bars: 1, layers: ${JSON.stringify(icons.map((n, i) => ({ kind: 'group', at: 'full', pos: cell(i, icons.length, cols), w: 1 / cols, h: 1 / Math.ceil(icons.length / cols), enter: 'none', layers: [{ kind: 'icon', name: n, pos: [0.5, 0.42], size: 0.5, enter: 'none', color: 'a' + (1 + i % 6) }, { kind: 'text', text: n, style: 'label', pos: [0.5, 0.9], enter: 'none' }] })))} } ] };`;
  fs.writeFileSync(path.join(dir, 'storyboard.js'), sb);
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'compile', '--project', dir], { stdio: 'ignore' }); if (r.status) fail('illus compile failed');
  const outDir = path.resolve(opt('out', path.join(process.cwd(), 'illus_catalog')));
  run(tool('render.mjs'), ['--project', dir, '--variant', '16x9', '--stills', '1.2,3.2', '--out', outDir], { capture: true });
  fs.rmSync(dir, { recursive: true, force: true });
  out({ ok: true, illus: names, icons, images: fs.readdirSync(outDir).map(f => path.join(outDir, f)) }, `catalogue -> ${outDir} (illus: ${names.length}, icons: ${icons.length})`);
};
function out(obj, text) { if (J) console.log(JSON.stringify(obj)); else console.log(text); }

if (!cmd || !C[cmd]) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n')); process.exit(cmd ? 2 : 0); }
if (['qa', 'deliver', 'status', 'clean'].includes(cmd)) syncName();
await C[cmd]();
