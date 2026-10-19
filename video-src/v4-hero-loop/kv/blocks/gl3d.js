/* KV library "gl3d" — real 3D rendered on the GPU (WebGL2) inside a KV layer, composited like any other block.
 *   { kind: 'scene3d', at: 'full', camera: {...}, light: {...}, ground: {...}, objects: [...], groups: {...}, particles: [...] }
 * Low-poly toon look: cel-shaded lighting + ink outline (inverted hull), "sketch" reveal (drawn -> coloured), prefabs
 * (rocket, tree, pine, house, cloud, mountain, planet), keyframed camera/objects/groups, GPU particle systems (stars,
 * burst, trail following a group, drift). Every frame is a pure function of scene time. Times are beats (or '0.8s').
 */
(function () {
  'use strict';
  const { clamp, lerp, E } = MV;
  const DEG = Math.PI / 180;
  // ------------------------------------------------------------------ vec / mat (column-major)
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
  const persp = (fovy, asp, n, f) => { const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]); };
  // orthographic projection (camera.ortho = visible world height): parallel lines stay parallel (isometric diagrams, maps)
  const ortho = (hw, hh, n, f) => new Float32Array([1 / hw, 0, 0, 0, 0, 1 / hh, 0, 0, 0, 0, -2 / (f - n), 0, 0, 0, -(f + n) / (f - n), 1]);
  const easeOf = e => (KV.easeOf ? KV.easeOf(e) : KV.EASE[e]) || null;
  const lookAt = (e, c, up = [0, 1, 0]) => { const z = norm(sub(e, c)), x = norm(cross(up, z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]); };
  function trs(p = [0, 0, 0], r = [0, 0, 0], s = 1) { // T * Ry * Rx * Rz * S (degrees)
    const [x, y, z] = r.map(d => d * DEG), sc = typeof s === 'number' ? [s, s, s] : s;
    const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
    const Tm = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p[0], p[1], p[2], 1];
    const Ry = [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1], Rx = [1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1];
    const Rz = [cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], Sm = [sc[0], 0, 0, 0, 0, sc[1], 0, 0, 0, 0, sc[2], 0, 0, 0, 0, 1];
    return mul(mul(mul(mul(Tm, Ry), Rx), Rz), Sm);
  }
  function nrmMat(m) { // inverse-transpose of the upper 3x3
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1;
    return new Float32Array([A / det, B / det, C / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det]);
  }
  const rgb = c => { const s = KV.col(c); const m = /^#([0-9a-f]{6})$/i.exec(s); if (m) { const n = parseInt(m[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; } const g = KV._c2 || (KV._c2 = document.createElement('canvas').getContext('2d')); g.fillStyle = s; const h = g.fillStyle; const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  // ------------------------------------------------------------------ geometry
  function build(pos, nrm, idx) { return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) }; }
  function box(w, h, d) {
    const P = [], N = [], I = [], F = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
    for (const n of F) {
      const u = Math.abs(n[1]) === 1 ? [1, 0, 0] : [0, 1, 0], v = cross(n, u), b = P.length / 3;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { P.push((n[0] + u[0] * su + v[0] * sv) * w / 2, (n[1] + u[1] * su + v[1] * sv) * h / 2, (n[2] + u[2] * su + v[2] * sv) * d / 2); N.push(...n); }
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    return build(P, N, I);
  }
  function sphere(r, seg = 24) {
    const P = [], N = [], I = [], rows = Math.max(4, seg >> 1);
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= seg; j++) { const th = i / rows * Math.PI, ph = j / seg * Math.PI * 2, n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; P.push(n[0] * r, n[1] * r, n[2] * r); N.push(...n); }
    for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; I.push(a, a + 1, b, b, a + 1, b + 1); }
    return build(P, N, I);
  }
  // revolve a profile [[r, y], ...] around Y; each profile segment is its own band (crisp low-poly edges)
  function lathe(prof, seg = 20) {
    const P = [], N = [], I = [];
    for (let s = 0; s < prof.length - 1; s++) {
      const [r0, y0] = prof[s], [r1, y1] = prof[s + 1], nr = norm([y1 - y0, -(r1 - r0), 0]); // (dy, -dr) outward in the profile plane
      const b = P.length / 3;
      for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); P.push(r0 * c, y0, r0 * sn, r1 * c, y1, r1 * sn); N.push(nr[0] * c, nr[1], nr[0] * sn, nr[0] * c, nr[1], nr[0] * sn); }
      for (let j = 0; j < seg; j++) { const a = b + j * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    return build(P, N, I);
  }
  function torus(R, r, seg = 32, sides = 12) {
    const P = [], N = [], I = [];
    for (let i = 0; i <= seg; i++) for (let j = 0; j <= sides; j++) { const u = i / seg * Math.PI * 2, v = j / sides * Math.PI * 2, n = [Math.cos(u) * Math.cos(v), Math.sin(v), Math.sin(u) * Math.cos(v)]; P.push(Math.cos(u) * (R + r * Math.cos(v)), r * Math.sin(v), Math.sin(u) * (R + r * Math.cos(v))); N.push(...n); }
    for (let i = 0; i < seg; i++) for (let j = 0; j < sides; j++) { const a = i * (sides + 1) + j, b = a + sides + 1; I.push(a, a + 1, b, b, a + 1, b + 1); }
    return build(P, N, I);
  }
  function prism(w, h, d) { // triangular roof prism, ridge along Z
    const v = [[-w / 2, 0], [w / 2, 0], [0, h]], P = [], N = [], I = [];
    const tri = z => { const b = P.length / 3; for (const [x, y] of v) { P.push(x, y, z); N.push(0, 0, Math.sign(z)); } I.push(...(z > 0 ? [b, b + 1, b + 2] : [b, b + 2, b + 1])); };
    tri(d / 2); tri(-d / 2);
    for (const [a, c] of [[0, 1], [1, 2], [2, 0]]) { const n = norm([v[c][1] - v[a][1], -(v[c][0] - v[a][0]), 0]), b = P.length / 3; P.push(v[a][0], v[a][1], d / 2, v[c][0], v[c][1], d / 2, v[c][0], v[c][1], -d / 2, v[a][0], v[a][1], -d / 2); for (let k = 0; k < 4; k++) N.push(...n); I.push(b, b + 2, b + 1, b, b + 3, b + 2); }
    return build(P, N, I);
  }
  const GEO = {
    box: o => { const s = [].concat(o.size ?? 1); return box(s[0], s[1] ?? s[0], s[2] ?? s[0]); },
    sphere: o => sphere(o.r ?? 0.5, o.seg ?? 24),
    cylinder: o => { const r = o.r ?? 0.5, h = o.h ?? 1; return lathe([[0, -h / 2], [r, -h / 2], [r, h / 2], [0, h / 2]], o.seg ?? 20); },
    cone: o => { const r = o.r ?? 0.5, h = o.h ?? 1; return lathe([[0, -h / 2], [r, -h / 2], [0, h / 2]], o.seg ?? 20); },
    torus: o => torus(o.R ?? 0.8, o.r ?? 0.2, o.seg ?? 32, o.sides ?? 12),
    plane: o => { const s = [].concat(o.size ?? 10); return box(s[0], 0.001, s[1] ?? s[0]); },
    prism: o => { const s = [].concat(o.size ?? 1); return prism(s[0], s[1] ?? s[0], s[2] ?? s[0]); },
    lathe: o => lathe(o.profile || [[0, 0], [0.5, 0], [0.5, 1], [0, 1]], o.seg ?? 20)
  };
  // prefabs: part lists in a local frame (y up, base at y = 0)
  const PREFAB = {
    rocket: o => [
      { shape: 'lathe', profile: [[0, 0], [0.34, 0.05], [0.42, 0.6], [0.42, 1.7], [0.3, 2.3], [0, 2.75]], color: o.color || '#F2F4F8', seg: 24 },
      { shape: 'cone', r: 0.3, h: 0.4, pos: [0, 2.6, 0], color: o.accent || 'a1', seg: 24 },
      { shape: 'cylinder', r: 0.2, h: 0.08, pos: [0, 1.55, 0.36], rot: [90, 0, 0], color: '#7FD0FF', emissive: 0.4 },
      { shape: 'torus', R: 0.2, r: 0.05, pos: [0, 1.55, 0.38], rot: [90, 0, 0], color: o.accent || 'a1' },
      ...[0, 120, 240].map(a => ({ shape: 'prism', size: [0.5, 0.7, 0.07], pos: [Math.sin(a * DEG) * 0.36, 0.05, Math.cos(a * DEG) * 0.36], rot: [0, a + 90, 0], color: o.accent || 'a1' })),
      { shape: 'cylinder', r: 0.24, h: 0.2, pos: [0, -0.05, 0], color: '#5B6275' }
    ],
    tree: o => [{ shape: 'cylinder', r: 0.12, h: 0.8, pos: [0, 0.4, 0], color: '#8A5A34' }, { shape: 'sphere', r: 0.62, pos: [0, 1.25, 0], color: o.color || '#3FBF6A', seg: 10 }, { shape: 'sphere', r: 0.42, pos: [0.38, 0.95, 0.1], color: o.color || '#3FBF6A', seg: 10 }],
    pine: o => [{ shape: 'cylinder', r: 0.1, h: 0.5, pos: [0, 0.25, 0], color: '#8A5A34' }, ...[0, 1, 2].map(i => ({ shape: 'cone', r: 0.7 - i * 0.18, h: 0.8, pos: [0, 0.8 + i * 0.45, 0], color: o.color || '#2FA05A', seg: 8 }))],
    house: o => [{ shape: 'box', size: [1.4, 1, 1.2], pos: [0, 0.5, 0], color: o.color || '#FFF4E0' }, { shape: 'prism', size: [1.7, 0.8, 1.35], pos: [0, 1, 0], color: o.accent || 'a1' },
      { shape: 'box', size: [0.34, 0.56, 0.05], pos: [0, 0.28, 0.61], color: '#7A4B2A' }, { shape: 'box', size: [0.3, 0.28, 0.05], pos: [0.42, 0.62, 0.61], color: '#9FD8FF', emissive: 0.3 }],
    cloud: o => [[0, 0, 0.55], [0.55, -0.1, 0.4], [-0.55, -0.12, 0.42], [0.15, 0.3, 0.45]].map(([x, y, r]) => ({ shape: 'sphere', r, pos: [x, y, 0], color: o.color || '#FFFFFF', seg: 14 })),
    mountain: o => [{ shape: 'cone', r: 1.6, h: 2.2, pos: [0, 1.1, 0], color: o.color || '#7C8CF8', seg: 7 }, { shape: 'cone', r: 0.55, h: 0.75, pos: [0, 1.83, 0], color: '#FFFFFF', seg: 7 }],
    planet: o => [{ shape: 'sphere', r: 1, color: o.color || 'a5', seg: 28 }, { shape: 'torus', R: 1.6, r: 0.08, rot: [18, 0, 12], color: o.accent || 'a2', seg: 48 }]
  };
  KV.gl3dPrefabs = PREFAB; // registry: a tier-3 file may add KV.gl3dPrefabs.name = o => [parts]

  // ------------------------------------------------------------------ GL setup (one context per size)
  const VS = `#version 300 es
in vec3 aPos; in vec3 aNrm; uniform mat4 uMVP, uModel; uniform mat3 uNrm; uniform float uOutline;
out vec3 vN; out vec3 vW;
void main() { vec3 p = aPos + normalize(aNrm) * uOutline; vec4 w = uModel * vec4(p, 1.0); vW = w.xyz; vN = normalize(uNrm * aNrm); gl_Position = uMVP * vec4(p, 1.0); }`;
  const FS = `#version 300 es
precision highp float; in vec3 vN; in vec3 vW; out vec4 o;
uniform vec3 uColor, uL, uLC, uCam, uFogC, uInk; uniform float uAmb, uRim, uEmis, uToon, uFogN, uFogF, uAlpha, uFlat, uSpec;
void main() {
  if (uFlat > 0.5) { o = vec4(uInk * uAlpha, uAlpha); return; }
  vec3 N = normalize(vN), V = normalize(uCam - vW), L = normalize(uL);
  float d = max(dot(N, L), 0.0); if (uToon > 0.5) d = smoothstep(0.08, 0.14, d) * 0.55 + smoothstep(0.55, 0.62, d) * 0.45;
  float s = pow(max(dot(reflect(-L, N), V), 0.0), 40.0); if (uToon > 0.5) s = step(0.6, s);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * uRim;
  vec3 c = uColor * (uAmb + d * uLC * (1.0 - uAmb)) + s * uSpec * uLC + rim * uLC;
  c = mix(c, uColor * 1.35, uEmis);
  float f = clamp((length(uCam - vW) - uFogN) / max(0.001, uFogF - uFogN), 0.0, 1.0); c = mix(c, uFogC, f * step(0.0, uFogF));
  o = vec4(c * uAlpha, uAlpha);
}`;
  const PVS = `#version 300 es
in vec4 aSeed; uniform mat4 uVP; uniform float uT, uType, uLife, uSpeed, uGrav, uSize, uPx, uR, uSpread, uN;
uniform vec3 uC, uDir, uCA, uCB; uniform vec3 uPath[32]; uniform float uP0, uP1;
out vec3 vCol; out float vA;
vec3 pathAt(float t) { float k = clamp((t - uP0) / max(0.001, uP1 - uP0), 0.0, 1.0) * 31.0; int i = int(min(floor(k), 30.0)); return mix(uPath[i], uPath[i + 1], k - float(i)); }
vec3 sph(vec2 r) { float z = r.x * 2.0 - 1.0, a = r.y * 6.2831853, s = sqrt(1.0 - z * z); return vec3(s * cos(a), z, s * sin(a)); }
void main() {
  vec3 p; float a = 1.0, sz = uSize; vCol = mix(uCA, uCB, aSeed.z);
  if (uType < 0.5) { // stars: shell around uC, twinkle
    p = uC + sph(aSeed.xy) * uR * (0.55 + 0.45 * aSeed.w); a = 0.45 + 0.55 * (0.5 + 0.5 * sin(uT * (1.5 + aSeed.z * 3.0) + aSeed.w * 40.0)); sz *= 0.5 + aSeed.w;
  } else if (uType < 1.5) { // burst at uC from t = 0, drag + gravity, fades over life
    float t = uT - aSeed.w * 0.06; if (t < 0.0 || t > uLife) { gl_Position = vec4(2, 2, 2, 1); return; }
    vec3 v = sph(aSeed.xy) * uSpeed * (0.35 + 0.65 * aSeed.z); float dr = 1.6;
    p = uC + v * (1.0 - exp(-dr * t)) / dr + vec3(0.0, -0.5 * uGrav * t * t, 0.0); float k = t / uLife; a = (1.0 - k) * (1.0 - k) * 1.6; sz *= 1.0 - 0.5 * k; vCol = mix(uCA, uCB, k);
  } else if (uType < 2.5) { // trail: emitted along the sampled path of a moving group, drifts along uDir, grows, fades
    float age = mod(aSeed.w * uLife + uT, uLife); float birth = uT - age; if (birth < uP0) { gl_Position = vec4(2, 2, 2, 1); return; }
    vec3 j = (sph(aSeed.xy) * uSpread + normalize(uDir)) * uSpeed * age; p = pathAt(birth) + j + vec3(0.0, -0.5 * uGrav * age * age, 0.0);
    float k = age / uLife; a = (1.0 - k) * 0.3; sz *= 0.6 + 2.2 * k; vCol = mix(uCA, uCB, smoothstep(0.0, 0.35, k)); // dense additive trail: low alpha per particle
  } else { // drift: floating dust / snow / fireflies in a box of half-size uR around uC
    p = uC + (vec3(aSeed.x, aSeed.y, aSeed.z) * 2.0 - 1.0) * uR + vec3(sin(uT * 0.7 + aSeed.w * 30.0), cos(uT * 0.5 + aSeed.x * 20.0), 0.0) * 0.3 + normalize(uDir) * uSpeed * uT;
    a = 0.4 + 0.6 * (0.5 + 0.5 * sin(uT * 2.0 + aSeed.w * 50.0));
  }
  vec4 c = uVP * vec4(p, 1.0); gl_Position = c; gl_PointSize = max(1.0, sz * uPx / max(0.1, c.w)); vA = a;
}`;
  const PFS = `#version 300 es
precision highp float; in vec3 vCol; in float vA; out vec4 o;
void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float d = dot(c, c); if (d > 1.0) discard; float a = exp(-d * 3.5) * vA; o = vec4(vCol * a, a); }`;
  const CTX = {};
  function glFor(w, h) {
    const key = w + 'x' + h; if (CTX[key]) return CTX[key];
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const gl = cv.getContext('webgl2', { antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('scene3d: WebGL2 unavailable (render with the GPU enabled)');
    const prog = (vs, fs) => { const p = gl.createProgram(); for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('scene3d shader: ' + gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); } gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('scene3d link: ' + gl.getProgramInfoLog(p)); return p; };
    const S = { cv, gl, mesh: prog(VS, FS), pts: prog(PVS, PFS), vao: {}, pbuf: {}, loc: {} };
    for (const k of ['mesh', 'pts']) { const p = S[k], L = S.loc[k] = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); L[u.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, u.name); } }
    return (CTX[key] = S);
  }
  function vaoFor(S, key, geo) {
    if (S.vao[key]) return S.vao[key];
    const gl = S.gl, g = geo(), vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    for (const [name, data] of [['aPos', g.pos], ['aNrm', g.nrm]]) { const loc = gl.getAttribLocation(S.mesh, name), b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0); }
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null); return (S.vao[key] = { vao, n: g.idx.length });
  }
  function seedsFor(S, n, seed = 0) { // deterministic per-particle seeds (vec4); a different seed = a different pattern
    const key = n + ':' + seed; if (S.pbuf[key]) return S.pbuf[key];
    const gl = S.gl, d = new Float32Array(n * 4); let x = (2463534242 ^ Math.imul(seed + 1, 2654435761)) >>> 0 || 1;
    for (let i = 0; i < d.length; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; d[i] = (x % 100000) / 100000; }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(S.pts, 'aSeed'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    return (S.pbuf[key] = vao);
  }

  // ------------------------------------------------------------------ animation helpers (times in beats from scene start)
  function keyed(base, keys, st, T) {
    if (!keys || !keys.length) return base;
    const ks = keys.map(k => Object.assign({}, k, { t: T(k.t) }));
    if (ks[0].t > 0) ks.unshift({ t: 0 }); // before the first key: move from the base pose (at time 0)
    let prev = Object.assign({}, base), list = ks.map(k => (prev = Object.assign({}, prev, k)));
    if (st <= list[0].t) return list[0]; if (st >= list[list.length - 1].t) return list[list.length - 1];
    let i = 0; while (st > list[i + 1].t) i++;
    const a = list[i], b = list[i + 1], k = (easeOf(b.ease) || E.io)((st - a.t) / (b.t - a.t)), o = {};
    for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) { const x = a[f], y = b[f]; o[f] = Array.isArray(x) && Array.isArray(y) ? x.map((v, j) => lerp(v, y[j], k)) : typeof x === 'number' && typeof y === 'number' ? lerp(x, y, k) : y ?? x; }
    return o;
  }
  function objMatrix(o, st, T) {
    const s0 = keyed({ pos: o.pos || [0, 0, 0], rot: o.rot || [0, 0, 0], scale: o.scale ?? 1 }, o.keys, st, T);
    const rot = s0.rot.slice(); if (o.spin) for (let i = 0; i < 3; i++) rot[i] += (o.spin[i] || 0) * st;
    const pos = s0.pos.slice(); if (o.bob) pos[1] += Math.sin(st * Math.PI * 2 / (o.bobPeriod ?? 2.4)) * o.bob;
    const tin = T(o.in), g = o.grow != null ? T(o.grow) : T(1.2), k = st < tin ? 0 : clamp((st - tin) / g);
    const out = o.out != null && st > T(o.out) ? 1 - clamp((st - T(o.out)) / 0.35) : 1;
    const gs = (o.reveal === 'fade' ? 1 : o.reveal === 'none' ? 1 : E.oB(k)) * out;
    const sc = typeof s0.scale === 'number' ? s0.scale * gs : s0.scale.map(v => v * gs);
    return { m: trs(pos, rot, sc), k, visible: st >= tin && gs > 0.001, fade: o.reveal === 'fade' ? k * out : out, pos };
  }

  // ------------------------------------------------------------------ the block
  KV.define('scene3d', {
    cat: 'media', at: 'full', enter: 'fade',
    draw(ctx, P, env) {
      const W = Math.round(env.box.w * (P.res ?? 1)), H = Math.round(env.box.h * (P.res ?? 1)), S = glFor(W, H), gl = S.gl, T = env.T;
      const st = P.clock === 'video' ? env.t : env.st, t00 = P.clock === 'video' ? env.sc.t0 : 0; // clock 'video': times from the video start
      const c0 = Object.assign({ pos: [0, 2, 10], target: [0, 1, 0], fov: 40 }, P.camera || {});
      const cam = keyed({ pos: c0.pos, target: c0.target, fov: c0.fov }, c0.keys, st, T), camTgt = cam.target, fov = cam.fov * DEG;
      let camPos = cam.pos;
      if (c0.orbit) { // orbit on a circle around the target: yaw [from, to] degrees over at [inBeat, outBeat] (no cutting through objects)
        const o = c0.orbit, at = [].concat(o.at ?? []), a0 = T(at[0] ?? 0), a1 = at[1] != null ? T(at[1]) : t00 + env.sc.dur, yaw = [].concat(o.yaw ?? [0, 90]);
        const a = lerp(yaw[0], yaw[1] ?? yaw[0], (easeOf(o.ease) || E.io)(clamp((st - a0) / Math.max(0.01, a1 - a0)))) * DEG, r = o.radius ?? 10;
        camPos = [camTgt[0] + Math.sin(a) * r, camTgt[1] + (o.height ?? 2), camTgt[2] + Math.cos(a) * r];
      }
      const shake = (P.camera || {}).shake ? (P.camera.shake * Math.sin(st * 53) * Math.exp(-Math.max(0, st - T(P.camera.shakeAt ?? 0)) * 3) * (st >= T(P.camera.shakeAt ?? 0) ? 1 : 0)) : 0;
      const eye = [camPos[0] + shake, camPos[1] + shake * 0.6, camPos[2]];
      const proj = c0.ortho ? ortho(c0.ortho * W / H / 2, c0.ortho / 2, 0.1, 400) : persp(fov, W / H, 0.1, 400), view = lookAt(eye, camTgt), VP = mul(proj, view);
      const Lt = Object.assign({ dir: [-0.5, 0.9, 0.6], color: '#FFFFFF', ambient: 0.38, rim: 0.35, spec: 0.5, toon: true }, P.light || {});
      const ink = rgb(P.ink || (env.theme.bgStyle === 'tech' || env.theme.bgStyle === 'steel' ? '#0B1020' : 'ink')), fog = P.fog;
      gl.viewport(0, 0, W, H);
      const bg = P.bg ? rgb(P.bg) : null; gl.clearColor(bg ? bg[0] : 0, bg ? bg[1] : 0, bg ? bg[2] : 0, bg ? 1 : 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(true);
      gl.useProgram(S.mesh); const U = S.loc.mesh;
      gl.uniform3fv(U.uL, norm(Lt.dir)); gl.uniform3fv(U.uLC, rgb(Lt.color)); gl.uniform3fv(U.uCam, eye); gl.uniform1f(U.uAmb, Lt.ambient); gl.uniform1f(U.uRim, Lt.rim); gl.uniform1f(U.uSpec, Lt.spec); gl.uniform1f(U.uToon, Lt.toon ? 1 : 0);
      gl.uniform3fv(U.uFogC, fog ? rgb(fog.color || '#000') : [0, 0, 0]); gl.uniform1f(U.uFogN, fog ? fog.near ?? 10 : 0); gl.uniform1f(U.uFogF, fog ? fog.far ?? 60 : -1); gl.uniform3fv(U.uInk, ink);
      // expand prefabs + groups into a flat part list with world matrices
      const groups = P.groups || {}, gmat = {};
      for (const [name, g] of Object.entries(groups)) gmat[name] = objMatrix(g, st, T);
      const parts = [];
      (P.objects || []).forEach((o, i) => {
        const om = objMatrix(o, st, T); if (!om.visible) return;
        const G = o.group && gmat[o.group]; if (G && !G.visible) return;
        const base = G ? mul(G.m, om.m) : om.m, k = Math.min(om.k, G ? G.k : 1), fade = om.fade * (G ? G.fade : 1);
        const list = o.prefab ? (PREFAB[o.prefab] || (() => { throw new Error(`scene3d: prefab "${o.prefab}" (${Object.keys(PREFAB).join(', ')})`); }))(o, st) : [o];
        list.forEach((q, j) => parts.push({ q, key: o.prefab ? `${o.prefab}:${j}:${o.color || ''}` : `o${i}`, m: o.prefab ? mul(base, q.keys || q.spin || q.bob ? objMatrix(Object.assign({ in: -1e9, reveal: 'none' }, q), st, T).m : trs(q.pos, q.rot, q.scale ?? 1)) : base, k, fade, reveal: o.reveal || P.reveal || 'grow', outline: o.outline ?? P.outline ?? true, emis: q.emissive ?? o.emissive ?? 0 }));
      });
      if (P.ground) { const g = P.ground; parts.push({ q: { shape: 'plane', size: g.size ?? 60, color: g.color || 'bg' }, key: 'ground' + (g.size ?? 60), m: trs([0, g.y ?? 0, 0]), k: 1, fade: 1, reveal: 'none', outline: false, emis: 0 }); }
      for (const p of parts) {
        const q = p.q, geo = GEO[q.shape]; if (!geo) throw new Error(`scene3d: shape "${q.shape}" (${Object.keys(GEO).join(', ')})`);
        const mesh = vaoFor(S, p.key + JSON.stringify([q.shape, q.size, q.r, q.h, q.R, q.seg, q.profile]), () => geo(q));
        gl.bindVertexArray(mesh.vao); gl.uniformMatrix4fv(U.uMVP, false, mul(VP, p.m)); gl.uniformMatrix4fv(U.uModel, false, p.m); gl.uniformMatrix3fv(U.uNrm, false, nrmMat(p.m));
        // sketch reveal: paper-white with ink outline first, then colour floods in
        const col = rgb(q.color || 'a1'), paper = [0.97, 0.96, 0.93], ck = p.reveal === 'sketch' ? clamp(p.k * 2 - 0.6) : 1;
        gl.uniform3fv(U.uColor, mix3(paper, col, ck)); gl.uniform1f(U.uEmis, p.emis); gl.uniform1f(U.uAlpha, p.fade);
        if (p.outline) { gl.cullFace(gl.FRONT); gl.uniform1f(U.uFlat, 1); gl.uniform1f(U.uOutline, (P.outlineW ?? 0.035) * (typeof p.outline === 'number' ? p.outline : 1)); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0); }
        gl.cullFace(gl.BACK); gl.uniform1f(U.uFlat, 0); gl.uniform1f(U.uOutline, 0); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
      }
      // particles (additive, depth-tested, no depth writes)
      const PS = P.particles || [];
      if (PS.length) {
        gl.useProgram(S.pts); const Q = S.loc.pts; gl.depthMask(false); gl.blendFunc(gl.ONE, gl.ONE); gl.disable(gl.CULL_FACE);
        gl.uniformMatrix4fv(Q.uVP, false, VP); gl.uniform1f(Q.uPx, c0.ortho ? H / c0.ortho : H / (2 * Math.tan(fov / 2))); // ortho: clip w = 1
        const TYPES = { stars: 0, burst: 1, trail: 2, drift: 3 };
        PS.forEach((sys, si) => {
          const tin = T(sys.in), t = st - tin; if (t < 0 || (sys.out != null && st > T(sys.out))) return;
          const n = Math.min(200000, sys.n ?? 3000), vao = seedsFor(S, n, sys.seed ?? si); gl.bindVertexArray(vao);
          gl.blendFunc(gl.ONE, sys.blend === 'normal' ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE); // additive glow by default; 'normal' shows on paper
          gl.uniform1f(Q.uT, t); gl.uniform1f(Q.uType, TYPES[sys.type || 'stars'] ?? 0); gl.uniform1f(Q.uLife, T(sys.life ?? '1.6s')); gl.uniform1f(Q.uSpeed, sys.speed ?? (sys.type === 'drift' ? 0.3 : 6));
          gl.uniform1f(Q.uGrav, sys.gravity ?? 3); gl.uniform1f(Q.uSize, sys.size ?? (sys.type === 'burst' ? 0.3 : sys.type === 'trail' ? 0.22 : 0.1)); gl.uniform1f(Q.uR, sys.radius ?? 40); gl.uniform1f(Q.uSpread, sys.spread ?? 0.25);
          gl.uniform3fv(Q.uC, sys.center || [0, 0, 0]); gl.uniform3fv(Q.uDir, sys.dir || [0, -1, 0]); gl.uniform3fv(Q.uCA, rgb(sys.color || '#FFFFFF')); gl.uniform3fv(Q.uCB, rgb(sys.color2 || sys.color || '#FFFFFF'));
          if (sys.type === 'trail') { // sample the followed group's path over the emission window (32 points)
            const g = groups[sys.follow]; if (!g) throw new Error(`scene3d: trail follows unknown group "${sys.follow}"`);
            const t0 = tin, t1 = sys.out != null ? T(sys.out) : t00 + env.sc.dur + 1, pts = [], off = sys.offset || [0, 0, 0];
            for (let i = 0; i < 32; i++) { const tt = lerp(t0, t1, i / 31), s = keyed({ pos: g.pos || [0, 0, 0] }, g.keys, tt, T); pts.push(s.pos[0] + off[0], s.pos[1] + off[1], s.pos[2] + off[2]); }
            gl.uniform3fv(Q.uPath, new Float32Array(pts)); gl.uniform1f(Q.uP0, 0); gl.uniform1f(Q.uP1, t1 - t0);
          }
          gl.drawArrays(gl.POINTS, 0, n);
        });
        gl.depthMask(true); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
      gl.bindVertexArray(null);
      ctx.drawImage(S.cv, 0, 0, W, H, env.box.x, env.box.y, env.box.w, env.box.h);
    }
  });
})();
