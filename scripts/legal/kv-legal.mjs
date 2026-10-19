// KV legal: compliance gate for every script line, on-screen text, voice line, caption and CTA of videos for
// Vietnamese social platforms (Facebook, TikTok, YouTube, Zalo, Instagram). Owner policy: superlatives / absolute
// claims are removed (no "allowed with proof" path); political, reactionary, inciting, discriminatory, obscene and
// anti-customs wording is blocked. Rules, legal basis and sources: kv/legal/lexicon.json; guide:
// references/legal_compliance.md. A compliance aid, not legal advice — the owner / legal counsel decides.
//   node kv/kv-legal.mjs [project dir | files...] [--json] [--summary] [--fix] [--write] [--audience kids] [--lang vi|en]
//   node kv/kv-legal.mjs <project> --draft     drafting mode (kv-lint, stills): a pending semantic review is a warning
//   node kv/kv-legal.mjs <project> --review-template   writes / updates <project>/legal_review.json (every text unit,
//                                              sha1 of its raw text in NFC, verdict null); unchanged texts keep their verdict
//   node kv/kv-legal.mjs --selftest            runs kv/legal/test-cases.json + the review-gate tests, exit 0 only when all pass
// Final mode (default for a project): every text unit needs verdict 'ok' in legal_review.json, reviewer and date;
// a missing file, a new or changed text (sha1 mismatch), a pending or 'rewrite' verdict is an error. The review never
// clears a lexical error.
// Scans: storyboard.js (compiled: every text field of every layer, list items, chips, tiles, badges, prefix/suffix on
// numbers, buttons, bubbles, end card, `say` lines, SB.title/caption), <Name>.srt/.vtt and vo.json in the project,
// SB.scripts string literals, and loose .md/.txt/.srt/.vtt/.js/vo.json files. --fix prints a fixed copy; --write applies
// it after saving <file>.bak (only certain rewrites; the rest is listed as "manual rewrite required"). Exit 1 on any error.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
const LEX_FILE = path.join(HERE, 'legal', 'lexicon.json');
const SEV = { info: 0, warn: 1, error: 2 };
const B0 = '(?<![\\p{L}\\p{M}\\p{N}])', B1 = '(?![\\p{L}\\p{M}\\p{N}]|[.,]\\p{N})';
const GAP = '[\\s\\u00A0*_\\-\u2010]{1,6}', GAP0 = '[\\s\\u00A0*_\\-\u2010]{0,6}'; // bounded: no quadratic scans on long blank runs
// ------------------------------------------------------------------ text normalisation
export const nfc = s => String(s ?? '').normalize('NFC');
// Vietnamese tone placement: a syllable-final oa / oe / uy may carry the tone on either vowel (hoà = hòa, thuỷ = thủy,
// khoẻ = khỏe). Canonical form = tone on the first vowel. Same length, so indices stay valid.
export function canonTone(s) {
  return s.replace(/([oOuU])([àáảãạÀÁẢÃẠèéẻẽẹÈÉẺẼẸỳýỷỹỵỲÝỶỸỴ])(?![\p{L}\p{M}\p{N}])/gu, (m, a, b) => {
    const d = b.normalize('NFD'), base = d[0], tone = d.slice(1);
    if (/[oO]/.test(a) ? !/[aAeE]/.test(base) : !/[yY]/.test(base)) return m;
    return (a + tone).normalize('NFC') + base;
  });
}
export const deaccent = s => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keyOf = s => canonTone(nfc(s)).toLowerCase().replace(/[\s *_]+/g, ' ').replace(/[’]/g, "'").trim();
const fill = m => '¤'.repeat(m.length);
// same-length masks: data URIs / base64 / minified runs, URLs, e-mail, `inline code`, file names — never ad copy
function mask(S) {
  return S.replace(/\S{200,}/g, fill).replace(/(?:https?:\/\/|www\.|data:)[^\s)>\]"'`]{1,2000}/gi, fill)
    .replace(/(?<![\w.+-])[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,4}/g, fill).replace(/`[^`\n]{0,400}`/g, fill)
    .replace(/(?<![\p{L}\p{N}_./\\-])[\p{L}\p{N}_./\\-]{0,120}\.(?:png|jpe?g|webp|gif|svg|mp4|mov|webm|wav|mp3|m4a|js|mjs|cjs|json|css|html?|md|txt|srt|vtt|pdf|docx?|xlsx?|pptx?|zip)(?![\p{L}\p{N}])/giu, fill);
}
// hidden and compatibility characters (index map keeps every finding on the original text):
// - dropped (and the letters on both sides become a squeeze zone): zero-width / format characters, variation selectors,
//   keycap marks, emoji / pictographs, stray combining marks NFC could not compose (strike-through, underline …);
// - odd spaces become ' '; compatibility forms are NFKC-folded (１ ＃ ％ Ｔ ¹ º → 1 # % T 1 o; 🔟 → 10);
// - digits of other scripts become ASCII digits; Cyrillic / Greek look-alikes inside a Latin word and small capitals
//   become Latin letters ("bеst", "сố 1", "ʙest").
const ZW = /[\u00AD\u034F\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\uFE00-\uFE0F\u20E3\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/u;
const ODDSP = /[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\u3164\u115F\u1160\u2800\uFFA0]/u;
const PICTO = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}]/u, MARK = /\p{M}/u;
const HOMO = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'т': 't', 'к': 'k', 'м': 'm',
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y', 'І': 'I', 'Ј': 'J', 'Ѕ': 'S',
  'ο': 'o', 'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x',
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
  'ʙ': 'b', 'ɪ': 'i', 'ʀ': 'r', 'ᴀ': 'a', 'ᴇ': 'e', 'ᴏ': 'o', 'ᴛ': 't', 'ᴜ': 'u', 'ꜱ': 's', 'ɴ': 'n', 'ʜ': 'h', 'ᴍ': 'm', 'ᴋ': 'k', 'ʟ': 'l', 'ᴄ': 'c', 'ᴅ': 'd', 'ғ': 'f', 'ɢ': 'g', 'ᴘ': 'p', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z', 'ᴠ': 'v' };
const SMALLCAP = /[ʙɪʀᴀᴇᴏᴛᴜꜱɴʜᴍᴋʟᴄᴅғɢᴘᴡʏᴢᴠ]/u;
const MIXED = /[\p{Script=Latin}][\p{L}\p{M}]*[\p{Script=Cyrillic}\p{Script=Greek}]|[\p{Script=Cyrillic}\p{Script=Greek}][\p{L}\p{M}]*[\p{Script=Latin}]/u;
const ZERO = [0x660, 0x6F0, 0x7C0, 0x966, 0x9E6, 0xA66, 0xAE6, 0xB66, 0xBE6, 0xC66, 0xCE6, 0xD66, 0xDE6, 0xE50, 0xED0, 0xF20, 0x1040, 0x1090, 0x17E0, 0x1810, 0x1946, 0x19D0, 0x1A80, 0x1A90, 0x1B50, 0x1BB0, 0x1C40, 0x1C50, 0xA620, 0xA8D0, 0xA900, 0xA9D0, 0xA9F0, 0xAA50, 0xABF0];
const NFKC = new Map(), nfkc = c => { let k = NFKC.get(c); if (k === undefined) { k = c.normalize('NFKC'); if (MARK.test(k) && !MARK.test(c)) k = c; NFKC.set(c, k); } return k; };
function normalise(T) {
  if (!/[^\x00-\x7F\u00C0-\u024F\u1EA0-\u1EF9]/.test(T)) return { N: T, map: null, cuts: [] };
  const homo = /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(T) ? new Set([...T.matchAll(/[\p{L}\p{M}]+/gu)].filter(m => MIXED.test(m[0])).flatMap(m => Array.from({ length: m[0].length }, (_, k) => m.index + k))) : null;
  const out = [], map = [], cuts = []; let changed = false; // one UTF-16 unit per entry: linear even with many stray marks
  for (let i = 0; i < T.length;) {
    const cp = T.codePointAt(i), c = String.fromCodePoint(cp); let r = c;
    if ((cp >= 0x80 && cp < 0xC0) || (cp > 0x24F && !(cp >= 0x1EA0 && cp <= 0x1EF9))) {
      if (cp === 0x1F51F) r = '10';
      else if (cp >= 0x2160 && cp <= 0x2179 && (cp & 0xF) <= 9) r = String((cp & 0xF) + 1); // Roman numerals I..X
      else if (ZW.test(c) || PICTO.test(c)) r = '';
      else if (ODDSP.test(c)) r = ' ';
      else if (MARK.test(c)) { // a stray combining mark: compose it with a mapped look-alike, else drop it
        const comp = out.length ? (out[out.length - 1] + c).normalize('NFC') : '';
        if (comp.length === 1) { out[out.length - 1] = comp; changed = true; i += c.length; continue; }
        r = '';
      } else if (HOMO[c] && (SMALLCAP.test(c) || (homo && homo.has(i)))) r = HOMO[c];
      else if (/\p{Nd}/u.test(c) && nfkc(c) === c) { const z = ZERO.filter(z => z <= cp && cp - z < 10).pop(); r = z === undefined ? c : String(cp - z); }
      else r = nfkc(c);
    }
    if (r !== c) changed = true;
    if (r === '' && out.length) cuts.push(out.length - 1, out.length); // the letters on both sides of a dropped character
    for (let k = 0; k < r.length; k++) { out.push(r[k]); map.push(i); }
    i += c.length;
  }
  if (!changed) return { N: T, map: null, cuts: [] };
  map.push(T.length); return { N: out.join(''), map, cuts };
}
// syllables that are distinctly Vietnamese when written without diacritics (gate for the no-diacritics pass)
const VI_SYL = new Set('khong cua nhung duoc nhieu nguoi viet hang pham nhat tot gioi dau duy tren truong cong nghe mot cac rat voi cho mua ngay chung chinh xac sang tao chat luong thuong hieu dich khach lien nay nao cung phai biet lam minh dong thanh gian tien viec dung tuyet doi hoan hao kiem hien dai trong ngoai nhanh manh ben cao thap moi re dep uy tin hay qua roi lai chi thi giao toan quoc mien phi cam ket neu hai long hoan tron doi bao dam nha phu thich nhu lua chon tho han so'.split(' '));
const VI_SCOPE_ND = /(?<![a-z])(?:viet\s?nam|the\s+gioi|thi\s+truong|toan\s+quoc|ca\s+nuoc|chau\s+a|dong\s+nam\s+a|sai\s+gon|ha\s+noi)(?![a-z])/i; // an explicit claim scope
const looksVi = s => { const t = s.toLowerCase().match(/[a-z]+/g) || []; const h = t.filter(x => VI_SYL.has(x)).length; return (h >= 2 && h / t.length >= 0.25) || VI_SCOPE_ND.test(s); };
// obfuscated spellings make squeeze zones; the squeezed copy (only windows around the zones) is scanned with words
// allowed to touch and with the no-diacritics pass on, and only matches inside a zone count:
// separators inside short syllables ("s.ố 1", "t.ố.t n.h.ấ.t"), spaced letters ("h à n g  đ ầ u"), punctuation joining
// two words ("hàng...đầu", "miễn.phí"), elongation ("nhấtttt"), leetspeak ("nh4t", "fr33", "a$$hole"), hashtags and
// run-together words ("#TốtNhất", "#bestrobot", "TỐTNHẤT"), and dropped hidden characters. Plain-ASCII dotted
// capitals are acronyms (T.P.H.C.M, VN-J).
const OBF = /(?<![\p{L}\p{M}\p{N}])[\p{L}\p{M}]{1,3}(?:[.*_\-‐·•][\p{L}\p{M}]{1,3})+(?![\p{L}\p{M}\p{N}])/gu;
const SPACED = /(?<![\p{L}\p{M}\p{N}])\p{L}\p{M}*(?: \p{L}\p{M}*){2,}(?![\p{L}\p{M}\p{N}])/gu;
const PJOIN = /(?<=\p{L})[.,/\\|•·…~+:;]{1,3}(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])[.,/\\|•·…~+:;]{1,3}(?=\p{L})/gu;
const ELONG = /(\p{L})\1{2,}/gu, LEET = /(?<![\p{L}\p{N}@$!])(?=[\p{L}\p{N}@$!]{0,29}[0134578@$!])[\p{L}\p{N}@$!]{2,30}(?![\p{L}\p{N}@$!])/gu, LEETMAP = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
const UNIT = /^\d+(?:[.,]\d+)?(?:mm|cm|m|km|kg|g|t|v|kv|a|ma|w|kw|hz|khz|mhz|ghz|d|k|s|h|l|ml|bar|nm|mp|fps|p|x|gb|mb|tb|kb|bit|c)$/i;
const TOKEN = /(?<![\p{L}\p{M}\p{N}#])(?:#[\p{L}\p{M}\p{N}]{2,60}|[\p{L}\p{M}\p{N}]{4,60})(?![\p{L}\p{M}\p{N}])/gu;
const VNCH = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/iu;
const VNSYL = /^(?:ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdghklmnpqrstvx])?[aeiouy]{1,3}(?:ch|ng|nh|[cmnpt])?$/;
let SEGK = null, SEGC = new Map();
function segment(w, known, enWords, hashtag) { // memoised per lexicon
  if (SEGK !== known || SEGC.size > 20000) { SEGK = known; SEGC = new Map(); }
  const k = (hashtag ? '#' : '') + w; if (SEGC.has(k)) return SEGC.get(k);
  const r = segment0(w, known, enWords, hashtag); SEGC.set(k, r); return r;
}
function segment0(w, known, enWords, hashtag) { // cut positions inside one run-together word, or null
  const parts = w.replace(/([\p{Ll}\p{N}])(?=\p{Lu})|(\p{L})(?=\p{N})|(\p{N})(?=\p{L})/gu, '$1$2$3\u0001').split('\u0001'), cuts = []; let pos = 0;
  for (const p of parts) {
    const d = deaccent(p).toLowerCase(), n = d.length;
    if (n > 3 && !/\d/.test(d) && !VNSYL.test(d)) {
      const best = new Array(n + 1).fill(null); best[0] = { s: 0, from: -1 };
      for (let i = 0; i < n; i++) if (best[i]) for (let j = i + 1; j <= Math.min(n, i + 7); j++) {
        const q = d.slice(i, j); if (!VNSYL.test(q)) continue;
        const s = best[i].s + (known.has(q) ? q.length : -2 * q.length) - 0.5; if (!best[j] || s > best[j].s) best[j] = { s, from: i };
      }
      if (best[n] && (VNCH.test(p) || best[n].s >= 0.6 * n)) { for (let j = n; best[j].from > 0; j = best[j].from) cuts.push(pos + best[j].from); }
      else if (hashtag) for (let i = 0; i < n;) { const m = enWords.find(x => d.startsWith(x, i)); if (m) { if (i) cuts.push(pos + i); if (i + m.length < n) cuts.push(pos + i + m.length); i += m.length; } else i++; }
    }
    pos += p.length; if (pos < w.length) cuts.push(pos);
  }
  return cuts.length ? [...new Set(cuts)].sort((a, b) => a - b) : null;
}
function squeeze(S, cuts = [], LX = loadLexicon()) {
  const zone = new Uint8Array(S.length + 1), ms = []; let leet = false;
  const drop = (m, sep) => { let o = ''; const mp = []; for (let i = 0; i < m[0].length; i++) if (!sep.test(m[0][i])) { o += m[0][i]; mp.push(m.index + i); } return { i: m.index, e: m.index + m[0].length, o, mp }; };
  for (const m of S.matchAll(OBF)) if (!(/^[\p{Lu}\p{M}.\-]+$/u.test(m[0]) && deaccent(m[0]) === m[0])) ms.push(drop(m, /[.*_\-‐·•]/));
  for (const m of S.matchAll(SPACED)) ms.push(drop(m, / /));
  for (const m of S.matchAll(PJOIN)) ms.push({ i: m.index, e: m.index + m[0].length, o: ' ', mp: [m.index] });
  for (const m of S.matchAll(ELONG)) ms.push({ i: m.index, e: m.index + m[0].length, o: m[1], mp: [m.index] });
  for (const m of S.matchAll(LEET)) {
    const w = m[0]; if (!/[0134578@$!]/.test(w) || !/\p{L}/u.test(w) || UNIT.test(w)) continue;
    leet = true; ms.push({ i: m.index, e: m.index + w.length, o: [...w].map(ch => LEETMAP[ch] || ch).join(''), mp: Array.from({ length: w.length }, (_, k) => m.index + k) });
  }
  for (const m of S.matchAll(TOKEN)) {
    const ht = m[0][0] === '#', w0 = ht ? m[0].slice(1) : m[0], at = m.index + (ht ? 1 : 0);
    const pos = [], w = w0.replace(/(\p{L})\1{2,}|[\s\S]/gu, (x, a, off) => { const r = a || x; for (let k = 0; k < r.length; k++) pos.push(off + k); return r; }); pos.push(w0.length); // elongation collapsed, pos[] = index in w0
    if (/^\p{N}/u.test(w) || /^[0-9a-f]{3,8}$/i.test(w)) continue; // hex colours, numbers
    if (!ht && !/\p{Ll}\p{Lu}/u.test(w) && !(VNCH.test(w) && !VNSYL.test(deaccent(w).toLowerCase())) && !/^[A-Z]{5,20}$/.test(w)) continue; // + ALL-CAPS run-together words without diacritics ("CAMKET")
    const c = segment(w, LX.known, LX.enWords, ht); if (!c) continue;
    let o = '', last = 0; const mp = [];
    for (const k of c) { o += w.slice(last, k) + ' '; for (let x = last; x < k; x++) mp.push(at + pos[x]); mp.push(at + pos[k]); last = k; }
    o += w.slice(last); for (let x = last; x < w.length; x++) mp.push(at + pos[x]);
    ms.push({ i: at, e: at + w0.length, o, mp, p: -1 }); // segmentation wins over leetspeak / elongation on the same word
  }
  if (!ms.length && !cuts.length) return null;
  for (const i of cuts) if (i < S.length) zone[i] = 1;
  ms.sort((a, b) => a.i - b.i || b.e - a.e || (a.p || 0) - (b.p || 0));
  // windows of context around every zone; the inner scan only reads these
  const win = ms.map(m => [Math.max(0, m.i - 80), Math.min(S.length, m.e + 80)]).concat(cuts.map(i => [Math.max(0, i - 80), Math.min(S.length, i + 81)])).sort((a, b) => a[0] - b[0]);
  const W = []; for (const w of win) { const l = W[W.length - 1]; if (l && w[0] <= l[1]) l[1] = Math.max(l[1], w[1]); else W.push([...w]); }
  let out = '', k = 0; const map = [];
  for (const [ws, we] of W) {
    if (out) { out += '\n¶\n'; map.push(ws, ws, ws); }
    let last = ws;
    for (; k < ms.length && ms[k].i < we; k++) {
      const m = ms[k]; if (m.i < last) continue;
      out += S.slice(last, m.i); for (let x = last; x < m.i; x++) map.push(x);
      out += m.o; for (const x of m.mp) map.push(x); zone.fill(1, m.i, m.e); last = m.e;
    }
    if (last < we) { out += S.slice(last, we); for (let x = last; x < we; x++) map.push(x); }
  }
  map.push(S.length); return { text: out, map, zone, leet };
}

// ------------------------------------------------------------------ lexicon
let CACHE = null;
const TONE_RX = new RegExp('[' + [0x300, 0x301, 0x303, 0x309, 0x323].map(c => String.fromCharCode(c)).join('') + ']', 'g');
const toneStrip = s => s.normalize('NFD').replace(TONE_RX, '').normalize('NFC'); // tone marks only; â ê ô ơ ư ă đ stay
const TYPO_CATS = new Set(['superlative', 'absolute-guarantee', 'urgency-deceptive']);
const TYPO_SKIP = new Set(['đi đầu', 'đứng đầu']); // "đi đâu", "đứng đâu" are ordinary questions
// only the claim syllable may lose its tone ("tốt nhât", "hàng đâu", "cam kêt", "miễn phi"); "bền nhất" -> "bên nhất" is not read
const TYPO_KEYS = new Set(['nhất', 'nhứt', 'đầu', 'kết', 'phí', 'một', 'đối', 'hảo', 'chắn', 'viễn', 'đời', 'mãi']);
const SEP = '\n' + String.fromCharCode(1) + '\n'; // unit separator of a batch scan: blocks every phrase, gap and context
function termSrc(t, nd, tight) { // tight: words may touch (spaced letters squeezed into one run: "h à n g đ ầ u")
  let x = canonTone(nfc(t)); if (nd) x = deaccent(x);
  const p = x.trim().split(/\s+/);
  return p.map((w, i) => (i ? (tight || /^\p{N}/u.test(w) || /\p{N}$/u.test(p[i - 1]) ? GAP0 : GAP) : '') + esc(w).replace(/-/g, '[-‐–\\s]?').replace(/['’]/g, "['’]")).join('');
}
const wrap = (src, r) => r.bound === false ? src : B0 + '(?:' + src + ')' + B1;
// a leading boundary lookbehind makes V8 try every position slowly: when the pattern starts with a literal it is dropped
// and checked by hand on each candidate (next()), which yields exactly the same matches at about twice the speed
// (a pattern that starts with a character class keeps it: there the lookbehind is the cheap filter)
const LMN_END = /[\p{L}\p{M}\p{N}]$/u, LIT = /^(?:\(\?:)*[\p{L}\p{N}]/u;
const fastRx = (src, flags) => { if (!src.startsWith(B0) || !LIT.test(src.slice(B0.length))) return new RegExp(src, flags); const r = new RegExp(src.slice(B0.length), flags); r.b0 = true; return r; };
const WORDRUN = /[\p{L}\p{M}]+/gu, LETTERS = /^[\p{L}\p{M}]+$/u;
// first words of the terms found in one word (memoised): a head made of letters only always lies inside one word
function headsIn(w, H) {
  let v = H.memo.get(w); if (v) return v; v = [];
  for (let i = 0; i < w.length; i++) { const c = H.by.get(w[i]); if (c) for (const h of c) if (w.startsWith(h, i)) v.push(h); }
  if (H.memo.size > 50000) H.memo.clear(); H.memo.set(w, v); return v;
}
function next(re, S) {
  let m;
  while ((m = re.exec(S))) { const i = m.index; if (re.b0 && i > 0 && LMN_END.test(S.slice(i > 1 ? i - 2 : 0, i))) { re.lastIndex = i + (S.codePointAt(i) > 0xFFFF ? 2 : 1); continue; } return m; }
  return null;
}
function compileList(list, nd) {
  return [].concat(list || []).map(e => {
    const cs = e.startsWith('rec:'), isRe = cs || e.startsWith('re:');
    let src = isRe ? canonTone(nfc(e.slice(cs ? 4 : 3))) : termSrc(e, nd);
    if (isRe && nd) src = deaccent(src);
    return fastRx(B0 + '(?:' + src + ')' + (isRe ? '' : B1), cs ? 'gmu' : 'gimu'); // plain phrases end at a word boundary
  });
}
// proper names match exactly: case-sensitive, whitespace between the words only
const compileNames = list => [].concat(list || []).map(n => new RegExp(B0 + canonTone(nfc(n)).trim().split(/\s+/).map(esc).join('[\\s\\u00A0]{1,3}'), 'gu'));
export function loadLexicon(file = LEX_FILE) {
  if (CACHE && CACHE.file === file) return CACHE;
  const L = JSON.parse(fs.readFileSync(file, 'utf8'));
  const sc = [...(L.scopes || [])].sort((a, b) => b.length - a.length).map(s => s.startsWith('re:') ? s.slice(3) : termSrc(s)).join('|');
  const pre = '(?:(?:tại|ở|trên|trong|của|in|on|at|of|across)\\s{1,3})?';
  const scopeRx = new RegExp(`^[\\s\\u00A0]{0,6}${pre}(?:${sc})(?:[\\s,]{1,3}${pre}(?:${sc}))*(?![\\p{L}\\p{M}\\p{N}])`, 'iu');
  const rules = L.rules.map((r, ri) => {
    const fl = 'gm' + (r.case ? '' : 'i') + 'u', terms = [...(r.terms || [])].sort((a, b) => b.length - a.length), rx = [];
    const heads = terms.map(t => keyOf(t).split(/[\s\p{N}#.\-‐–'’%$]/u)[0]);
    if (terms.length) rx.push({ re: fastRx(wrap(terms.map(t => termSrc(t)).join('|'), r), fl), heads: heads.every(Boolean) ? [...new Set(heads)] : null, t: 1 });
    for (const s of [].concat(r.re || [])) rx.push({ re: fastRx(wrap(canonTone(nfc(s)), r), fl + (r.group ? 'd' : '')), group: r.group });
    const skip = new Set((r.nodiacSkip || []).map(keyOf)), multi = terms.filter(t => /\s/.test(t.trim()) && !skip.has(keyOf(t)));
    const nd = r.nodiac && multi.length ? fastRx(wrap(multi.map(t => termSrc(t, true)).join('|'), r), fl) : null;
    const rep = {}, ndRep = {};
    for (const [k, v] of Object.entries(r.replace || {})) { const key = k === '*' ? '*' : keyOf(k); rep[key] = v; ndRep[key === '*' ? '*' : deaccent(key)] = deaccent(v); }
    return Object.assign({}, r, { ri, rx, nd, rep, ndRep, sorted: terms, multi, exc: null, ndExc: null, manualSet: new Set((r.manualTerms || []).map(keyOf)) });
  });
  // a proper name is never applied next to a claim scope ("Lê Văn Nhất Châu Á", "Phở Ngon Nhất Sài Gòn")
  const ns = [...(L.scopes || []).filter(s => !/^(?:hiện nay|hiện tại|ever|of all time|in history|re:)/.test(s)), ...(L.nameScopes || [])].sort((a, b) => b.length - a.length).map(s => termSrc(s)).join('|');
  const nameAfter = new RegExp(`^[\\s\\u00A0]{0,6}${pre}(?:${ns})(?![\\p{L}\\p{M}\\p{N}])`, 'iu'), nameBefore = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${ns})[\\s\\u00A0]{1,3}$`, 'iu');
  const known = new Set(VI_SYL), enWords = new Set();
  for (const r of L.rules) for (const t of r.terms || []) for (const w of keyOf(t).split(/[^\p{L}]+/u)) if (w) { if (r.lang === 'en') { if (/^[a-z]{3,}$/.test(w)) enWords.add(w); } else known.add(deaccent(w)); }
  for (const t of [...(L.scopes || []), ...(L.nameScopes || [])]) for (const w of keyOf(t).split(/[^\p{L}]+/u)) if (w) known.add(deaccent(w));
  // tone-dropped typing of blocked multi-word claim phrases ("tốt nhât", "cam kêt", "hàng đâu", "miễn phi"): every toned
  // vowel may also appear without its tone mark; exact phrases are left to the rules; a warning only
  const tterms = new Map();
  for (const r of L.rules) if (r.lang === 'vi' && TYPO_CATS.has(r.cat)) for (const t of r.terms || []) { const k = keyOf(t); if (/\s/.test(k) && k !== toneStrip(k) && !TYPO_SKIP.has(k)) tterms.set(k, r.id); }
  const tsrc = [...tterms.keys()].sort((a, b) => b.length - a.length).map(k => k.split(' ').map(w => TYPO_KEYS.has(w) ? [...w].map(ch => { const b = toneStrip(ch); return b !== ch ? '[' + ch + b + ']' : esc(ch); }).join('') : esc(w)).join(GAP));
  const tkeys = [...new Set([...TYPO_KEYS].map(toneStrip))].map(esc).join('|');
  const typo = tsrc.length ? { pre: new RegExp('(?<![\\p{L}\\p{M}])(?:' + tkeys + ')(?![\\p{L}\\p{M}])', 'giu'), re: new RegExp(B0 + '(?:' + tsrc.join('|') + ')' + B1, 'gimu'), exact: new Set(tterms.keys()), by: new Map([...tterms].map(([k, id]) => [toneStrip(k), { term: k, ruleId: id }])) } : null;
  const heads = { set: new Set(rules.flatMap(r => r.case ? [] : r.rx.flatMap(x => x.heads || [])).filter(h => LETTERS.test(h))), by: new Map(), memo: new Map() };
  for (const h of heads.set) { const c = heads.by.get(h[0]); if (c) c.push(h); else heads.by.set(h[0], [h]); }
  CACHE = { file, raw: L, rules, heads, scopeRx, nameAfter, nameBefore, known, typo, enWords: [...enWords].sort((a, b) => b.length - a.length), adj: new Set((L.nameAdjectives || []).map(keyOf)), surnames: new Set((L.surnames || []).map(s => canonTone(nfc(s)))),
    places: new Set((L.properNames || []).map(s => canonTone(nfc(s)))), names: compileNames(L.properNames), version: L.version, updated: L.updated };
  return CACHE;
}

