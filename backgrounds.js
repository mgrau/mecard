// ─────────────────────────────────────────────────────────────
//  Animated card backgrounds
// ─────────────────────────────────────────────────────────────
//  Each background is a self-contained SVG string. The scenes are
//  drawn in a 400 × 850 frame, pinned to the bottom of the card and
//  sliced to fit, so the artwork along the bottom survives however
//  tall the card turns out. All motion is SMIL. The page script
//  pauses backgrounds that aren't showing, freezes them on a `poster`
//  frame for reduced motion, and slides each `data-quiet` mask so it
//  dims whatever sits behind the text.
//
//    waves     Diagonal bands in the theme colours, with travelling
//              boundaries, stretched to fill the card.
//    paul      Linear Paul trap cross-section with a three-ion crystal
//              in its normal modes, lit by 493 nm and 650 nm beams.
//    spectrum  Ba emission spectrum as a spectrograph plate, with a
//              scan that traces the spectrum along the bottom.
// ─────────────────────────────────────────────────────────────

const W = 400, H = 850;

const C = {
  ink: "#fbf9f6",
  g: "#2fe0b8", // 493 nm
  r: "#ff5a3c", // 650 nm
  v: "#9d7bff",
  sky: "#58c8ff",
  ice: "#e8fbff",
};

// ── Helpers ──────────────────────────────────────────────────
const f = (n, d = 2) => (+n).toFixed(d).replace(/\.?0+$/, "") || "0";
const SINE = ".37 0 .63 1"; // makes a −a → a → −a sweep read as a cosine
const pathOf = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${f(p[0], 1)},${f(p[1], 1)}`).join("");
const svgOpen = (name, align = "xMidYMax") =>
  `<svg class="bg-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="${align} slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-bg-svg="${name}">`;

const ease = (vals, dur, begin = 0, attr = "opacity") =>
  `<animate attributeName="${attr}" values="${vals}" dur="${f(dur)}s" begin="${f(begin)}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.5;1" keySplines="${SINE};${SINE}"/>`;

const osc = (dx, dy, dur, phase = 0) =>
  `<animateTransform attributeName="transform" type="translate" additive="sum" dur="${f(dur)}s" begin="${f(-phase * dur)}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.5;1" keySplines="${SINE};${SINE}" values="${f(-dx)},${f(-dy)};${f(dx)},${f(dy)};${f(-dx)},${f(-dy)}"/>`;

const RF = (a, b, dur = 8, attr = "stroke") =>
  `<animate attributeName="${attr}" values="${a};${b};${a}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.5;1" keySplines="${SINE};${SINE}"/>`;

// "#rrggbb" → [r, g, b], and a blend of two such colours
export const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const mix = (a, b, t) =>
  "#" + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");

const linGrad = (id, stops, x2 = ".35") =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="1">${stops.map((c, i) => `<stop offset="${f(i / (stops.length - 1))}" stop-color="${c}"/>`).join("")}</linearGradient>`;

const glow = (id, col, core = C.ice, a = 0.7) =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${core}"/><stop offset=".16" stop-color="${col}" stop-opacity="${a}"/><stop offset=".5" stop-color="${col}" stop-opacity="${f(a * 0.25)}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;

// Mask that quiets the text block to `lo`. The page script moves the
// four stops onto the text wherever the layout puts it, ramping over
// `data-quiet` frame units; these defaults suit a card of the frame's shape.
const quiet = (id, lo) => `<linearGradient id="${id}-g" data-quiet="65" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
    <stop offset=".19" stop-color="#fff"/><stop offset=".27" stop-color="#fff" stop-opacity="${lo}"/><stop offset=".63" stop-color="#fff" stop-opacity="${lo}"/><stop offset=".7" stop-color="#fff"/></linearGradient>
    <mask id="${id}" maskUnits="userSpaceOnUse" x="-50" y="-50" width="${W + 100}" height="${H + 100}"><rect x="-50" y="-50" width="${W + 100}" height="${H + 100}" fill="url(#${id}-g)"/></mask>`;

