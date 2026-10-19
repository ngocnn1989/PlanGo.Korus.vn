// Text-to-speech for `say` lines, no npm packages. Engines by platform:
//   Windows  OneCore voices (WinRT, via Windows PowerShell 5.1) -> SAPI (System.Speech) fallback
//   macOS    `say`          Linux  `espeak-ng` / `espeak`        anywhere: a WAV file you supply ({ text, file })
// Output is post-processed by ffmpeg: silence trimmed, 48 kHz mono float -> Float32Array (+ cached WAV in vo/).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const PS1 = String.raw`param([string]$Job, [switch]$List)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$oc = $false
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer,Windows.Media.SpeechSynthesis,ContentType=WindowsRuntime]
  $null = [Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime]
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + '`' + String.raw`1' })[0]
  $oc = $true
} catch { }
function Await($op, [Type]$t) { $m = $asTask.MakeGenericMethod($t); $task = $m.Invoke($null, @($op)); $null = $task.Wait(-1); $task.Result }
if ($List) {
  $out = @()
  if ($oc) { foreach ($v in [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices) { $out += [pscustomobject]@{ name = $v.DisplayName; lang = $v.Language; gender = "$($v.Gender)"; engine = 'onecore' } } }
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  foreach ($v in $s.GetInstalledVoices()) { $i = $v.VoiceInfo; $out += [pscustomobject]@{ name = $i.Name; lang = $i.Culture.Name; gender = "$($i.Gender)"; engine = 'sapi' } }
  ConvertTo-Json -Compress -InputObject @($out)
  exit 0
}
$jobs = Get-Content -Raw -Encoding UTF8 $Job | ConvertFrom-Json
foreach ($j in $jobs) {
  if ($oc -and $j.engine -eq 'onecore') {
    $s = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
    $v = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -eq $j.voice } | Select-Object -First 1
    if ($v) { $s.Voice = $v }
    # OneCore ignores SSML prosody rate for short lines: speaking rate / pitch go through Options (1.0 = normal)
    try { $s.Options.SpeakingRate = [double]$j.speakRate; $s.Options.AudioPitch = [double]$j.speakPitch } catch { }
    $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='$($s.Voice.Language)'>$([Security.SecurityElement]::Escape($j.text))</speak>"
    $st = Await ($s.SynthesizeSsmlToStreamAsync($ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $r = New-Object Windows.Storage.Streams.DataReader($st.GetInputStreamAt(0))
    $n = Await ($r.LoadAsync([uint32]$st.Size)) ([uint32])
    $b = New-Object byte[] $n; $r.ReadBytes($b); [IO.File]::WriteAllBytes($j.out, $b)
  } else {
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
    if ($j.voice) { try { $s.SelectVoice($j.voice) } catch { } }
    $s.Rate = [int]$j.sapiRate
    $s.SetOutputToWaveFile($j.out); $s.Speak($j.text); $s.Dispose()
  }
}
`;
const psFile = () => { const f = path.join(os.tmpdir(), 'kv-tts.ps1'); if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== PS1) fs.writeFileSync(f, '﻿' + PS1); return f; };
const ps = args => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile(), ...args], { encoding: 'utf8', timeout: 180000 });
const has = c => spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { encoding: 'utf8' }).status === 0;

let VOICES = null;
export function voices() {
  if (VOICES) return VOICES;
  VOICES = [];
  if (process.platform === 'win32') { const r = ps(['-List']); try { VOICES = JSON.parse(r.stdout.trim().replace(/^﻿/, '')); } catch { } }
  else if (process.platform === 'darwin') { const r = spawnSync('say', ['-v', '?'], { encoding: 'utf8' }); VOICES = (r.stdout || '').split('\n').filter(Boolean).map(l => { const m = /^(.+?)\s{2,}([a-z]{2}[_-][A-Z]{2})/.exec(l); return m && { name: m[1].trim(), lang: m[2].replace('_', '-'), engine: 'say' }; }).filter(Boolean); }
  else if (has('espeak-ng') || has('espeak')) VOICES = [{ name: 'en-us', lang: 'en-US', engine: 'espeak' }, { name: 'vi', lang: 'vi-VN', engine: 'espeak' }];
  return VOICES;
}
// pick: exact/substring name match, else first voice of the language (OneCore before SAPI), else null
export function pickVoice({ voice, lang = 'en-US', gender } = {}) {
  const V = voices();
  if (voice) { const v = V.find(x => x.name === voice) || V.find(x => x.name.toLowerCase().includes(String(voice).toLowerCase())); if (v) return v; }
  const L = V.filter(x => x.lang.toLowerCase() === String(lang).toLowerCase());
  return (gender && L.find(x => (x.gender || '').toLowerCase() === gender.toLowerCase())) || L[0] || null;
}