// ------------------------------------------------------------------ scanning
function spans(S, rxs) { const out = []; for (const re of rxs) { re.lastIndex = 0; let m; while ((m = next(re, S))) { if (!m[0].length) { re.lastIndex++; continue; } out.push([m.index, m.index + m[0].length, m[0]]); } } return out.sort((a, b) => a[0] - b[0]); }
function covering(sp, s, e) { // sp sorted by start; spans are short phrases
  let lo = 0, hi = sp.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sp[m][0] <= s) lo = m + 1; else hi = m; }
  for (let i = lo - 1; i >= 0 && sp[i][0] >= s - 400; i--) if (sp[i][1] >= e) return sp[i];
  return null;
}
const ctx = (T, s, e) => (s > 30 ? '…' : '') + T.slice(Math.max(0, s - 30), Math.min(T.length, e + 30)).replace(/\s+/g, ' ') + (e + 30 < T.length ? '…' : '');
// project proper names (SB.legal.names): exact, >= 2 Title-Case syllables, no digits, no claim scope, no claim phrase
const NAME_OK = new Map();
export function validName(n, LX = loadLexicon()) {
  const key = LX.version + '|' + n; if (NAME_OK.has(key)) return NAME_OK.get(key);
  const w = canonTone(nfc(n)).trim().split(/\s+/), set = v => (NAME_OK.set(key, v), v);
  if (w.length < 2 || w.some(x => !/^\p{Lu}/u.test(x)) || /\p{N}/u.test(n)) return set('needs >= 2 Title-Case syllables, no digits');
  for (let i = 0; i < w.length; i++) if (LX.nameAfter.test(' ' + w.slice(i).join(' '))) return set('contains a claim scope');
  if (/^nh[ấứ]t$/iu.test(w[w.length - 1]) && !LX.places.has(w.join(' ')) && !(w.length >= 3 && LX.surnames.has(w[0])))
    return set('a name ending in "Nhất" must be a person name (a listed surname + at least 3 syllables) or a listed place');
  for (let i = 1; i < w.length; i++) if (/^nh[ấứ]t$/iu.test(w[i])) {
    const a = [w.slice(i - 1, i), w.slice(Math.max(0, i - 2), i)].map(x => x.join(' ')).find(x => LX.adj.has(keyOf(x)));
    if (a) return set(`"${a} ${w[i]}" is an adjective + Nhất (a claim, not a name)`);
  }
  for (const f of scanText(n, { _nameCheck: true })) {
    const words = s => s.trim().split(/\s+/).length;
    if (f.cat === 'superlative' && words(f.term) === 1) continue; // the single word a name may carry
    if (f.ruleId === 'sym-leaders' && words(f.term) < w.length) continue; // a person's own name that contains a hero's name
    return set(`contains the blocked phrase "${f.term}" (${f.ruleId})`);
  }
  return set(null);
}
// declared addresses (SB.legal.addresses): an exact phrase that starts with "Số 1 / Số một" + a street name
const ADDR_OK = new Map();
export function validAddress(a, LX = loadLexicon()) {
  const key = LX.version + '|' + a; if (ADDR_OK.has(key)) return ADDR_OK.get(key);
  const set = v => (ADDR_OK.set(key, v), v), m = /^[Ss]ố\s+(?:1|một),?\s+(.+)$/u.exec(canonTone(nfc(a)).trim());
  if (!m || !/^(?:(?:đường|phố|ngõ|ngách|hẻm|kiệt|đại\s+lộ)\s+)?\p{Lu}/u.test(m[1]) || m[1].split(/[\s,]+/).length < 2) return set('must start with "Số 1" followed by a capitalised street name (>= 2 words)');
  if (LX.scopeRx.test(' ' + m[1])) return set('a claim scope follows "Số 1"');
  const bad = scanText(a, { _nameCheck: true }).find(f => f.ruleId !== 'sup-vi-number-one' && f.sev !== 'info');
  return set(bad ? `contains the blocked phrase "${bad.term}" (${bad.ruleId})` : null);
}
/** scanUnits(texts, opts) -> findings[][] — one scan over many separate units (lines, cues), same result as scanText on each
 *  unit: units are joined with a separator that no phrase, gap or context crosses, ^ / $ are line anchors, the
 *  no-diacritics pass is decided per unit, and a match that would span two units is dropped. Linear on large files. */