const mono = (cls, size, op) =>
  `.${cls}{font:500 ${size}px ui-monospace,SFMono-Regular,Menlo,monospace;fill:${C.ink};fill-opacity:${op}}`;

function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ── Ion crystals ─────────────────────────────────────────────
// Equilibrium positions of N ions in a harmonic trap (dimensionless)
function ionEquilibrium(N) {
  let u = Array.from({ length: N }, (_, i) => (i - (N - 1) / 2) * 1.2);
  for (let it = 0; it < 20000; it++) {
    const g = u.map((ui, i) => {
      let F = -ui;
      for (let j = 0; j < N; j++) if (j !== i) F += Math.sign(ui - u[j]) / (ui - u[j]) ** 2;
      return F;
    });
    u = u.map((ui, i) => ui + 0.02 * g[i]);
  }
  return u;
}

// Symmetric eigen-decomposition (Jacobi), sorted by eigenvalue
function eig(A) {
  const n = A.length, a = A.map((r) => r.slice());
  const V = a.map((_, i) => a.map((_, j) => +(i === j)));
  for (let sweep = 0; sweep < 60; sweep++)
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-12) continue;
        const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
        const c = Math.cos(th), s = Math.sin(th);
        for (let k = 0; k < n; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
        for (let k = 0; k < n; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
        for (let k = 0; k < n; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
      }
  return a.map((r, i) => ({ w2: r[i], v: V.map((row) => row[i]) })).sort((x, y) => x.w2 - y.w2);
}

// A chain of glowing ions swaying in a mix of its lowest axial normal
// modes, each at its true frequency ratio (1, √3, …)
function chain({ N, cx, cy, ang, span, T0, amps, glowId, r }) {
  const u = ionEquilibrium(N);
  const Hm = u.map((ui, i) =>
    u.map((uj, j) =>
      i === j ? 1 + u.reduce((s, uk, k) => (k === i ? s : s + 2 / Math.abs(ui - uk) ** 3), 0) : -2 / Math.abs(ui - uj) ** 3
    )
  );
  const modes = eig(Hm).slice(0, amps.length);
  const scale = span / Math.max(...u);
  const ions = u.map((ui, i) => {
    const a = modes.map((m, k) => osc(amps[k] * m.v[i] * Math.sqrt(N), 0, T0 / Math.sqrt(m.w2), k * 0.27)).join("");
    return `<g transform="translate(${f(ui * scale)},0)"><g>${a}<circle r="${r}" fill="url(#${glowId})">${ease(".8;1;.8", 3.2 + (i % 3) * 0.9, -i)}</circle></g></g>`;
  });
  return `<g transform="translate(${cx},${cy}) rotate(${ang})">${ions.join("")}</g>`;
}

// ═════════════════════════════════════════════════════════════
//  PAUL TRAP
// ═════════════════════════════════════════════════════════════
const TRAP = { cx: 62, cy: 652, rot: -14, r0: 128, fadeR: 660 };

function paul({ hot = C.v, cold = C.sky } = {}) {
  const id = "bg-paul";
  const { cx, cy, rot, r0, fadeR } = TRAP;

  // Electrodes: hyperbolic surfaces u·v = r0²/2 in each quadrant
  const ce = (r0 * r0) / 2, U = 900;
  const hyp = (c, su, sv) => {
    const pts = [], u0 = c / U;
    for (let i = 0; i <= 60; i++) { const u = u0 * Math.pow(U / u0, i / 60); pts.push([su * u, -sv * (c / u)]); }
    return pts;
  };
  const quads = [[1, 1], [-1, -1], [-1, 1], [1, -1]]; // first pair carries the RF
  const blades = quads.map(([su, sv], i) => {
    const c1 = i < 2 ? hot : cold, c2 = i < 2 ? cold : hot;
    return `<path d="${pathOf(hyp(ce, su, sv))}L${su * U},${-sv * U}Z" fill="${c1}" fill-opacity=".2" stroke="${c1}" stroke-width="2.2" stroke-opacity=".95">${RF(c1, c2)}${RF(c1, c2, 8, "fill")}</path>
      <path d="${pathOf(hyp(ce * 1.25, su, sv))}" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="4"/>`;
  }).join("");
  const contours = [0.3, 0.6].flatMap((k) => quads.map(([su, sv], i) => {
    const c1 = i < 2 ? hot : cold, c2 = i < 2 ? cold : hot;
    return `<path d="${pathOf(hyp(ce * k, su, sv))}" fill="none" stroke="${c1}" stroke-opacity=".38" stroke-width="1.1">${RF(c1, c2)}</path>`;
  })).join("");

  // Laser beam aimed at the crystal from the upper right. Wavefronts
  // travel toward the ions; the beam is quieted over the text.
  const beam = (bid, col, angDeg, spacing, width, alpha) => {
    const len = 1000, back = 140;
    let bars = "";
    for (let x = -back; x <= len; x += spacing) bars += `M${f(x)},${-width}V${width}`;
    const defs = `<linearGradient id="${bid}-p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity="0"/><stop offset=".5" stop-color="${col}" stop-opacity="${alpha}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient>
      <linearGradient id="${bid}-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <mask id="${bid}-mk" maskUnits="userSpaceOnUse" x="${-back}" y="${-width}" width="${len + back}" height="${2 * width}"><rect x="${-back}" y="${-width}" width="${len + back}" height="${2 * width}" fill="url(#${bid}-f)"/></mask>`;
    const body = `<g transform="translate(${cx},${cy}) rotate(${angDeg})">
        <rect x="${-back}" y="${-width}" width="${len + back}" height="${2 * width}" fill="url(#${bid}-p)"/>
        <g mask="url(#${bid}-mk)"><path d="${bars}" stroke="${col}" stroke-opacity=".4" stroke-width="1">
          <animateTransform attributeName="transform" type="translate" values="0,0;${-spacing},0" dur="${f(spacing / 7)}s" repeatCount="indefinite"/></path></g></g>`;
    // Where the beam enters the card, for a soft entry flare
    const a = (angDeg * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
    const t = Math.min((W - cx) / dx, -cy / dy);
    return { defs, body, entry: [cx + dx * t, cy + dy * t] };
  };
  const b1 = beam(`${id}-b1`, C.g, -61, 9, 22, 0.32);
  const b2 = beam(`${id}-b2`, C.r, -67, 11.8, 18, 0.27);
  const flare = (p, n) => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="70" fill="url(#${id}-fl${n})">${ease(".7;1;.7", 6 + n, -n)}</circle>`;

  return `${svgOpen("paul")}
  <defs>
    ${linGrad(`${id}-bg`, ["#1e1d26", "#222830", "#1c3438"])}
    ${glow(`${id}-ion`, C.g)}
    <radialGradient id="${id}-fade" cx="${cx}" cy="${cy}" r="${fadeR}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#${id}-fade)"/></mask>
    ${quiet(`${id}-q`, 0.45)}
    ${quiet(`${id}-lq`, 0.3)}
    <radialGradient id="${id}-ps"><stop offset="0" stop-color="${C.v}" stop-opacity=".38"/><stop offset="1" stop-color="${C.v}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-fl1"><stop offset="0" stop-color="${C.g}" stop-opacity=".35"/><stop offset="1" stop-color="${C.g}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-fl2"><stop offset="0" stop-color="${C.r}" stop-opacity=".3"/><stop offset="1" stop-color="${C.r}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-fluor"><stop offset="0" stop-color="${C.g}" stop-opacity=".3"/><stop offset="1" stop-color="${C.g}" stop-opacity="0"/></radialGradient>
    ${b1.defs}${b2.defs}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#${id}-bg)"/>
  <g mask="url(#${id}-q)"><g mask="url(#${id}-m)"><g transform="translate(${cx},${cy}) rotate(${rot})">
    <circle r="${f(r0 * 0.9)}" fill="url(#${id}-ps)">${ease(".6;1;.6", 8)}</circle>
    ${contours}${blades}
  </g></g></g>
  <g mask="url(#${id}-lq)">${b1.body}${b2.body}</g>
  ${flare(b1.entry, 1)}${flare(b2.entry, 2)}
  <circle cx="${cx}" cy="${cy}" r="70" fill="url(#${id}-fluor)">${ease(".6;1;.6", 4.5)}</circle>
  ${chain({ N: 3, cx, cy, ang: rot - 45, span: 30, T0: 7, amps: [3.5, 2.5], glowId: `${id}-ion`, r: 18 })}
</svg>`;
}

// ═════════════════════════════════════════════════════════════
//  SPECTRUM
// ═════════════════════════════════════════════════════════════
// Barium lines: [nm, relative strength, ion stage]
const BA = [
  [455.40, 1.0, "II"], [493.41, 0.95, "II"], [553.55, 0.9, "I"], [577.76, 0.4, "I"],
  [585.37, 0.5, "II"], [614.17, 0.75, "II"], [649.69, 0.85, "II"],
];
const NM0 = 440, NM1 = 665;
const X = (nm) => ((nm - NM0) / (NM1 - NM0)) * W;
const BASE = 826, TOP = 660, SCAN = 30, GO = 0.86; // cursor crosses the card in GO·SCAN s

// Wavelength (nm) → saturated sRGB
function nm2rgb(nm) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else r = 1;
  return "#" + [r, g, b].map((v) => Math.round(255 * Math.pow(Math.max(0, v), 0.8)).toString(16).padStart(2, "0")).join("");
}

function spectrum() {
  const id = "bg-spec";
  const lor = (d, g) => (g * g) / (d * d + g * g);

  // Measured-looking trace: narrow Lorentzians on broad wings, a little shot noise
  const R = rng(7), pts = [];
  for (let x = 0; x <= W; x += 1.5) {
    const nm = NM0 + (x / W) * (NM1 - NM0);
    let y = 0.02;
    BA.forEach(([c, I]) => { const d = nm - c; y += I * (0.84 * lor(d, 1.9) + 0.16 * lor(d, 8)); });
    y += (R() - 0.5) * 0.03 * Math.sqrt(y + 0.05);
    pts.push([x, BASE - Math.max(0, Math.min(1.02, y)) * (BASE - TOP)]);
  }
  const line = pathOf(pts), fill = `${line}L${W},${BASE}L0,${BASE}Z`;

  // Plate lines: resting dim, swelling as the scan cursor reaches them
  const lines = BA.map(([nm, , sp], i) => {
    const x = X(nm), col = nm2rgb(nm), t = (x / W) * GO;
    const a = Math.max(0.001, t - 0.09), b = Math.min(0.97, t + 0.09);
    const kt = [0, a, t, b, 1].map((v) => f(v, 4)).join(";");
    const w = sp === "II" ? 26 : 18;
    return `<g transform="translate(${f(x)},0)" opacity=".2">
      <animate attributeName="opacity" values=".2;.2;1;.2;.2" keyTimes="${kt}" dur="${SCAN}s" repeatCount="indefinite" calcMode="spline" keySplines="0 0 1 1;.4 0 .6 1;.4 0 .6 1;0 0 1 1"/>
      <rect x="${-w}" y="0" width="${2 * w}" height="${H}" fill="url(#${id}-l${i})">${ease(".7;1;.7", 5 + i * 1.1, -i * 1.7, "fill-opacity")}</rect>
      <rect x="${sp === "II" ? -1.2 : -0.8}" y="0" width="${sp === "II" ? 2.4 : 1.6}" height="${H}" fill="${mix(col, "#ffffff", 0.35)}"/></g>`;
  }).join("\n    ");
  const lineGrads = BA.map(([nm], i) => {
    const c = nm2rgb(nm);
    return `<linearGradient id="${id}-l${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset=".4" stop-color="${c}" stop-opacity=".25"/><stop offset=".5" stop-color="${c}" stop-opacity=".8"/><stop offset=".6" stop-color="${c}" stop-opacity=".25"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`;
  }).join("");
  const cont = Array.from({ length: 16 }, (_, i) => `<stop offset="${f(i / 15, 3)}" stop-color="${nm2rgb(NM0 + ((NM1 - NM0) * i) / 15)}"/>`).join("");
  const ticks = [450, 500, 550, 600, 650]
    // 450 keeps its tick but not its label, which narrow phones crop off
    .map((nm) => `<line x1="${f(X(nm))}" x2="${f(X(nm))}" y1="${BASE}" y2="${BASE + 5}"/>${nm > 450 ? `<text x="${f(X(nm))}" y="${BASE + 15}" text-anchor="middle" class="nm">${nm}</text>` : ""}`)
    .join("");

  return `${svgOpen("spectrum")}
  <defs>
    <linearGradient id="${id}-c" x1="0" y1="0" x2="${W}" y2="0" gradientUnits="userSpaceOnUse">${cont}</linearGradient>
    <linearGradient id="${id}-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16161b" stop-opacity=".2"/><stop offset=".5" stop-color="#16161b" stop-opacity=".75"/><stop offset="1" stop-color="#16161b" stop-opacity=".45"/></linearGradient>
    ${quiet(`${id}-q`, 0.16)}
    ${quiet(`${id}-tq`, 0.45)}
    <linearGradient id="${id}-tg" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset=".7" stop-color="#fff"/><stop offset=".72" stop-color="#fff" stop-opacity=".8"/><stop offset=".8" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient>
    <mask id="${id}-t" maskUnits="userSpaceOnUse" x="-50" y="-50" width="${W + 100}" height="${H + 100}"><rect x="-50" y="-50" width="${W + 100}" height="${H + 100}" fill="url(#${id}-tg)"/></mask>
    <linearGradient id="${id}-cur" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="${id}-rv"><rect x="0" y="0" width="0" height="${H}"><animate attributeName="width" values="0;${W};${W}" keyTimes="0;${GO};1" dur="${SCAN}s" repeatCount="indefinite"/></rect></clipPath>
    ${lineGrads}
    <style>${mono("nm", 8, 0.5)}</style>
  </defs>
  <rect width="${W}" height="${H}" fill="#18181d"/>
  <rect width="${W}" height="${H}" fill="url(#${id}-c)" opacity=".16"/>
  <rect width="${W}" height="${H}" fill="url(#${id}-v)"/>
  <g mask="url(#${id}-q)"><g mask="url(#${id}-t)">
    ${lines}
    <g><animateTransform attributeName="transform" type="translate" values="0,0;${W},0;${W},0" keyTimes="0;${GO};1" dur="${SCAN}s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;${GO};${f(GO + 0.04)};1" dur="${SCAN}s" repeatCount="indefinite"/>
      <rect x="-12" y="0" width="24" height="${H}" fill="url(#${id}-cur)"/><rect x="-.5" y="0" width="1" height="${H}" fill="#fff" fill-opacity=".3"/></g>
  </g></g>
  <g mask="url(#${id}-tq)"><g clip-path="url(#${id}-rv)">
    <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.93;.99;1" dur="${SCAN}s" repeatCount="indefinite"/>
    <path d="${fill}" fill="url(#${id}-c)" fill-opacity=".5"/>
    <path d="${line}" fill="none" stroke="${C.ink}" stroke-opacity=".85" stroke-width="1.2" stroke-linejoin="round"/>
  </g></g>
  <g stroke="${C.ink}" stroke-opacity=".4"><line x1="0" x2="${W}" y1="${BASE}" y2="${BASE}"/>${ticks}</g>
</svg>`;
}

