/**
 * Original illustration for Park Pulse — no NPS marks. Colors come from CSS
 * custom properties (or currentColor) so every piece themes with day/night.
 */
import * as d3 from 'd3';

/** Mark: a ring around a ridgeline that doubles as a pulse trace. Inherits currentColor. */
export function emblem(size = 28): string {
  return `<svg class="emblem" width="${size}" height="${size}" viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
  <circle cx="15" cy="15" r="13.5"/><path d="M4.5 19.5 L10 12.5 L13 16 L16.5 9 L21 15.5 L23 13.5 L25.5 19.5"/>
</svg>`;
}

/* ---------- Topographic contours ----------
 * Printed-map style: dense, wandering lines with small closed loops, one even
 * weight, some dashed. Terrain is domain-warped fractal Perlin noise, so the
 * shapes meander like real relief instead of forming concentric rings.
 */

export interface TopoOpts {
  /** Same seed → same terrain on every render. */
  seed: number;
  /** Typical landform size in px; larger = broader, calmer shapes. */
  scale?: number;
  /** How many contour levels to trace across the height range. */
  levels?: number;
  /** Every Nth level is drawn dashed (0 = none). */
  dash?: number;
  /** Map-sheet grid cell size in px, drawn over the contours (0 = none). */
  grid?: number;
}

/** Placeholder layer; `paintTopo` fills it once it has a size in the DOM. */
export function topo({ seed, scale = 260, levels = 20, dash = 4, grid = 0 }: TopoOpts): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'topo');
  svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.dataset, { seed: String(seed), scale: String(scale), levels: String(levels), dash: String(dash), grid: String(grid) });
  return svg;
}

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded 2D Perlin noise, roughly in [-1, 1]. */
function perlin(rand: () => number): (x: number, y: number) => number {
  const perm = d3.range(256);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h: number, x: number, y: number) => {
    switch (h & 7) {
      case 0: return x + y; case 1: return x - y; case 2: return -x + y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  };
  return (x, y) => {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = p[p[xi] + yi], ab = p[p[xi] + yi + 1], ba = p[p[xi + 1] + yi], bb = p[p[xi + 1] + yi + 1];
    const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
    const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
    return x1 + v * (x2 - x1);
  };
}

/** Square grid centered on the layer, so edge cells are equal on both sides. */
function gridPath(W: number, H: number, g: number): string {
  if (g <= 0) return '';
  const x0 = ((W / 2) % g), y0 = ((H / 2) % g);
  const inside = (lim: number) => (t: number) => t > 12 && t < lim - 12; // no lines hugging an edge
  const xs = d3.range(x0, W, g).filter(inside(W)).map((x) => `M${x.toFixed(1)} 0V${H.toFixed(1)}`);
  const ys = d3.range(y0, H, g).filter(inside(H)).map((y) => `M0 ${y.toFixed(1)}H${W.toFixed(1)}`);
  return `<path class="grid" d="${xs.join('')}${ys.join('')}"/>`;
}

function draw(svg: SVGSVGElement): void {
  const box = svg.getBoundingClientRect();
  if (!box.width || !box.height) return;
  // Sample past the edges so lines run off-canvas instead of hugging the border.
  const W = box.width, H = box.height, cell = 4, pad = 6;
  const gw = Math.ceil(W / cell) + 1 + pad * 2, gh = Math.ceil(H / cell) + 1 + pad * 2;
  const noise = perlin(rng(Number(svg.dataset.seed) || 1));
  const fbm = (x: number, y: number) => {
    let z = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 3; o++) { z += amp * noise(x * f, y * f); amp *= 0.4; f *= 2.03; }
    return z;
  };
  const k = cell / (Number(svg.dataset.scale) || 260); // grid cell → noise units
  const v = new Float64Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = i * k, y = j * k;
      // Domain warp: bend the coordinates by another noise field for meandering ridges.
      const qx = fbm(x + 3.1, y + 7.7), qy = fbm(x + 8.3, y + 2.8);
      v[j * gw + i] = fbm(x + 1.1 * qx, y + 1.1 * qy);
    }
  }
  const n = Number(svg.dataset.levels) || 20;
  const dash = Number(svg.dataset.dash) || 0;
  const [lo, hi] = d3.extent(v) as [number, number];
  const thresholds = d3.range(n).map((i) => lo + ((hi - lo) * (i + 0.5)) / n);
  const levels = d3.contours().size([gw, gh]).thresholds(thresholds)(Array.from(v));
  // Smooth each ring into a closed B-spline (no grid stair-steps); keep small loops.
  const curve = d3.line<[number, number]>().curve(d3.curveBasisClosed);
  const toPath = (mp: d3.ContourMultiPolygon) => mp.coordinates
    .flatMap((poly) => poly)
    .filter((ring) => ring.length >= 14)
    .map((ring) => curve((ring.length > 24 ? ring.filter((_, i) => i % 2 === 0) : ring)
      .map(([x, y]) => [(x - pad) * cell, (y - pad) * cell])))
    .join('');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.innerHTML = levels
    .map((c, i) => [toPath(c), dash > 0 && i % dash === dash - 1] as const)
    .filter(([d]) => d)
    .map(([d, dashed]) => `<path${dashed ? ' class="dash"' : ''} d="${d}"/>`)
    .join('') + gridPath(W, H, Number(svg.dataset.grid) || 0);
  svg.dataset.w = String(Math.round(W));
}

/** Draw every topo layer under `root` that is new or has changed width. */
export function paintTopo(root: ParentNode = document): void {
  root.querySelectorAll<SVGSVGElement>('svg.topo').forEach((svg) => {
    const w = Math.round(svg.getBoundingClientRect().width);
    if (svg.dataset.w !== String(w)) draw(svg);
  });
}

/** Two wavy lines used as a section break. */
export function contourRule(): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg class="contour-rule" viewBox="0 0 1200 16" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 7 C 120 1, 240 13, 360 7 S 600 1, 720 7 S 960 13, 1080 7 S 1200 3, 1200 7"/>
  <path d="M0 12 C 140 7, 260 16, 380 12 S 620 6, 740 12 S 980 16, 1100 12 S 1200 9, 1200 11"/></svg>`;
  return tpl.content.firstElementChild as SVGSVGElement;
}