export function scanUnits(texts, opts = {}) {
  const T = texts.map(t => nfc(t)), out = T.map(() => []);
  if (T.length < 2 || T.some(t => t.includes(SEP[1]))) return T.map(t => scanText(t, opts));
  const st = []; let p = 0; for (const t of T) { st.push(p); p += t.length + SEP.length; }
  for (const f of scanText(T.join(SEP), Object.assign({}, opts, { _batch: true }))) {
    let lo = 0, hi = st.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (st[m] <= f.index) lo = m; else hi = m - 1; }
    const u = T[lo], a = f.index - st[lo]; let b = f.end - st[lo];
    if (b > u.length) { if (/\S/.test(SEP.slice(0, b - u.length))) continue; b = u.length; } // trailing whitespace only
    out[lo].push(Object.assign(f, { index: a, end: b, term: u.slice(a, b), context: ctx(u, a, b) }));
  }
  return out;
}
/** scanText(text, { lang, audience, allow: [phrases], names: [proper names], addresses: [declared addresses] }) -> findings[] */
export function scanText(text, opts = {}) {
  const LX = loadLexicon(opts.lexicon), T = nfc(text), lang = opts.lang || 'auto', inner = !!opts._S;
  const nz = inner ? { N: T, map: null, cuts: [] } : normalise(T), S = inner ? opts._S : mask(canonTone(nz.N)), low = S.toLowerCase();
  if (!/[\p{L}\p{N}#$€£¥]/u.test(S)) return [];
  let noDiac = !!opts._nd || (deaccent(S) === S && looksVi(S)), segAt = null;
  if (opts._batch && !opts._nd) { // one scan over many units: the no-diacritics pass is decided per unit, as for a single scan
    const st = [], fl = []; let p = 0;
    for (const part of S.split(SEP)) { st.push(p); fl.push(deaccent(part) === part && looksVi(part)); p += part.length + SEP.length; }
    noDiac = fl.some(Boolean);
    segAt = i => { let lo = 0, hi = st.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (st[m] <= i) lo = m; else hi = m - 1; } return fl[lo]; };
  }
  const found = [];
  let hp = null; // heads present in the text: a head made of letters only lies inside one word, so the distinct words are read once
  const hasHead = h => { if (!LX.heads.set.has(h)) return low.includes(h); if (!hp) { hp = new Set(); for (const w of new Set(low.match(WORDRUN))) for (const k of headsIn(w, LX.heads)) hp.add(k); } return hp.has(h); };
  for (const R of LX.rules) {
    if (R.audience && R.audience !== opts.audience) continue;
    if (lang !== 'auto' && R.lang !== 'any' && R.lang !== lang) continue;
    let exc = null;
    const take = (s, e, nd) => {
      if (e <= s || (nd && segAt && !segAt(s))) return;
      exc = exc || spans(S, nd ? (R.ndExc = R.ndExc || (R.nodiac ? compileList(R.except, true) : [])) : (R.exc = R.exc || compileList(R.except)));
      if (covering(exc, s, e)) return;
      const k = keyOf(S.slice(s, e)), manual = R.manual || R.manualSet.has(k);
      const rp = manual ? undefined : nd ? (R.ndRep[k] ?? R.ndRep['*']) : (R.rep[k] ?? R.rep['*']);
      found.push({ ruleId: R.id, ri: R.ri, cat: R.cat, sev: (opts.audience === 'kids' && R.sevKids) || R.sev, lang: R.lang, term: S.slice(s, e), index: s, end: e, basis: R.basis, fix: R.fix,
        replace: rp === undefined ? null : rp, dropScope: !!R.dropScope, confidence: nd ? 'low' : 'high', note: nd ? 'text without diacritics (never auto-fixed)' : null,
        suggestion: (rp === undefined ? 'manual rewrite required. ' : rp === '' ? 'remove the word. ' : `→ "${rp}". `) + (R.fix || '') });
    };
    const run = (re, nd, group) => { re.lastIndex = 0; let m; while ((m = next(re, S))) { if (!m[0].length) { re.lastIndex++; continue; } let s = m.index, e = s + m[0].length; if (group && m.indices) { const g = m.indices.slice(1).find(Boolean); if (g) [s, e] = g; } take(s, e, nd); } };
    const hd = R.rx[0] && R.rx[0].t && R.rx[0].heads;
    if (opts._tight && R.sorted.length) { // squeezed spaced letters: words may touch
      if (hd && !R.case && !hd.some(hasHead)) { for (const { re, group } of R.rx.filter(x => !x.t)) run(re, false, group); }
      else {
      R.tight = R.tight || fastRx(wrap(R.sorted.map(t => termSrc(t, false, true)).join('|'), R), 'gm' + (R.case ? '' : 'i') + 'u');
      run(R.tight, false);
      for (const { re, group } of R.rx.filter(x => !x.t)) run(re, false, group); }
    } else for (const { re, group, heads } of R.rx) {
      if (heads && !R.case && !heads.some(hasHead)) continue; // cheap prefilter on the first word of every term
      run(re, false, group);
    }
    if (noDiac && R.nd) { exc = null; if (opts._tight) R.ndTight = R.ndTight || fastRx(wrap(R.multi.map(t => termSrc(t, true, true)).join('|'), R), 'gm' + (R.case ? '' : 'i') + 'u'); run(opts._tight ? R.ndTight : R.nd, true); }
  }
  if (inner) return dedupe(found);
  { // obfuscated spellings: scanned once on the squeezed copy; only matches inside a squeezed zone and not already found
    const q = squeeze(S, nz.cuts, LX);
    if (q) {
      const occ = new Uint8Array(S.length + 1); for (const g of found) occ.fill(1, g.index, g.end);
      const nd = q.leet ? deaccent(q.text) : null; // leetspeak yields text without diacritics: read the whole window that way too
      const inner = scanText(q.text, Object.assign({}, opts, { _S: q.text, _tight: true, _nd: true }));
      if (nd && nd !== q.text && nd.length === q.text.length) inner.push(...scanText(nd, Object.assign({}, opts, { _S: nd, _tight: true, _nd: true })).map(f => Object.assign(f, { term: q.text.slice(f.index, f.end) })));
      for (const f of inner.sort((a, b) => a.index - b.index || b.end - a.end)) {
        const s = q.map[f.index], e = q.map[f.end - 1] + 1; let z = false, o = false;
        for (let i = s; i < e; i++) { if (q.zone[i]) z = true; if (occ[i]) { o = true; break; } }
        if (z && !o) { found.push(Object.assign(f, { index: s, end: e, replace: null, confidence: 'low', note: 'obfuscated spelling', suggestion: 'manual rewrite required. ' + (f.fix || '') })); occ.fill(1, s, e); }
      }
    }
  }
  if (LX.typo && /[\u00C0-\u1EF9]/.test(S)) { // tone-dropped typing of a blocked phrase: warning, never auto-fixed
    const occ = new Uint8Array(S.length + 1); for (const g of found) occ.fill(1, g.index, g.end);
    const hits = [], seen = new Set(), LM = /[\p{L}\p{M}\p{N}]/u;
    const win = []; // a typo needs a toneless key syllable: read only ±60 characters around each (merged windows)
    for (const p of S.matchAll(LX.typo.pre)) { const a = Math.max(0, p.index - 60), b = Math.min(S.length, p.index + p[0].length + 60), l = win[win.length - 1]; if (l && a <= l[1]) l[1] = b; else win.push([a, b]); }
    for (const [a, b] of win) {
      for (const m of S.slice(a, b).matchAll(LX.typo.re)) { const i = a + m.index, j = i + m[0].length; if (seen.has(i) || (i > 0 && LM.test(S[i - 1])) || (j < S.length && LM.test(S[j]))) continue; seen.add(i); hits.push({ index: i, 0: m[0] }); }
    }
    for (const m of hits) {
      const k = keyOf(m[0]); if (LX.typo.exact.has(k)) continue;
      const t = LX.typo.by.get(toneStrip(k)), s0 = m.index, e0 = s0 + m[0].length; if (!t) continue;
      let o = false; for (let i = s0; i < e0; i++) if (occ[i]) { o = true; break; } if (o) continue;
      found.push({ ruleId: 'typo-blocked-phrase', ri: 9999, cat: 'possible-typo', sev: 'warn', lang: 'vi', term: m[0], index: s0, end: e0, basis: 'Owner policy 2026-10-02 (blocked claim phrases); typing without the tone mark is still the claim for a viewer.',
        fix: 'Rewrite without the claim, or confirm the wording in legal_review.json.', replace: null, dropScope: false, confidence: 'low', note: 'possible typo of the blocked phrase "' + t.term + '" (' + t.ruleId + ')',
        suggestion: 'rewrite, or confirm in legal_review.json: possible typo of the blocked phrase "' + t.term + '"' });
      occ.fill(1, s0, e0);
    }
  }
  const out = dedupe(found);
  const M = nz.map, toT = (s, e) => M ? [M[s], M[e - 1] + (T.codePointAt(M[e - 1]) > 0xFFFF ? 2 : 1)] : [s, e];
  // proper names and declared addresses are not claims: the built-in closed list + valid SB.legal.names entries neutralise
  // the single word "nhất" inside the exact name (or a hero's name inside a declared person's name); valid
  // SB.legal.addresses entries neutralise "số 1" inside the exact address. Never next to a claim scope; always printed.
  const nsp = [];
  if (!opts._nameCheck) {
    const lists = [...LX.names.map(r => [r, 'built-in name']), ...compileNames((opts.names || []).filter(n => !validName(n, LX))).map(r => [r, 'SB.legal.names']),
      ...compileNames((opts.addresses || []).filter(a => !validAddress(a, LX))).map(r => [r, 'SB.legal.addresses'])];
    for (const [re, src] of lists) for (const m of S.matchAll(new RegExp(re.source, re.flags))) if (!/[\p{L}\p{M}\p{N}]/u.test(S[m.index + m[0].length] || '')) nsp.push([m.index, m.index + m[0].length, m[0], src]);
  }
  nsp.sort((a, b) => a[0] - b[0]);
  for (const f of out) {
    const n = nsp.length && covering(nsp, f.index, f.end);
    if (!n) continue;
    const addr = n[3] === 'SB.legal.addresses';
    if (addr ? f.ruleId !== 'sup-vi-number-one' : !((f.cat === 'superlative' && !/\s/.test(f.term.trim())) || (f.ruleId === 'sym-leaders' && n[3] === 'SB.legal.names' && n[1] - n[0] > f.end - f.index))) continue;
    const name = T.slice(...toT(n[0], n[1]));
    if (!addr && (LX.nameAfter.test(S.slice(n[1], n[1] + 80)) || LX.nameBefore.test(S.slice(Math.max(0, n[0] - 80), n[0])))) f.note = `proper name "${name}" not applied: a claim scope is next to it`;
    else Object.assign(f, { sev: 'info', note: addr ? `declared address "${name}" — not a claim (SB.legal.addresses)` : `proper name "${name}" — not a claim (${n[3]})` });
  }
  if (opts.allow && opts.allow.length) { // owner policy: the allow-list never suppresses an error, only warnings
    const al = spans(S, compileList(opts.allow));
    for (const f of out) if (f.sev === 'warn' && covering(al, f.index, f.end)) Object.assign(f, { sev: 'info', note: 'allow-listed by the project (SB.legal.allow)' });
  }
  for (const f of out) { // back to the original text; hidden / full-width characters inside a match are never auto-fixed
    const [a, b] = toT(f.index, f.end), hidden = M && T.slice(a, b) !== nz.N.slice(f.index, f.end);
    Object.assign(f, { index: a, end: b, term: T.slice(a, b), context: ctx(T, a, b) });
    if (hidden) Object.assign(f, { replace: null, confidence: 'low', note: [f.note, 'hidden or full-width characters (never auto-fixed)'].filter(Boolean).join('; '), suggestion: 'manual rewrite required. ' + (f.fix || '') });
  }
  return out.sort((a, b) => a.index - b.index || b.end - a.end);
}
// most specific finding wins inside one category ("tốt nhất" over "nhất"); windowed, so dense text stays linear
function dedupe(found) {
  const rank = f => SEV[f.sev] * 2 + (f.confidence === 'high' ? 1 : 0), len = f => f.end - f.index, by = {};
  found.forEach((f, i) => { f._i = i; (by[f.cat] = by[f.cat] || []).push(f); });
  const beats = (g, f) => len(g) > len(f) || rank(g) > rank(f) || (rank(g) === rank(f) && (g.ri < f.ri || (g.ri === f.ri && g._i < f._i)));
  const out = [];
  for (const arr of Object.values(by)) {
    arr.sort((a, b) => a.index - b.index);
    arr.forEach((f, i) => {
      for (let j = i - 1; j >= 0 && arr[j].index >= f.index - 300; j--) { const g = arr[j]; if (g.end >= f.end && beats(g, f)) return; }
      for (let j = i + 1; j < arr.length && arr[j].index === f.index; j++) { const g = arr[j]; if (g.end >= f.end && beats(g, f)) return; }
      out.push(f);
    });
  }
  return out;
}

// ------------------------------------------------------------------ fixing (only certain rewrites; the rest is manual)
const capFirst = s => s.replace(/^(\P{L}*)(\p{Ll})/u, (m, a, b) => a + b.toUpperCase());
function matchCase(orig, rep) {
  if (!rep) return rep;
  const letters = orig.replace(/\P{L}/gu, '');
  if (letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) return rep.toUpperCase();
  return /^\P{L}*\p{Lu}/u.test(orig) ? capFirst(rep) : rep;
}
const LEAD = /^[ \t ]*(?:(?:[-*+•]|\p{N}{1,3}[.)])[ \t]+)?/u; // indentation + Markdown list marker are kept
function tidy(s0, orig) {
  const lead = LEAD.exec(orig)[0], s = (s0.startsWith(lead) ? s0.slice(lead.length) : s0).replace(/^[ \t ]+/, '');
  let t = s.replace(/[ \t ]{2,}/g, ' ').replace(/[ \t ]+([,.;:!?…%)\]])/g, '$1').replace(/([(\[])[ \t ]+/g, '$1')
    .replace(/(^|[\s(])\*{2,4}(?=$|[\s,.;:!?)])/g, '$1').replace(/(^|[\s(])_{2}(?=$|[\s,.;:!?)])/g, '$1')
    .replace(/^[,;:–—][\s]*(?=\p{L})/u, '').replace(/([,;:])(?=\s*[.!?]|$)/g, '').replace(/[ \t ]+$/g, '');
  if (/^\P{L}*\p{Lu}/u.test(orig.slice(lead.length))) t = capFirst(t);
  return lead + t;
}
const PREP = /^[\s*_]*(?:về|của|trong|tại|cho|với|và|là|ở|in|of|for|at|on|to|with|and|is)(?![\p{L}\p{M}])/iu;
/** fixText(text, opts) -> { text, changes, unresolved } — never invents a claim; uncertain rewrites stay manual */
export function fixText(text, opts = {}) {
  const LX = loadLexicon(opts.lexicon), T = nfc(text), F = (opts._findings || scanText(T, opts)).filter(f => f.sev !== 'info'); // _findings: precomputed by a batch scan
  const cand = F.filter(f => f.replace != null && (f.sev === 'error' || opts.fixWarn) && f.confidence === 'high').sort((a, b) => (b.end - b.index) - (a.end - a.index) || a.index - b.index), chosen = [];
  const used = new Uint8Array(T.length + 1), free = (a, b) => { for (let i = a; i < b; i++) if (used[i]) return false; return true; }, take = (a, b, v = 1) => { for (let i = a; i < b; i++) used[i] = v; };
  for (const f of cand) if (free(f.index, f.end)) { chosen.push(f); take(f.index, f.end); }
  chosen.sort((a, b) => b.index - a.index);
  // built right-to-left from pieces with windowed context (linear on long, dense text)
  const pieces = [], changes = [], skipped = new Set(); let cur = T.length;
  let rightHead = ''; // the first 300 characters of the text already rebuilt to the right of cur
  const tailWin = (e, n = 300) => { const a = T.slice(e, Math.min(cur, e + n)); return a.length >= n ? a : (a + rightHead).slice(0, n); };
  for (const f of chosen) {
    let s = f.index, e = f.end, rep = f.replace;
    if (rep === '') while (s > 0 && e < cur && T[s - 1] === T[e] && (T[e] === '*' || T[e] === '_')) { s--; e++; }
    const marks = (T.slice(s, e).match(/\*/g) || []).length % 2 && rep ? '*' : '';
    let keep = ''; // closing markup between the term and a dropped scope stays ("**tốt nhất** Việt Nam" -> "**tốt**")
    if (f.dropScope) { const t2 = T.slice(e, Math.min(cur, e + 300)), mk = /^[*_]{0,4}/.exec(t2)[0], m = LX.scopeRx.exec(canonTone(t2.slice(mk.length))); if (m) { keep = mk; e += mk.length + m[0].length; } }
    const orig = T.slice(s, e), before = T.slice(Math.max(0, s - 300), s), after = tailWin(e), aft = after.replace(/^[\s*_]+/, '');
    const bt = before.slice(-80), clauseStart = (s <= 300 && !before.trim()) || /[.!?:;]\s*$/.test(bt);
    const uncertain = (f.lang === 'en' && rep !== '' && /^[\s*_]*(?:[.!?…,;:)]|$)/.test(after)) // predicative "It is the best."
      || (f.lang === 'en' && /^[^.!?\n]{0,40}?(?<![\p{L}])(?:ever|of all time|in history)(?![\p{L}])/iu.test(after)) // "largest system ever"
      || (f.lang === 'vi' && /^[\s*_]*là(?![\p{L}\p{M}])/u.test(after) && !/^[\s*_]*là\s+\p{N}/u.test(after) && f.ruleId !== 'sup-vi-advice') // "đẹp nhất là …"
      || (rep === '' && /(?:^|[^\p{L}])(?:là|của|is|are|was|were|be|of|the)\s*$/iu.test(bt.replace(/[\s*_]+$/, '')) && (/^[.!?…,;:)]/.test(aft) || !aft))
      || (rep === '' && clauseStart && (PREP.test(after) || !/\p{L}/u.test(aft.split(/[.!?\n]/)[0])))
      || (f.lang === 'vi' && /^[\s*_]*(?:ngành|dòng|loại|hạng|lớp|nhóm|giới|khối|lĩnh\s+vực|mảng)(?![\p{L}\p{M}])/iu.test(after)); // "Giỏi nhất ngành": no fragment
    if (uncertain) { skipped.add(f); continue; }
    rep = matchCase(orig.replace(/^[\s*_]+/, ''), rep);
    if (/^an?$/i.test(rep)) rep = /^\s*[aeiouAEIOU]/.test(after) ? rep[0] + 'n' : rep[0];
    let pre = '', seg = T.slice(e, cur);
    if (rep === '') { const a = /(^|[^\p{L}])(an?)(\s+)$/iu.exec(bt); if (a) { s -= a[2].length + a[3].length; pre = (/^\s*[*_]*[aeiouAEIOU]/.test(after) ? a[2][0] + 'n' : a[2][0]) + a[3]; } }
    if (rep === '' && /^\P{L}*\p{Lu}/u.test(orig) && clauseStart) seg = capFirst(seg);
    const put = pre + marks + rep + keep; pieces.push(seg, put); rightHead = (put + seg.slice(0, 300) + rightHead).slice(0, 300); cur = s;
    changes.push({ from: orig, to: marks + rep + keep, ruleId: f.ruleId, cat: f.cat });
  }
  pieces.push(T.slice(0, cur));
  let out = changes.length ? tidy(pieces.reverse().join(''), T) : T;
  if (changes.length && /\p{L}/u.test(T) && !/\p{L}{2,}/u.test(out)) { out = T; chosen.forEach(f => skipped.add(f)); changes.length = 0; } // nothing left
  used.fill(0); for (const f of chosen) if (!skipped.has(f)) take(f.index, f.end, 2);
  const cs = new Set(chosen), unresolved = F.filter(f => (!cs.has(f) || skipped.has(f)) && free(f.index, f.end))
    .map(f => skipped.has(f) ? Object.assign({}, f, { suggestion: 'manual rewrite required (no certain automatic rewrite). ' + (f.fix || '') }) : f);
  return { text: out, changes: changes.reverse(), unresolved };
}