// ═════════════════════════════════════════════════════════════
//  WAVES
// ═════════════════════════════════════════════════════════════
// Two diagonal bands over the card colour, with travelling edges.
// Their colours come from the theme through CSS (.layer-mid,
// .layer-dark and the layer's background), so the drawing has none.

// Builds a diagonal wavy edge from (100, startY) to (0, endY).
// Shifting `phase` makes the crests travel along the diagonal,
// which is what the SMIL animation below interpolates through.
function wavePath(startY, endY, amp, phase, freq, segments = 4) {
  const yAt = (t) =>
    startY + (endY - startY) * t + amp * Math.sin(phase + t * freq * Math.PI);

  let d = `M100,${f(yAt(0))}`;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const x0 = 100 - 100 * t0;
    const x1 = 100 - 100 * t1;
    const dx = (x1 - x0) / 3;
    // Slope at each anchor, used to place control points tangentially
    const slope = (t) =>
      (endY - startY) / segments +
      amp * freq * Math.PI * Math.cos(phase + t * freq * Math.PI) / segments;
    d += ` C${f(x0 + dx)},${f(yAt(t0) + slope(t0) / 3)} ${f(x1 - dx)},${f(yAt(t1) - slope(t1) / 3)} ${f(x1)},${f(yAt(t1))}`;
  }
  return d;
}

