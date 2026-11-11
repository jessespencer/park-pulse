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

/* ---------- Topographic contours ---------- */

export interface TopoOpts {
  /** Same seed → same terrain on every render. */
  seed: number;
  /** Contour interval in height units; larger = sparser lines. */
  step?: number;
  /** Every Nth line is a heavier "index" contour (0 = none). */
  index?: number;
}

/** Placeholder layer; `paintTopo` fills it once it has a size in the DOM. */
export function topo({ seed, step = 0.06, index = 5 }: TopoOpts): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'topo');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.seed = String(seed);
  svg.dataset.step = String(step);
  svg.dataset.index = String(index);
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

/** Seeded height field (gaussian peaks + a gentle swell) traced with d3-contour. */
function draw(svg: SVGSVGElement): void {
  const box = svg.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const W = box.width, H = box.height, cell = 5;
  const gw = Math.ceil(W / cell) + 1, gh = Math.ceil(H / cell) + 1;
  const rand = rng(Number(svg.dataset.seed) || 1);
  const span = Math.max(gw, gh);
  const peaks = d3.range(9).map(() => ({ x: rand() * gw, y: rand() * gh, a: 0.5 + rand(), s: (0.12 + rand() * 0.22) * span }));
  const ph = rand() * 6;
  const v = new Float64Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      let z = 0.18 * Math.sin(i / 23 + ph) * Math.cos(j / 31 - ph);
      for (const p of peaks) {
        const dx = i - p.x, dy = j - p.y;
        z += p.a * Math.exp(-(dx * dx + dy * dy) / (2 * p.s * p.s));
      }
      v[j * gw + i] = z;
    }
  }
  const step = Number(svg.dataset.step) || 0.06;
  const idx = Number(svg.dataset.index) || 0;
  const [lo, hi] = d3.extent(v) as [number, number];
  const path = d3.geoPath(d3.geoIdentity().scale(cell));
  const lines = d3.contours().size([gw, gh]).thresholds(d3.range(Math.ceil(lo / step) * step, hi, step))(Array.from(v));
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.innerHTML = lines.map((c, k) => `<path${idx && k % idx === 0 ? ' class="idx"' : ''} d="${path(c)}"/>`).join('');
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