// ------------------------------------------------------------------ storyboard (compiled like kv-lint)
const TEXT_KEYS = new Set(['text', 'lines', 'title', 'sub', 'eyebrow', 'items', 'word', 'caption', 'cta', 'label', 'labels', 'xLabels', 'yLabels', 'chips', 'chip', 'tiles', 'button', 'bubble', 'note', 'footnote', 'disclaimer', 'quote', 'author', 'headline', 'subtitle', 'body', 'desc', 'description', 'question', 'answer', 'options', 'tag', 'tags', 'hint', 'value', 'unit', 'prefix', 'suffix', 'repeat', 'alt', 'heading', 'kicker', 'badge', 'mark', 'stamp', 'ribbon', 'seal', 'sticker', 'callout', 'overline', 'banner', 'tagline', 'slogan', 'claim', 'myth', 'fact', 'price', 'legend', 'steps', 'points', 'bullets', 'pros', 'cons']);
const IDENT_KEYS = new Set(['kind', 'id', 'style', 'enter', 'exit', 'at', 'src', 'font', 'color', 'bg', 'bgColor', 'fill', 'outlineColor', 'accent', 'accents', 'accentLine', 'grade', 'focus', 'idle', 'pose', 'align', 'bullet', 'tail', 'theme', 'preset', 'type', 'voice', 'lang', 'file', 'photo', 'illus', 'logo', 'mask', 'blend', 'ease', 'dir', 'shape', 'icon', 'name', 'sfx', 'say', 'layers', 'trans', 'snap', 'filter', 'composite']);
const prose = v => /\s/.test(v) && /\p{L}{2,}/u.test(v) && !/^(?:https?:|data:|\.{0,2}\/)/i.test(v) && !/^(?:rgba?|hsla?|brightness|contrast|blur|saturate|linear-gradient|radial-gradient|url|drop-shadow)\(/i.test(v) && !/\.(?:png|jpe?g|webp|svg|mp4|wav|js|json)$/i.test(v);
function collect(v, key, where, push, depth = 0) {
  if (v == null || depth > 6) return;
  if (typeof v === 'string') { if (TEXT_KEYS.has(key) || prose(v)) push(where, v); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => collect(x, key, `${where}[${i}]`, push, depth + 1)); return; }
  if (typeof v !== 'object') return;
  numText(v, where, push);
  for (const [k, x] of Object.entries(v)) if (!IDENT_KEYS.has(k)) collect(x, /^[hfvs]$/.test(k) && TEXT_KEYS.has(key) ? key : k, `${where}.${k}`, push, depth + 1); // per-aspect values inherit the key
}
// numbers rendered with a prefix / suffix (tiles, counters): "$499", "USD 500", "99 USD"
function numText(v, where, push) {
  const num = ['value', 'to', 'count', 'n'].find(k => typeof v[k] === 'number');
  if (num && ['prefix', 'suffix', 'unit'].some(k => typeof v[k] === 'string')) push(`${where}.(${num} with prefix/suffix)`, `${v.prefix || ''}${v[num]}${v.suffix || v.unit || ''}`);
}
const NOJOIN = /(?:\.(?:prefix|suffix|unit|value)|prefix\/suffix\))$/;
/** loadProject(dir) -> { SB, TL } compiled with kv-core + presets (+ kv-presets-ad.js when present) like kv-lint */
export function loadProject(P) {
  const core = fs.existsSync(path.join(HERE, 'kv-core.js')) ? HERE : path.join(P, 'kv');
  const KVC = require(path.join(core, 'kv-core.js')), PRESETS = require(path.join(core, 'kv-presets.js'));
  const ad = path.join(core, 'kv-presets-ad.js'); if (fs.existsSync(ad)) { const ext = require(ad); if (typeof ext === 'function') ext(PRESETS); }
  const any = new Proxy({}, { get: () => (v => v) });
  const KV = new Proxy({ define: k => k, presets: PRESETS, R: v => v, col: c => c }, { get: (t, k) => k in t ? t[k] : (v => v) });
  const BRAND = fs.existsSync(path.join(P, 'brand.js')) ? new Function(fs.readFileSync(path.join(P, 'brand.js'), 'utf8') + '\n;return typeof BRAND !== "undefined" ? BRAND : {};')() : {};
  const SB = new Function('KV', 'BRAND', 'MV', fs.readFileSync(path.join(P, 'storyboard.js'), 'utf8') + '\n;return typeof SB !== "undefined" ? SB : null;')(KV, BRAND, any);
  if (!SB) throw new Error('storyboard.js must define `var SB = { ... }`');
  return { SB, TL: KVC.compile(SB, PRESETS), KVC };
}
const legalOpts = (SB, o) => ({ audience: o.audience ?? SB.audience, allow: [].concat((SB.legal && SB.legal.allow) || []), names: [].concat((SB.legal && SB.legal.names) || []), addresses: [].concat((SB.legal && SB.legal.addresses) || []), lang: o.lang });
/** scanTimeline(SB, TL, { projectDir, audience }) -> { items, findings } — used by kv-lint (no second compile) */
export function scanTimeline(SB, TL, o = {}) {
  const lo = legalOpts(SB, o), items = [];
  const push = (scene, layer, key) => (where, text) => items.push({ scene, layer, key, where, text });
  for (const sc of TL.scenes) {
    const walk = (L, id) => {
      numText(L, `${sc.id} · ${id}`, push(sc.id, id, 'value'));
      for (const [k, v] of Object.entries(L)) if (!IDENT_KEYS.has(k) && k !== 'layers') collect(v, k, `${sc.id} · ${id} · ${k}`, push(sc.id, id, k));
      (L.layers || []).filter(Boolean).forEach((c, j) => walk(c, `${id}.${j}`));
    };
    const n0 = items.length;
    (sc.layers || []).filter(Boolean).forEach(L => walk(L, L.id));
    // lines read together: the parts of one layer field and the children of one stack/group (never separate
    // top-level layers) are joined, and only matches that cross a line boundary are kept
    const groups = {};
    for (const it of items.slice(n0).filter(x => !NOJOIN.test(x.where))) { const d = String(it.layer).split('.'), g = d.length > 2 ? d.slice(0, -1).join('.') : `${it.layer}:${it.key}`; (groups[g] = groups[g] || []).push(it.text); }
    for (const [g, parts] of Object.entries(groups)) if (parts.length > 1) items.push({ scene: sc.id, layer: g, key: 'lines', where: `${sc.id} · ${g} · lines joined`, text: parts.join(' '), parts });
  }
  const says = TL.events.filter(e => e.type === 'say');
  for (const e of says) items.push({ scene: e.scene, layer: e.layer, key: 'say', where: `${e.scene} · ${e.layer || 'scene'} · say`, text: e.text });
  for (const k of ['title', 'caption', 'description', 'post', 'hashtags']) collect(SB[k], 'text', `SB.${k}`, (where, text) => items.push({ key: k, where, text }));
  const findings = [];
  for (const a of lo.addresses) { const why = validAddress(a); if (why) findings.push({ where: 'SB.legal.addresses', ruleId: 'legal-addresses', cat: 'tool', sev: 'warn', term: a, index: 0, end: 0, context: a, suggestion: `SB.legal.addresses entry ignored: ${why}`, confidence: 'high' }); }
  for (const n of lo.names) { const why = validName(n); if (why) findings.push({ where: 'SB.legal.names', ruleId: 'legal-names', cat: 'tool', sev: 'warn', term: n, index: 0, end: 0, context: n, suggestion: `SB.legal.names entry ignored: ${why}`, confidence: 'high' }); }
  for (const it of items) {
    let fs_ = scanText(it.text, lo);
    if (it.parts) { const cuts = []; let p = 0; for (const x of it.parts.slice(0, -1)) { p += nfc(x).length; cuts.push(p); p += 1; } fs_ = fs_.filter(f => cuts.some(c => f.index < c && f.end > c)); }
    for (const f of fs_) findings.push(Object.assign({ joined: !!it.parts, file: o.projectDir ? path.join(o.projectDir, 'storyboard.js') : 'storyboard.js', where: it.where, scene: it.scene, layer: it.layer, key: it.key, text: it.text }, f));
  }
  if (o.projectDir) {
    const P = o.projectDir, sayText = new Set(says.map(e => nfc(e.text)));
    for (const f of fs.readdirSync(P).filter(f => /\.(srt|vtt)$/i.test(f))) findings.push(...scanFile(path.join(P, f), lo).findings);
    if (fs.existsSync(path.join(P, 'vo.json'))) findings.push(...scanFile(path.join(P, 'vo.json'), lo).findings.filter(f => !sayText.has(nfc(f.text)))); // lines not in the storyboard
    for (const s of [].concat(SB.scripts || [])) { const f = path.join(P, s); if (fs.existsSync(f)) findings.push(...scanFile(f, lo).findings); }
  }
  let review = null, units = null;
  if (o.projectDir && o.review !== false && typeof o.final === 'boolean') { // semantic review artifact (final: error, draft: warning)
    units = reviewUnits(items, SB, o.projectDir);
    const rc = reviewCheck(units, readReview(o.projectDir), { final: o.final, file: path.join(o.projectDir, REVIEW_FILE), version: loadLexicon(o.lexicon).version });
    findings.push(...rc.findings); review = rc.summary;
  }
  return { items, findings, audience: lo.audience, review, units };
}
export function scanStoryboard(P, o = {}) {
  let loaded; try { loaded = loadProject(P); } catch (e) {
    return { items: [], findings: [{ file: path.join(P, 'storyboard.js'), where: 'storyboard.js', ruleId: 'legal-load', cat: 'tool', sev: 'error', term: '', index: 0, end: 0, context: e.message, basis: '', suggestion: 'storyboard.js could not be evaluated; fix it (node kv.mjs compile) and rerun the legal gate', confidence: 'high' }] };
  }
  return Object.assign(scanTimeline(loaded.SB, loaded.TL, Object.assign({ projectDir: P }, o, { final: o.final !== false })), { SB: loaded.SB });
}