// Closes the wave into the top-left region so it can be filled
const closeWave = (d) => `${d} L0,0 L100,0 Z`;

// Seamless loop: phase 0 → 2π lands back on the starting shape
const PHASE_STEPS = 8;
function waveFrames(cfg) {
  const frames = [];
  for (let i = 0; i <= PHASE_STEPS; i++) {
    const phase = (i / PHASE_STEPS) * Math.PI * 2;
    frames.push(closeWave(wavePath(cfg.start, cfg.end, cfg.amp, phase, cfg.freq)));
  }
  return frames;
}

// Different frequencies and periods so the two edges never lock in step
const DARK = { start: 6, end: 84, amp: 4.5, freq: 2.3, dur: "48s" };
const MID = { start: 18, end: 94, amp: 4.0, freq: 1.5, dur: "35s" };

// One flat-filled band per layer. No strokes, no shadows — the
// colour change alone is the boundary.
function waveLayer(cfg, cls, animate) {
  const frames = waveFrames(cfg);
  const anim = animate
    ? `<animate attributeName="d" dur="${cfg.dur}" repeatCount="indefinite"
          calcMode="spline" keySplines="${Array(PHASE_STEPS).fill(".42 0 .58 1").join(";")}"
          values="${frames.join(";")}"/>`
    : "";
  return `    <svg class="wave-layer ${cls}" viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="${frames[0]}">${anim}</path>
    </svg>`;
}

// The two band shapes at rest, in a 100 × 100 box, for the app icon
export const restingWaves = () => ({ mid: waveFrames(MID)[0], dark: waveFrames(DARK)[0] });

function waves({ animateWaves = true } = {}) {
  return [waveLayer(MID, "layer-mid", animateWaves), waveLayer(DARK, "layer-dark", animateWaves)].join("\n");
}

// ── Registry ─────────────────────────────────────────────────
// render() takes the card's options. `poster` is the moment (in seconds)
// shown, frozen, to visitors who prefer reduced motion; the spectrum's
// is just after the trace is drawn.
export const BACKGROUNDS = {
  waves: { label: "Waves", render: waves },
  paul: { label: "Paul trap", render: paul },
  spectrum: { label: "Barium spectrum", render: spectrum, poster: (GO + 0.04) * SCAN },
};