// lines: [{ text, voice, lang, rate (% e.g. -10), pitch (% e.g. 5), file }] -> [{ ...line, wav, samples (Float32Array @48k), dur, voice }]
export function synthLines(lines, { dir, defaults = {} }) {
  fs.mkdirSync(dir, { recursive: true });
  const jobs = [], out = [];
  for (const l0 of lines) {
    const l = Object.assign({}, defaults, l0);
    if (l.file) { out.push(Object.assign({}, l, { raw: path.resolve(dir, '..', l.file), voice: 'file' })); continue; }
    const v = pickVoice(l);
    if (!v) throw new Error(`no TTS voice for ${l.lang || 'en-US'} (kv doctor lists voices); give the line a WAV: { text, file }`);
    const rate = `${(l.rate ?? 0) >= 0 ? '+' : ''}${l.rate ?? 0}%`, pitch = `${(l.pitch ?? 0) >= 0 ? '+' : ''}${l.pitch ?? 0}%`;
    const key = crypto.createHash('sha1').update([v.engine, v.name, rate, pitch, l.text, 'opt2'].join('|')).digest('hex').slice(0, 12);
    const raw = path.join(dir, `tts_${key}.${v.engine === 'say' ? 'aiff' : 'wav'}`);
    if (!fs.existsSync(raw)) jobs.push({ text: l.text, out: raw, voice: v.name, engine: v.engine, rate, pitch, sapiRate: Math.round((l.rate ?? 0) / 10),
      speakRate: Math.min(3, Math.max(0.5, 1 + (l.rate ?? 0) / 100)), speakPitch: Math.min(2, Math.max(0, 1 + (l.pitch ?? 0) / 100)) });
    out.push(Object.assign({}, l, { raw, voice: `${v.name} (${v.engine})` }));
  }
  if (jobs.length) {
    if (process.platform === 'win32') {
      const jf = path.join(dir, '_jobs.json'); fs.writeFileSync(jf, JSON.stringify(jobs), 'utf8');
      const r = ps(['-Job', jf]); fs.rmSync(jf, { force: true });
      if (r.status !== 0) throw new Error('TTS failed: ' + (r.stderr || r.stdout).slice(0, 400));
    } else for (const j of jobs) {
      const r = j.engine === 'say' ? spawnSync('say', ['-v', j.voice, '-r', String(Math.round(175 * (1 + (parseFloat(j.rate) || 0) / 100))), '-o', j.out, j.text])
        : spawnSync(has('espeak-ng') ? 'espeak-ng' : 'espeak', ['-v', j.voice, '-s', String(Math.round(160 * (1 + (parseFloat(j.rate) || 0) / 100))), '-w', j.out, j.text]);
      if (r.status !== 0) throw new Error(`TTS failed for "${j.text}"`);
    }
  }
  for (const l of out) {
    if (!fs.existsSync(l.raw)) throw new Error(`missing voice file ${l.raw}`);
    // trim leading/trailing silence, 48 kHz mono float32
    const r = spawnSync(FFMPEG, ['-v', 'error', '-i', l.raw, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,aresample=48000',
      '-ac', '1', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error('ffmpeg could not read ' + l.raw);
    const b = r.stdout; l.samples = new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice(); l.dur = +(l.samples.length / 48000).toFixed(3);
  }
  return out;
}