// ------------------------------------------------------------------ semantic review artifact (legal_review.json)
// The lexical + structural gate cannot see every synonym, paraphrase or new slang. Before final delivery every text unit
// carries a reviewer verdict ('ok' | 'rewrite'); a changed text (sha1 mismatch) needs a new verdict. The review never
// clears a lexical error. Drafting (kv-lint, stills): one warning while the review is pending.
export const REVIEW_FILE = 'legal_review.json';
const REVIEW_HOWTO = [
  'Read every unit in its scene, together with the image / map / flag shown on screen (references/legal_compliance.md section 6).',
  "verdict 'ok' = no superlative, absolute, comparative or free claim and no political, inciting, discriminatory, obscene, anti-customs or sovereignty content in ANY wording: synonyms, slang, paraphrase, other languages, emoji, hashtags.",
  "verdict 'rewrite' (+ note) = anything else: fix storyboard.js, rerun node kv.mjs legal --review-template and review the changed units again.",
  'Fill reviewer (name or agent id) and date (YYYY-MM-DD). The final gate (node kv.mjs legal, kv.mjs qa, kv.mjs make before build) fails while any unit is new, changed, pending or rewrite. The review never clears a lexical error.'];
const reviewKey = t => nfc(String(t)); // the raw text (NFC): any visible change — emoji, flag, punctuation, spacing — needs a new verdict
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const realDate = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (!m) return false; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; };
/** unitHash(text) -> sha1 of the raw text (NFC only) */
export const unitHash = t => crypto.createHash('sha1').update(reviewKey(t), 'utf8').digest('hex');
/** reviewUnits(items, SB, projectDir) -> [{ id, scene, field, text, sha1 }]: every text a viewer reads or hears (joined lines excluded) */
export function reviewUnits(items, SB, P) {
  const out = [], seen = new Map();
  const add = (id, scene, field, text) => {
    if (!nfc(text).trim()) return;
    const n = (seen.get(id) || 0) + 1; seen.set(id, n);
    out.push({ id: n > 1 ? id + ' #' + n : id, scene: scene ?? null, field, text: nfc(text), sha1: unitHash(text) });
  };
  for (const it of items) if (!it.parts) add(it.where, it.scene, it.scene != null ? it.where.split(' · ').slice(1).join(' · ') : it.where, it.text);
  if (P && fs.existsSync(P)) {
    const say = new Set(items.filter(i => i.key === 'say').map(i => reviewKey(i.text)));
    const files = fs.readdirSync(P).filter(f => /\.(srt|vtt)$/i.test(f) || f === 'vo.json').concat([].concat((SB && SB.scripts) || []));
    for (const f of [...new Set(files)]) {
      const p = path.join(P, f); if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
      for (const u of textUnits(p, nfc(fs.readFileSync(p, 'utf8')))) if (!(f === 'vo.json' && say.has(reviewKey(u.text)))) add(f + ':' + u.line, null, path.basename(p) + ':' + u.line + (u.cue ? ' (cue ' + u.cue + ')' : ''), u.text);
    }
  }
  return out;
}
/** readReview(projectDir) -> parsed legal_review.json | null when absent | { invalid } when unreadable */
export function readReview(P) {
  const f = path.join(P, REVIEW_FILE); if (!fs.existsSync(f)) return null;
  try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : { invalid: 'not a JSON object' }; } catch (e) { return { invalid: e.message }; }
}
const KIND = { new: 'new text, no verdict', stale: 'text changed since the review (sha1 mismatch)', rewrite: "verdict 'rewrite'", pending: 'verdict missing' };
/** reviewCheck(units, review, { final, file, version }) -> { findings, summary }: final -> one error per unit without 'ok'; draft -> one warning */
export function reviewCheck(units, review, o = {}) {
  const final = o.final !== false, file = o.file || REVIEW_FILE, rel = path.basename(file), probs = [], tally = { new: 0, stale: 0, rewrite: 0, pending: 0 };
  let head = null;
  if (!review) head = rel + ' is missing';
  else if (review.invalid) head = rel + ' is not valid (' + review.invalid + ')';
  else {
    const byId = new Map(), ids = new Set(), okHash = new Set();
    for (const e of [].concat(review.units || [])) {
      if (!e || e.id == null) continue; ids.add(String(e.id));
      if (typeof e.text !== 'string' || e.sha1 !== unitHash(e.text)) continue; // an entry whose sha1 does not match its own text is ignored
      byId.set(String(e.id), e); if (e.verdict === 'ok') okHash.add(e.sha1);
    }
    for (const u of units) {
      const e = byId.get(u.id); let k = null;
      if (e && e.sha1 === u.sha1) k = e.verdict === 'ok' ? null : e.verdict === 'rewrite' ? 'rewrite' : 'pending';
      else if (!okHash.has(u.sha1)) k = ids.has(u.id) ? 'stale' : 'new'; // the same text approved under another id (moved line) stays approved
      if (k) { tally[k]++; probs.push({ k, u, note: e && e.sha1 === u.sha1 ? e.note : '' }); }
    }
    const dt = typeof review.date === 'string' ? review.date.trim() : '';
    if (typeof review.reviewer !== 'string' || !review.reviewer.trim()) head = 'reviewer is missing (a non-empty name or agent id)';
    else if (!realDate(dt)) head = 'date is missing or not a real calendar date (YYYY-MM-DD)';
    else if (dt > todayISO()) head = 'date is in the future';
  }
  const how = "run node kv.mjs legal --review-template, read every unit in its scene, set verdict 'ok' | 'rewrite' (+ note), fill reviewer and date, rerun node kv.mjs legal (references/legal_compliance.md section 6)";
  const basis = 'Owner policy 2026-10-02: semantic review mandatory before delivery; the lexical gate cannot see every synonym, paraphrase or slang.';
  const F = (where, term, context, suggestion, sev) => ({ file, where, ruleId: 'legal-review', cat: 'legal-review', sev, term, index: 0, end: 0, context, basis, suggestion, confidence: 'high' });
  const findings = [], n = probs.length;
  if (final) {
    if (head) findings.push(F(rel, head, head, how, 'error'));
    for (const p of probs) findings.push(F(p.u.id, p.k, p.u.text, KIND[p.k] + (p.note ? ' (note: ' + p.note + ')' : '') + ': ' + (p.k === 'rewrite' ? 'rewrite the text in storyboard.js, rerun --review-template and review it again' : how), 'error'));
    if (review && !review.invalid && o.version && review.policy_version !== o.version) findings.push(F(rel, 'policy_version', 'review made with lexicon ' + (review.policy_version || '?') + ', current ' + o.version, 'rerun --review-template (verdicts of unchanged texts are kept) and confirm the review still holds', 'warn'));
  } else if (head || n) {
    const msg = 'legal review pending: ' + [head, n ? n + '/' + units.length + " unit(s) without an 'ok' verdict (new " + tally.new + ', changed ' + tally.stale + ', rewrite ' + tally.rewrite + ', pending ' + tally.pending + ')' : ''].filter(Boolean).join('; ');
    findings.push(F(rel, 'legal review pending', msg, 'required before the final gate: ' + how, 'warn'));
  }
  return { findings, summary: Object.assign({ file, final, units: units.length, ok: !review || review.invalid ? 0 : units.length - n, missing: !review, problem: head }, tally) };
}
/** writeReviewTemplate(projectDir, opts) -> { file, total, kept, new, changed, removed, lexicalErrors } | { error } */
export function writeReviewTemplate(P, o = {}) {
  const r = scanStoryboard(P, Object.assign({}, o, { review: false }));
  if (!r.SB) return { error: (r.findings[0] || {}).context || 'storyboard.js could not be evaluated' };
  const units = reviewUnits(r.items, r.SB, P), file = path.join(P, REVIEW_FILE), old = readReview(P), prev = new Map();
  if (old && !old.invalid) for (const e of [].concat(old.units || [])) if (e && e.id != null) prev.set(String(e.id), e);
  const flags = new Map();
  for (const f of r.findings) if (f.sev !== 'info' && f.where) { if (!flags.has(f.where)) flags.set(f.where, []); flags.get(f.where).push(f.term + ' [' + f.ruleId + '/' + f.sev + ']'); }
  const t = { kept: 0, new: 0, changed: 0 };
  const list = units.map(u => {
    const e = prev.get(u.id), same = !!e && e.sha1 === u.sha1 && typeof e.text === 'string' && unitHash(e.text) === e.sha1;
    const x = Object.assign({}, u, { verdict: same && (e.verdict === 'ok' || e.verdict === 'rewrite') ? e.verdict : null, note: same ? e.note || '' : '' });
    if (same) t.kept++; else if (e) { t.changed++; x.previous = e.text; } else t.new++;
    const fl = flags.get(u.id) || flags.get(u.field); if (fl) x.lexical = fl;
    return x;
  });
  const ids = new Set(units.map(u => u.id)), removed = [...prev.keys()].filter(k => !ids.has(k)).length, keep = old && !old.invalid;
  const doc = { schema: 'kv-legal-review/1', policy_version: loadLexicon(o.lexicon).version, reviewer: keep ? old.reviewer || '' : '', date: keep && !t.new && !t.changed ? old.date || '' : '', instructions: REVIEW_HOWTO, units: list };
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  return Object.assign({ file, total: units.length, removed, lexicalErrors: r.findings.filter(f => f.sev === 'error').length }, t);
}
/** reviewSelftest() -> { total, passed, fails }: the review gate on synthetic units and on a temporary project (production path) */
export function reviewSelftest() {
  const fails = []; let total = 0;
  const T = (id, ok, why) => { total++; if (!ok) fails.push({ id, text: '', why }); };
  const U = (id, text) => ({ id, scene: 's1', field: id, text, sha1: unitHash(text) });
  const rv = (units, extra) => Object.assign({ policy_version: 'x', reviewer: 'QA', date: todayISO(), units }, extra);
  const E = r => r.findings.filter(f => f.sev === 'error'), Wn = r => r.findings.filter(f => f.sev === 'warn');
  const a = U('s1 · h · text', 'Robot hàn cộng tác'), b = U('s1 · h · sub', 'Hàn nhanh, gọn');
  const ok = u => Object.assign({}, u, { verdict: 'ok', note: '' });
  let r = reviewCheck([a, b], null, { final: true }); T('review-missing-final', E(r).length === 1 && /missing/.test(E(r)[0].term), JSON.stringify(r.findings.map(f => f.term)));
  r = reviewCheck([a, b], null, { final: false }); T('review-missing-draft', E(r).length === 0 && Wn(r).length === 1, JSON.stringify(r.findings.map(f => f.sev + ':' + f.term)));
  r = reviewCheck([a, b], rv([ok(a), ok(b)]), { final: true }); T('review-all-ok', r.findings.length === 0, JSON.stringify(r.findings.map(f => f.term)));
  r = reviewCheck([a, b], rv([ok(a), ok(U(b.id, 'Hàn chậm'))]), { final: true }); T('review-stale', E(r).length === 1 && E(r)[0].term === 'stale' && E(r)[0].where === b.id, JSON.stringify(r.findings.map(f => f.term)));
  r = reviewCheck([a, b], rv([ok(a)]), { final: true }); T('review-new', E(r).length === 1 && E(r)[0].term === 'new', JSON.stringify(r.findings.map(f => f.term)));
  r = reviewCheck([a, b], rv([ok(a), Object.assign({}, b, { verdict: 'rewrite', note: 'claim' })]), { final: true }); T('review-rewrite', E(r).length === 1 && E(r)[0].term === 'rewrite', JSON.stringify(r.findings.map(f => f.term)));
  r = reviewCheck([a, b], rv([ok(a), Object.assign({}, b, { verdict: null })]), { final: true }); T('review-pending', E(r).length === 1 && E(r)[0].term === 'pending', JSON.stringify(r.findings.map(f => f.term)));
  r = reviewCheck([a, b], rv([ok(a), ok(b)], { reviewer: '' }), { final: true }); T('review-no-reviewer', E(r).length === 1 && /reviewer/.test(E(r)[0].term), JSON.stringify(r.findings.map(f => f.term)));
  r = reviewCheck([a, b], rv([ok(a), ok(b)], { date: 'today' }), { final: true }); T('review-bad-date', E(r).length === 1 && /date/.test(E(r)[0].term), JSON.stringify(r.findings.map(f => f.term)));
  r = reviewCheck([a, b], rv([ok(a), Object.assign(ok(b), { sha1: unitHash('other') })]), { final: true }); T('review-tampered-sha1', E(r).length === 1 && E(r)[0].term === 'stale', JSON.stringify(r.findings.map(f => f.term)));
  r = reviewCheck([a, U('s2 · h · text', a.text), b], rv([ok(a), ok(b)]), { final: true }); T('review-moved-same-text', r.findings.length === 0, JSON.stringify(r.findings.map(f => f.term)));
  r = reviewCheck([a, b], rv([ok(a)]), { final: false }); T('review-draft-warn-only', E(r).length === 0 && Wn(r).length === 1, JSON.stringify(r.findings.map(f => f.sev + ':' + f.term)));
  r = reviewCheck([a, b], { invalid: 'Unexpected token' }, { final: true }); T('review-invalid-json', E(r).length === 1, JSON.stringify(r.findings.map(f => f.term)));
  r = reviewCheck([a, b], rv([ok(a), ok(b)], { policy_version: '0.1' }), { final: true, version: '9.9' }); T('review-policy-version-warn', E(r).length === 0 && Wn(r).length === 1, JSON.stringify(r.findings.map(f => f.sev + ':' + f.term)));
  T('review-hash-raw-nfc', unitHash('Hàn nhanh') === unitHash('Ha' + String.fromCharCode(0x300) + 'n nhanh') && unitHash('Hàn nhanh') !== unitHash('Hàn chậm') && unitHash('Hàn nhanh') !== unitHash('Hàn  nhanh') && unitHash('hoà') !== unitHash('hòa'), 'raw NFC hash');
  const em = s => reviewCheck([U(a.id, s)], rv([ok(a)]), { final: true });
  for (const [k, x] of [['emoji', ' ' + String.fromCodePoint(0x1F947)], ['flag', ' ' + String.fromCodePoint(0x1F3C6, 0x1F1E8, 0x1F1F3)], ['punctuation', '!'], ['zero-width', String.fromCharCode(0x200B)]]) { r = em(a.text + x); T('review-stale-after-' + k, E(r).length === 1 && E(r)[0].term === 'stale', JSON.stringify(r.findings.map(f => f.term))); }
  const nextDay = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  for (const d of ['2026-13-45', '2026-02-30', '2025-02-29', '2026-10-2', '02/10/2026', nextDay, 20261002]) { r = reviewCheck([a, b], rv([ok(a), ok(b)], { date: d }), { final: true }); T('review-date-' + d, E(r).length === 1 && /date/.test(E(r)[0].term), JSON.stringify(r.findings.map(f => f.term))); }
  r = reviewCheck([a, b], rv([ok(a), ok(b)], { date: '2024-02-29' }), { final: true }); T('review-date-leap-day-ok', r.findings.length === 0, JSON.stringify(r.findings.map(f => f.term)));
  for (const v of [{}, [], ['QA'], '   ', 0, true, null]) { r = reviewCheck([a, b], rv([ok(a), ok(b)], { reviewer: v }), { final: true }); T('review-reviewer-' + JSON.stringify(v), E(r).length === 1 && /reviewer/.test(E(r)[0].term), JSON.stringify(r.findings.map(f => f.term))); }
  // production path: a real project compiled like kv-lint
  let D = null;
  try {
    D = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-legal-review-'));
    const sb = (sub, extra = '') => "var SB = { name: 'T', scenes: [ { id: 's1', dur: 2, layers: [ { id: 'h', kind: 'title', text: 'Robot hàn cộng tác', sub: '" + sub + "' } ], say: 'Xin chào xưởng cơ khí' }" + extra + ' ] };\n';
    fs.writeFileSync(path.join(D, 'storyboard.js'), sb('Hàn nhanh, gọn'));
    const RE = x => x.findings.filter(f => f.ruleId === 'legal-review' && f.sev === 'error');
    let s = scanStoryboard(D); T('project-missing-final', RE(s).length === 1, JSON.stringify(RE(s).map(f => f.term)));
    s = scanStoryboard(D, { final: false }); T('project-missing-draft', RE(s).length === 0 && s.findings.some(f => f.ruleId === 'legal-review' && f.sev === 'warn'), JSON.stringify(s.findings.map(f => f.sev + ':' + f.term)));
    let w = writeReviewTemplate(D); T('project-template', w.total === 3 && w.new === 3 && fs.existsSync(path.join(D, REVIEW_FILE)), JSON.stringify(w));
    s = scanStoryboard(D); T('project-template-pending', RE(s).length === 4, JSON.stringify(RE(s).map(f => f.term))); // 3 pending + reviewer empty
    const j = JSON.parse(fs.readFileSync(path.join(D, REVIEW_FILE), 'utf8')); j.units.forEach(u => { u.verdict = 'ok'; }); j.reviewer = 'selftest'; j.date = todayISO();
    fs.writeFileSync(path.join(D, REVIEW_FILE), JSON.stringify(j));
    s = scanStoryboard(D); T('project-all-ok', s.findings.filter(f => f.sev !== 'info').length === 0, JSON.stringify(s.findings.map(f => f.term)));
    fs.writeFileSync(path.join(D, 'storyboard.js'), sb('Hàn nhanh hơn, gọn hơn'));
    s = scanStoryboard(D); T('project-stale-after-edit', RE(s).length === 1 && RE(s)[0].term === 'stale', JSON.stringify(RE(s).map(f => f.term)));
    w = writeReviewTemplate(D); T('project-template-update', w.kept === 2 && w.changed === 1, JSON.stringify(w));
    s = scanStoryboard(D); T('project-update-needs-date-and-verdict', RE(s).length === 2, JSON.stringify(RE(s).map(f => f.term)));
    fs.writeFileSync(path.join(D, 'storyboard.js'), sb('Hàn tốt nhất'));
    const j2 = JSON.parse(fs.readFileSync(path.join(D, REVIEW_FILE), 'utf8')); j2.units.forEach(u => { u.verdict = 'ok'; u.text = u.id === 's1 · h · sub' ? 'Hàn tốt nhất' : u.text; u.sha1 = unitHash(u.text); }); j2.date = todayISO();
    fs.writeFileSync(path.join(D, REVIEW_FILE), JSON.stringify(j2));
    s = scanStoryboard(D); T('project-review-never-clears-lexical', RE(s).length === 0 && s.findings.some(f => f.ruleId === 'sup-vi-best' && f.sev === 'error'), JSON.stringify(s.findings.map(f => f.ruleId + ':' + f.term)));
  } catch (e) { T('project-path', false, e.stack); } finally { if (D) try { fs.rmSync(D, { recursive: true, force: true }); } catch { } }
  return { total, passed: total - fails.length, fails };
}

