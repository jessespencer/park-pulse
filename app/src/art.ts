/**
 * Original illustration for Park Pulse — no NPS marks. Colors come from CSS
 * custom properties so every piece themes with day/night.
 */

let uid = 0;
const id = (p: string) => `${p}-${++uid}`;

/** Badge: striped 80s sun behind a ridgeline that doubles as a pulse trace. */
export function emblem(size = 40): string {
  const clip = id('em');
  return `<svg class="emblem" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
  <defs><clipPath id="${clip}"><circle cx="32" cy="32" r="29"/></clipPath></defs>
  <circle cx="32" cy="32" r="31" fill="var(--emblem-ring)"/>
  <g clip-path="url(#${clip})">
    <rect width="64" height="64" fill="var(--emblem-sky)"/>
    <circle cx="32" cy="31" r="13" fill="var(--sun)"/>
    <rect x="16" y="31" width="32" height="1.6" fill="var(--emblem-sky)"/>
    <rect x="16" y="35" width="32" height="2.2" fill="var(--emblem-sky)"/>
    <rect x="16" y="39.6" width="32" height="2.8" fill="var(--emblem-sky)"/>
    <path d="M-2 50 L14 34 L22 41 L33 27 L46 40 L52 35 L66 50 L66 66 L-2 66Z" fill="var(--sage)"/>
    <path d="M-2 56 L10 47 L20 52 L30 45 L44 54 L56 48 L66 54 L66 66 L-2 66Z" fill="var(--pine)"/>
    <polyline points="4,50 19,50 23,43 28,57 33,38 38,50 60,50" fill="none" stroke="var(--cream)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <circle cx="32" cy="32" r="29" fill="none" stroke="var(--cream)" stroke-width="1.5"/>
</svg>`;
}

/** Layered ridgelines with a banded sun — the Trailhead hero backdrop. */
export function heroScene(): string {
  const sky = id('sky');
  const sunClip = id('sun');
  const trees = Array.from({ length: 34 }, (_, i) => {
    const x = 8 + i * 36 + ((i * 53) % 17);
    const h = 26 + ((i * 37) % 22);
    const base = 318 + ((i * 29) % 10);
    return `<path d="M${x} ${base} L${x + h * 0.32} ${base - h} L${x + h * 0.64} ${base}Z"/>`;
  }).join('');
  return `<svg class="hero-scene" viewBox="0 0 1200 360" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
  <defs><linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="var(--sky-top)"/><stop offset="1" stop-color="var(--sky-bottom)"/>
  </linearGradient><clipPath id="${sunClip}"><circle cx="975" cy="150" r="112"/></clipPath></defs>
  <rect width="1200" height="360" fill="url(#${sky})"/>
  <g class="hero-sun" clip-path="url(#${sunClip})">
    <circle cx="975" cy="150" r="112" fill="var(--sun)"/>
    <path d="M863 150 A112 112 0 0 0 1087 150 Z" fill="var(--ember)" opacity="0.5"/>
    <rect x="845" y="160" width="270" height="5" fill="var(--sky-bottom)"/>
    <rect x="845" y="178" width="270" height="8" fill="var(--sky-bottom)"/>
    <rect x="845" y="199" width="270" height="11" fill="var(--sky-bottom)"/>
    <rect x="845" y="223" width="270" height="15" fill="var(--sky-bottom)"/>
  </g>
  <path fill="var(--ridge-far)" d="M0 238 L70 214 L140 226 L230 176 L300 204 L380 160 L450 198 L520 182 L600 214 L690 170 L760 196 L850 150 L930 196 L1010 176 L1090 206 L1200 184 L1200 360 L0 360Z"/>
  <path fill="var(--ridge-mid)" d="M0 268 L90 236 L170 256 L260 214 L330 244 L420 222 L500 252 L590 228 L680 262 L760 232 L850 258 L940 220 L1030 252 L1110 236 L1200 254 L1200 360 L0 360Z"/>
  <path fill="var(--ridge-near)" d="M0 300 L120 276 L230 292 L340 268 L470 296 L590 278 L700 300 L820 280 L940 298 L1060 282 L1200 296 L1200 360 L0 360Z"/>
  <g fill="var(--ridge-trees)">${trees}</g>
  <rect y="322" width="1200" height="38" fill="var(--ridge-trees)"/>
</svg>`;
}

/** Thin 80s triple stripe (mustard / ember / rust). */
export const stripes = (): string =>
  '<div class="stripes" aria-hidden="true"><span></span><span></span><span></span></div>';
