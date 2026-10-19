/* KV transitions on the GPU — a small WebGL2 runner (KV.glx) + our own GLSL shaders: ripple, kaleido, cube.
 * Shader contract (gl-transitions compatible, so a vetted MIT shader can be dropped in later with its own
 * "// Author: / // License:" header and an entry in THIRD_PARTY_NOTICES.md — nothing here is copied):
 *   vec4 transition(vec2 uv)  — uv 0..1, origin bottom-left; getFromColor(uv) = scene A, getToColor(uv) = scene B;
 *   uniforms `progress` (k eased with io unless tr.ease, 0 → 1) and `ratio` (W / H), plus one float uniform per entry of `params` (tr overrides).
 * Directional shaders (meta.dir) run in a mirrored / transposed space, so one "content moves left" shader serves
 * left / right / up / down. Without WebGL2 (render --gpu off, context lost), on a shader error, or with `gl: false`
 * on the transition, the 2D fallback named in trans-meta.js draws instead (ripple → fade, kaleido → spin, cube → flip).
 * Cost per frame: 2 scene renders + 2 W×H texture uploads + one fragment pass + one drawImage; 1 GL canvas per size.
 */
(function () {
  'use strict';
  const KV = window.KV, { EZ, dirName, run } = KV.TX;
  const VS = `#version 300 es
out vec2 uv0;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); uv0 = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const FS = body => `#version 300 es
precision highp float;
in vec2 uv0; out vec4 outColor;
uniform sampler2D uFrom, uTo; uniform float progress, ratio, uT, uM; uniform vec3 uBg;
vec2 itf(vec2 p) { if (uM > 0.5) p.x = 1.0 - p.x; if (uT > 0.5) p = p.yx; return p; }   // shader space -> texture uv
vec4 getFromColor(vec2 p) { return texture(uFrom, itf(p)); }
vec4 getToColor(vec2 p) { return texture(uTo, itf(p)); }
${body}
void main() { vec2 p = uv0; if (uT > 0.5) p = p.yx; if (uM > 0.5) p.x = 1.0 - p.x; outColor = transition(p); }`;

  // ------------------------------------------------------------------ runner
  const CTX = {};
  function glxFor(W, H) {                                  // one GL canvas + 2 textures per frame size; null = no WebGL2
    const key = W + 'x' + H; if (key in CTX) return CTX[key];
    let S = null;
    try {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      if (gl) {
        const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
          for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
          return t; };
        S = { cv, gl, A: tex(), B: tex(), vao: gl.createVertexArray(), progs: {} };
      }
    } catch (err) { S = null; }
    return (CTX[key] = S);
  }
  function prog(S, name, body) {
    if (name in S.progs) return S.progs[name];
    const gl = S.gl; let P = null;
    try {
      const p = gl.createProgram();
      for (const [t, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS(body)]]) {
        const sh = gl.createShader(t); gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh);
      }
      gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
      P = { p, u };
    } catch (err) { console.warn(`glx ${name}: ${err.message} — drawing the 2D fallback`); }
    return (S.progs[name] = P);
  }
  const rgb = c => { const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c || ''); if (!m) return [0, 0, 0]; const x = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1], n = parseInt(x, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  // meta = { params: { uniform: default }, fallback, ease, dir: true (directional), dflt (default dir), bg (colour name) }
  KV.glx = (name, body, meta = {}) => {
    const f = (k, draw, tr, h) => {
      const S = tr.gl === false ? null : glxFor(h.W, h.H), P = S && !S.gl.isContextLost() ? prog(S, name, body) : null;
      if (!P) return run(tr.fallback || meta.fallback || 'fade', k, draw, meta.dir && tr.dir == null ? Object.assign({}, tr, { dir: meta.dflt }) : tr, h);   // fallback turns the same way
      const gl = S.gl, d = meta.dir ? dirName(tr, meta.dflt || 'left') : 'left', T = d === 'up' || d === 'down', M = d === 'right' || d === 'up';
      const set = (n, v) => { if (P.u[n]) gl.uniform1f(P.u[n], v); };
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);                                   // uv origin bottom-left (gl-transitions)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.A); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, h.onBuffer(draw.a));
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, S.B); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, h.onBuffer(draw.b));
      gl.viewport(0, 0, h.W, h.H); gl.useProgram(P.p);
      if (P.u.uFrom) gl.uniform1i(P.u.uFrom, 0); if (P.u.uTo) gl.uniform1i(P.u.uTo, 1);
      set('progress', EZ(tr, k, meta.ease || 'io')); set('ratio', T ? h.H / h.W : h.W / h.H); set('uT', T ? 1 : 0); set('uM', M ? 1 : 0);   // io: flat ends = exact A / B
      for (const [n, v] of Object.entries(meta.params || {})) set(n, +(tr[n] ?? v));
      if (P.u.uBg) gl.uniform3f(P.u.uBg, ...rgb(h.col(tr.color || meta.bg || 'bg')));
      gl.bindVertexArray(S.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
      h.ctx.drawImage(S.cv, 0, 0);
    };
    f._gl = true; return f;
  };

  // ------------------------------------------------------------------ shaders (own code)
  // ripple: concentric water rings (or a swirl) distort both frames while they cross-fade; strongest at the midpoint
  const RIPPLE = `uniform float amplitude, strength, swirl;
vec4 transition(vec2 uv) {
  float env = sin(3.14159265 * progress);                                      // 0 at both ends = exact A / B
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0), q; float r = length(p);
  if (swirl > 0.5) { float a = 5.0 * env * pow(max(0.0, 1.0 - r / 0.85), 2.0), c = cos(a), s = sin(a); q = vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
  else q = p + (r > 1e-4 ? p / r : vec2(0.0)) * sin(r * amplitude - progress * 25.0) * strength * env;
  q = q / vec2(ratio, 1.0) + 0.5;
  return mix(getFromColor(q), getToColor(q), smoothstep(0.25, 0.75, progress));
}`;
  // kaleido: the frame folds into mirrored rotating wedges that peak at the cut and unfold into B
  const KALEIDO = `uniform float segments, twist;
vec4 transition(vec2 uv) {
  float env = smoothstep(0.0, 1.0, sin(3.14159265 * progress));
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0); float r = length(p), a = atan(p.y, p.x) + twist * 3.14159265 * progress;
  float seg = 6.2831853 / max(2.0, segments); a = abs(mod(a, seg) - 0.5 * seg);   // mirror-fold into one wedge
  vec2 k = vec2(cos(a), sin(a)) * r / vec2(ratio, 1.0) + 0.5, q = mix(uv, k, env);
  return mix(getFromColor(q), getToColor(q), smoothstep(0.42, 0.58, progress));
}`;
  // cube: A and B are two faces of a box turning 90° (ray–plane hits, true perspective, shaded faces, pull-back mid-turn)
  const CUBE = `uniform float depth;
bool face(vec2 q) { return all(greaterThanEqual(q, vec2(0.0))) && all(lessThanEqual(q, vec2(1.0))); }
vec4 transition(vec2 uv) {
  float a = progress * 1.5707963, c = cos(a), s = sin(a), r = 0.5 * ratio;        // box ratio × 1 × ratio, turning about y
  vec3 o = vec3(0.0, 0.0, -(depth + r) - 0.35 * depth * sin(2.0 * a));           // exact framing at 0 and 1
  vec3 d = normalize(vec3((uv - 0.5) * vec2(ratio, 1.0), depth));
  vec3 nA = vec3(-s, 0.0, -c), nB = vec3(c, 0.0, -s);                            // outward normals: front (A), side (B)
  float dA = dot(d, nA), dB = dot(d, nB), tA = (r - dot(o, nA)) / dA, tB = (r - dot(o, nB)) / dB;
  vec3 pA = o + d * tA, pB = o + d * tB;
  vec2 qA = vec2(dot(pA, vec3(c, 0.0, -s)) / ratio + 0.5, pA.y + 0.5), qB = vec2(dot(pB, vec3(s, 0.0, c)) / ratio + 0.5, pB.y + 0.5);
  if (dA < 0.0 && tA > 0.0 && face(qA)) return vec4(getFromColor(qA).rgb * (0.55 + 0.45 * c), 1.0);
  if (dB < 0.0 && tB > 0.0 && face(qB)) return vec4(getToColor(qB).rgb * (0.55 + 0.45 * s), 1.0);
  return vec4(uBg, 1.0);
}`;
  KV.transition('ripple', KV.glx('ripple', RIPPLE, { params: { amplitude: 40, strength: 0.03, swirl: 0 }, fallback: 'fade' }));
  KV.transition('kaleido', KV.glx('kaleido', KALEIDO, { params: { segments: 6, twist: 1 }, fallback: 'spin' }));
  KV.transition('cube', KV.glx('cube', CUBE, { params: { depth: 1.6 }, fallback: 'flip', dir: true, dflt: { h: 'left', s: 'left', f: 'left', v: 'up' }, bg: '#000' }));
})();