// ------------------------------------------------------------------ files
/** string literals of JS source (comments skipped, template ${…} expressions blanked) with line numbers */
export function jsStrings(src) {
  const out = []; let i = 0, line = 1;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const l0 = line; let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') { s += src[j + 1] === 'n' ? '\n' : src[j + 1]; j += 2; continue; }
        if (c === '`' && src[j] === '$' && src[j + 1] === '{') { let d = 0; for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; else if (src[j] === '\n') line++; } j++; s += ' '; continue; }
        if (src[j] === '\n') { if (c !== '`') break; line++; }
        s += src[j++];
      }
      out.push({ text: s, line: l0 }); i = j + 1; continue;
    }
    i++;
  }
  return out;
}
function textUnits(file, raw) {
  const ext = path.extname(file).toLowerCase(), lines = raw.split(/\r?\n/), units = [];
  if (ext === '.js' || ext === '.mjs') { for (const s of jsStrings(raw)) if (prose(s.text) || /\p{L}{3,}/u.test(s.text) && /[^\x00-\x7F]/.test(s.text)) units.push({ line: s.line, text: s.text }); return units; }
  if (ext === '.json') { try { const j = JSON.parse(raw); [].concat(j).forEach((x, i) => x && typeof x.text === 'string' && units.push({ line: i + 1, text: x.text, cue: `#${i + 1}` })); } catch { } return units; }
  let cue = null, fence = false, cur = null;
  lines.forEach((l, i) => {
    if (ext === '.md' && /^\s*(```|~~~)/.test(l)) { fence = !fence; return; } // code fences are not copy
    if (fence) return;
    if (ext === '.srt' || ext === '.vtt') { // one unit per cue: a claim split over two caption lines is still read whole
      if (!l.trim() || /^\s*(\d+|WEBVTT.*|NOTE.*)\s*$/.test(l) || /-->/.test(l)) { if (/^\s*\d+\s*$/.test(l)) cue = l.trim(); cur = null; return; }
      if (cur) { cur.text += ' ' + l; return; }
      units.push(cur = { line: i + 1, text: l, cue }); return;
    }
    if (l.trim()) units.push({ line: i + 1, text: l });
  });
  return units;
}
export function scanFile(file, o = {}) {
  if (path.basename(file) === 'storyboard.js') return scanStoryboard(path.dirname(file), o);
  const raw = nfc(fs.readFileSync(file, 'utf8')), findings = [], units = textUnits(file, raw), FF = scanUnits(units.map(u => u.text), o);
  units.forEach((u, k) => { for (const f of FF[k]) findings.push(Object.assign({ file, where: `${path.basename(file)}:${u.line}${u.cue ? ` (cue ${u.cue})` : ''}`, line: u.line, text: u.text }, f)); });
  return { findings };
}

// ------------------------------------------------------------------ fix / write
function bak(file) { let b = file + '.bak'; if (fs.existsSync(b)) b = `${file}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`; fs.copyFileSync(file, b); return b; }
const jsEsc = (s, q) => s.replace(/\\/g, '\\\\').replace(new RegExp(q === '`' ? '`|\\$\\{' : q, 'g'), m => '\\' + m).replace(/\n/g, '\\n');
function fixFile(file, o) {
  const raw = fs.readFileSync(file, 'utf8'), nl = raw.includes('\r\n') ? '\r\n' : '\n', lines = nfc(raw).split(/\r?\n/), ext = path.extname(file).toLowerCase(), diff = [], unresolved = [];
  const timing = l => /-->/.test(l) || /^\s*(\d+|WEBVTT.*|NOTE.*)\s*$/.test(l);
  let fence = false; const idx = [];
  lines.forEach((l, i) => {
    if (ext === '.md' && /^\s*(```|~~~)/.test(l)) { fence = !fence; return; }
    if (!(fence || !l.trim() || ((ext === '.srt' || ext === '.vtt') && timing(l)))) idx.push(i);
  });
  let FF; // one scan (or the CLI's own scan of this file, o._pre); only lines with findings are rewritten
  if (o._pre && (ext === '.md' || ext === '.txt')) { const by = new Map(); for (const f of o._pre) if (f.line) { if (!by.has(f.line)) by.set(f.line, []); by.get(f.line).push(f); } FF = idx.map(i => by.get(i + 1) || []); }
  else FF = scanUnits(idx.map(i => lines[i]), o);
  const out = lines.slice();
  idx.forEach((i, k) => {
    const l = lines[i]; if (!FF[k].length) return;
    const r = fixText(l, Object.assign({}, o, { _findings: FF[k] })); unresolved.push(...r.unresolved.map(f => Object.assign({ where: `${path.basename(file)}:${i + 1}` }, f)));
    if (r.text !== l) diff.push({ line: i + 1, from: l, to: r.text });
    out[i] = r.text;
  });
  if (ext === '.srt' || ext === '.vtt') for (const f of scanFile(file, o).findings) if (!unresolved.some(u => u.where === `${path.basename(file)}:${f.line}` && u.term === f.term) && !diff.some(d => d.line === f.line)) unresolved.push(f); // cue split over lines
  return { file, diff, unresolved, write: () => { if (!diff.length) return null; const b = bak(file); fs.writeFileSync(file, out.join(nl)); return b; } };
}
function fixStoryboard(P, o) {
  const r = scanStoryboard(P, Object.assign({}, o, { review: false })), file = path.join(P, 'storyboard.js'), diff = [], unresolved = [], seen = new Set();
  const lo = r.SB ? legalOpts(r.SB, o) : o;
  for (const it of r.items) {
    if (it.parts || seen.has(it.text)) continue; seen.add(it.text);
    const x = fixText(it.text, lo);
    unresolved.push(...x.unresolved.map(f => Object.assign({ where: it.where }, f)));
    if (x.text !== nfc(it.text)) diff.push({ where: it.where, from: nfc(it.text), to: x.text });
  }
  // captions are fixed line by line (kv score regenerates them from the fixed `say` lines anyway); scripts stay manual
  const caps = fs.readdirSync(P).filter(f => /\.(srt|vtt)$/i.test(f)).map(f => fixFile(path.join(P, f), lo));
  for (const c of caps) { diff.push(...c.diff.map(d => Object.assign({ file: c.file }, d))); unresolved.push(...c.unresolved); }
  for (const f of r.findings.filter(f => f.joined || f.ruleId === 'legal-load' || (f.file && !/(^storyboard\.js|\.(srt|vtt))$/i.test(path.basename(f.file))))) unresolved.push(f);
  const write = () => {
    const done = caps.map(c => c.write()).filter(Boolean);
    if (!diff.some(d => !d.file)) return done;
    let src = nfc(fs.readFileSync(file, 'utf8')); const manual = [];
    for (const d of diff.filter(d => !d.file)) {
      let hit = 0;
      for (const q of ["'", '"', '`']) { const lit = q + jsEsc(d.from, q) + q; if (src.includes(lit)) { hit += src.split(lit).length - 1; src = src.split(lit).join(q + jsEsc(d.to, q) + q); } }
      if (!hit) manual.push(d);
    }
    const b = bak(file); fs.writeFileSync(file, src);
    for (const d of manual) unresolved.push({ where: d.where, sev: 'error', ruleId: 'manual-edit', term: d.from, suggestion: `literal not found in storyboard.js (preset default or built string): change it by hand to "${d.to}"` });
    return [b, ...done];
  };
  return { diff, unresolved, write };
}

// ------------------------------------------------------------------ self-test
/** batchSelftest(file) -> { units, diffs, ids }: scanUnits (one scan over all cases, the file / CLI path) vs scanText per case */
export function batchSelftest(file = path.join(HERE, 'legal', 'test-cases.json')) {
  const cases = JSON.parse(fs.readFileSync(file, 'utf8')).cases.filter(c => !c.audience && !c.names && !c.addresses && !c.allow && !c.lang && c.src !== 'js');
  const T = cases.map(c => c.tx === 'nfd' ? c.text.normalize('NFD') : c.text), key = f => [f.ruleId, f.sev, f.index, f.end, f.term, f.confidence, f.note || ''].join('|');
  const B = scanUnits(T, {}), ids = [];
  T.forEach((t, i) => { if (B[i].map(key).sort().join('\n') !== scanText(t, {}).map(key).sort().join('\n')) ids.push(cases[i].id); });
  return { units: T.length, diffs: ids.length, ids };
}
export function selftest(file = path.join(HERE, 'legal', 'test-cases.json')) {
  const all0 = JSON.parse(fs.readFileSync(file, 'utf8')).cases, cases = all0.filter(c => !c.known_limit), fails = [], known = { total: 0, caught: 0, ids: [] };
  for (const c of all0.filter(c => c.known_limit)) { // documented limits (references/legal_compliance.md): reported, not counted
    known.total++; known.ids.push(c.id);
    const o = { audience: c.audience, lang: c.lang, allow: c.allow, names: c.names, addresses: c.addresses };
    if (scanText(c.tx === 'nfd' ? c.text.normalize('NFD') : c.text, o).some(f => f.sev === 'error')) known.caught++;
  }
  for (const c of cases) {
    const t = c.tx === 'nfd' ? c.text.normalize('NFD') : c.text, o = { audience: c.audience, lang: c.lang, allow: c.allow, names: c.names, addresses: c.addresses };
    const all = c.src === 'js' ? jsStrings(t).flatMap(u => scanText(u.text, o)) : scanText(t, o), F = all.filter(f => f.sev !== 'info'); // src js: production path for .js files
    const hit = F.filter(f => (!c.cat || f.cat === c.cat) && (!c.rule || f.ruleId === c.rule) && (!c.sev || f.sev === c.sev) && (!c.term || keyOf(f.term) === keyOf(c.term)));
    let ok = c.expect === 'clean' ? (c.cat ? !F.some(f => f.cat === c.cat) : F.length === 0) : c.expect === 'noerr' ? !F.some(f => f.sev === 'error') : hit.length > 0;
    if (ok && c.info) ok = all.some(f => f.sev === 'info');
    let why = ok ? '' : c.expect !== 'flag' ? `unexpected: ${F.map(f => `${f.term}[${f.ruleId}/${f.sev}]`).join(', ')}` : `missing ${c.cat || c.rule || ''}${c.sev ? '/' + c.sev : ''}${c.term ? ' "' + c.term + '"' : ''}; got: ${F.map(f => `${f.term}[${f.ruleId}/${f.sev}]`).join(', ') || 'nothing'}`;
    if (ok && c.fix != null) { const r = fixText(t, o); if (r.text !== nfc(c.fix)) { ok = false; why = `fix: got "${r.text}" want "${c.fix}"`; } }
    if (!ok) fails.push({ id: c.id, text: c.text, why });
  }
  return { total: cases.length, passed: cases.length - fails.length, fails, known };
}

// ------------------------------------------------------------------ CLI
function cli() {
  const argv = process.argv.slice(2), has = k => argv.includes('--' + k);
  const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
  const J = has('json'), o = { audience: opt('audience'), lang: opt('lang'), final: !has('draft') };
  if (has('help') || argv.includes('-h')) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0].replace(/^\/\/ ?/gm, '')); process.exit(0); }
  const unknown = argv.filter(a => /^-/.test(a) && !/^--(json|summary|fix|write|selftest|audience|lang|cases|draft|review-template)$/.test(a));
  if (unknown.length) { console.error(`kv-legal: unknown option ${unknown.join(' ')} (see --help)`); process.exit(2); }
  if (has('selftest')) {
    const r = selftest(opt('cases')), rv = reviewSelftest(), bt = batchSelftest(opt('cases'));
    if (J) console.log(JSON.stringify(Object.assign({}, r, { review: rv, batch: bt }))); else {
      for (const f of [...r.fails, ...rv.fails]) console.log(`FAIL ${f.id}: "${f.text}" — ${f.why}`);
      console.log(`legal selftest: ${r.passed}/${r.total} passed (lexicon ${loadLexicon().version}, ${loadLexicon().rules.length} rules); review gate: ${rv.passed}/${rv.total} passed; batch = per-unit on ${bt.units - bt.diffs}/${bt.units}${bt.diffs ? ` (differ: ${bt.ids.slice(0, 10).join(' ')})` : ''}${r.known.total ? `; known limits (not counted): ${r.known.total}, ${r.known.caught} caught anyway` : ''}`);
    }
    process.exit(r.fails.length || rv.fails.length || bt.diffs ? 1 : 0);
  }
  const skip = new Set(['audience', 'lang', 'cases'].map(k => opt(k)).filter(Boolean));
  let targets = argv.filter(a => !a.startsWith('--') && !skip.has(a));
  if (!targets.length) targets = [process.cwd()];
  const files = [];
  for (const t of targets.map(t => path.resolve(t))) {
    if (!fs.existsSync(t)) { console.error(`kv-legal: not found: ${t}`); process.exit(2); }
    if (fs.statSync(t).isDirectory()) {
      if (fs.existsSync(path.join(t, 'storyboard.js'))) files.push({ sb: t });
      else for (const f of fs.readdirSync(t).filter(f => /\.(md|txt|srt|vtt)$|^vo\.json$/i.test(f))) files.push({ file: path.join(t, f) });
    } else if (path.basename(t) === 'storyboard.js') files.push({ sb: path.dirname(t) }); else files.push({ file: t });
  }
  if (has('review-template')) {
    const sbs = files.filter(x => x.sb);
    if (!sbs.length) { console.error('kv-legal: --review-template needs a project directory with storyboard.js'); process.exit(2); }
    const out = [];
    for (const x of sbs) {
      const w = writeReviewTemplate(x.sb, o); out.push(w);
      if (w.error) { console.error(`kv-legal: ${x.sb}: ${w.error}`); process.exit(1); }
      if (!J) console.log(`legal review: ${w.file} — ${w.total} unit(s): ${w.kept} kept, ${w.new} new, ${w.changed} changed (verdict reset)${w.removed ? `, ${w.removed} removed` : ''}${w.lexicalErrors ? `; ${w.lexicalErrors} lexical error(s) still to fix` : ''}. Next: set every verdict 'ok' | 'rewrite' (+ note), reviewer and date, then run: node kv.mjs legal`);
    }
    if (J) console.log(JSON.stringify({ ok: true, review: out }));
    process.exit(0);
  }
  let findings = [], scanned = 0, diffs = [], unresolved = [], backups = [], reviews = [];
  for (const x of files) {
    const r = x.sb ? scanStoryboard(x.sb, o) : scanFile(x.file, o);
    scanned += x.sb ? (r.items || []).length : 1; findings.push(...r.findings); if (r.review) reviews.push(r.review);
    if (has('fix') || has('write')) {
      const fx = x.sb ? fixStoryboard(x.sb, o) : fixFile(x.file, Object.assign({}, o, { _pre: r.findings }));
      diffs.push(...fx.diff.map(d => Object.assign({ file: x.sb ? path.join(x.sb, 'storyboard.js') : x.file }, d))); unresolved.push(...fx.unresolved);
      if (has('write')) backups.push(...[].concat(fx.write() || []));
    }
  }
  if (has('write') && backups.length) { findings = []; reviews = []; for (const x of files) { const r = x.sb ? scanStoryboard(x.sb, o) : scanFile(x.file, o); findings.push(...r.findings); if (r.review) reviews.push(r.review); } }
  const errors = findings.filter(f => f.sev === 'error').length, warns = findings.filter(f => f.sev === 'warn').length, infos = findings.filter(f => f.sev === 'info');
  const L = loadLexicon(), short = f => ({ file: f.file, where: f.where, scene: f.scene, layer: f.layer, line: f.line, ruleId: f.ruleId, cat: f.cat, sev: f.sev, term: f.term, context: f.context, suggestion: f.suggestion, basis: f.basis, confidence: f.confidence, note: f.note || undefined });
  if (J) console.log(JSON.stringify({ ok: errors === 0, errors, warnings: warns, info: infos.length, scanned, lexicon: L.version, findings: findings.map(short), diff: diffs, unresolved: unresolved.map(short), backups, review: reviews }));
  else {
    if (!has('summary')) {
      const buf = [];
      for (const f of findings) buf.push(`${f.sev === 'error' ? 'ERROR' : f.sev === 'warn' ? 'warn ' : 'info '} ${f.cat.padEnd(14).slice(0, 22)} ${f.where}  "${f.term}" — ${f.context}${f.note ? ` [${f.note}]` : ''}${f.sev === 'info' ? '' : `\n        ${f.suggestion}${f.basis ? `\n        basis: ${f.basis}` : ''}`}`);
      if (buf.length) process.stdout.write(buf.join('\n') + '\n');
      for (const d of diffs) console.log(`fix ${d.where || `${path.basename(d.file)}:${d.line}`}\n  - ${d.from}\n  + ${d.to}`);
      const un = unresolved.filter(f => f.sev === 'error');
      if ((has('fix') || has('write')) && un.length) console.log(`manual rewrite required (${un.length}):\n` + un.map(f => `  ${f.where}: "${f.term}" (${f.ruleId}) — ${f.suggestion}`).join('\n'));
      if (backups.length) console.log(`written; backups: ${backups.join(', ')}`);
    }
    for (const v of reviews) console.log(`legal review (${v.final ? 'final' : 'draft'}): ${v.ok}/${v.units} unit(s) approved in ${path.basename(v.file)}${v.problem ? ` — ${v.problem}` : ''}${v.new + v.stale + v.rewrite + v.pending ? ` — new ${v.new}, changed ${v.stale}, rewrite ${v.rewrite}, pending ${v.pending}` : ''}`);
    if (infos.length) console.log(`legal: ${infos.length} proper-name / address / allow-list suppression(s): ${infos.map(f => `"${f.term}" (${f.note})`).join('; ')}`);
    console.log(`legal: ${errors} error(s), ${warns} warning(s) — ${scanned} text(s)/file(s) scanned, lexicon ${L.version} (${L.updated})${errors ? (findings.some(f => f.sev === 'error' && f.ruleId !== 'legal-review') ? ' — fix: node kv.mjs legal --fix (then --write), see references/legal_compliance.md' : ' — semantic review: node kv.mjs legal --review-template, then set the verdicts (references/legal_compliance.md section 6)') : ''}`);
  }
  process.exit(errors ? 1 : 0);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
