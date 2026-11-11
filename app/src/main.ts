import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/public-sans';
import './style.css';
import { emblem, stripes } from './art';
import { loadIndex } from './data';
import { bindSearch, parkLabel } from './search';
import { getState, setState, subscribe, type AppState, type View } from './state';
import { hideTooltip } from './tooltip';
import { errorBox, h } from './ui';
import { renderCompare } from './views/compare';
import { renderDrift } from './views/drift';
import { renderHome } from './views/home';
import { renderPark } from './views/park';
import { renderWall } from './views/wall';
import { renderWhen } from './views/when';

const VIEWS: { id: View; label: string; nav: boolean; render: (root: HTMLElement, s: AppState) => Promise<void> }[] = [
  { id: 'home', label: 'Trailhead', nav: false, render: (root) => renderHome(root) },
  { id: 'when', label: 'When to go', nav: true, render: renderWhen },
  { id: 'park', label: 'Park heatmap', nav: true, render: renderPark },
  { id: 'wall', label: 'Fingerprints', nav: true, render: renderWall },
  { id: 'drift', label: 'Season drift', nav: true, render: renderDrift },
  { id: 'compare', label: 'Compare', nav: true, render: renderCompare },
];

const app = document.getElementById('app')!;
const nav = document.getElementById('nav')!;
let renderSeq = 0;

function renderNav(s: AppState): void {
  nav.replaceChildren(...VIEWS.filter((v) => v.nav).map((v) => h('a', {
    href: `?view=${v.id}`,
    'aria-current': v.id === s.view ? 'page' : undefined,
    onclick: (e: Event) => { e.preventDefault(); setState({ view: v.id }); },
  }, v.label)));
}

async function render(s: AppState): Promise<void> {
  const seq = ++renderSeq;
  hideTooltip();
  renderNav(s);
  const view = VIEWS.find((v) => v.id === s.view)!;
  document.title = s.view === 'home' ? 'Park Pulse — beat the crowds' : `${view.label} · Park Pulse`;
  document.body.dataset.view = s.view;
  // Render into a fresh node so a slow, superseded render can't clobber a newer one.
  const stage = h('div', { class: s.view === 'home' ? 'stage stage-full' : 'stage' });
  app.replaceChildren(stage);
  try {
    await view.render(stage, s);
  } catch (err) {
    if (seq === renderSeq) stage.replaceChildren(errorBox(String(err instanceof Error ? err.message : err)));
  }
}

/* Theme: Auto (OS) → Day → Night. A per-viewer convenience, so localStorage is fine. */
type Theme = 'auto' | 'light' | 'dark';
const themeBtn = document.getElementById('theme') as HTMLButtonElement;
function applyTheme(t: Theme): void {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === 'auto' ? '◐ Auto' : t === 'light' ? '☀ Day' : '☾ Night';
  themeBtn.setAttribute('aria-label', `Theme: ${t === 'light' ? 'day' : t === 'dark' ? 'night' : 'auto'}. Click to change.`);
}
let theme: Theme = 'auto';
try { theme = (localStorage.getItem('pp-theme') as Theme) || 'auto'; } catch { /* storage blocked */ }
applyTheme(theme);
themeBtn.addEventListener('click', () => {
  theme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
  try { localStorage.setItem('pp-theme', theme); } catch { /* ignore */ }
  applyTheme(theme);
  void render(getState()); // color scales are theme-aware
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => theme === 'auto' && void render(getState()));

/* Sticky sub-headers sit just under the (variable-height) site header. */
function syncHeaderHeight(): void {
  const hdr = document.querySelector<HTMLElement>('.site-header')!;
  const sticky = getComputedStyle(hdr).position === 'sticky';
  document.documentElement.style.setProperty('--header-h', `${sticky ? hdr.offsetHeight : 0}px`);
}
addEventListener('resize', syncHeaderHeight);

/* Re-render on width changes (charts are sized to their container). */
let lastW = innerWidth;
let resizeTimer = 0;
addEventListener('resize', () => {
  if (Math.abs(innerWidth - lastW) < 40) return;
  lastW = innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => void render(getState()), 150);
});

async function boot(): Promise<void> {
  document.getElementById('brand-mark')!.innerHTML = emblem(38);
  document.getElementById('stripes')!.innerHTML = stripes();
  syncHeaderHeight();
  document.fonts?.ready.then(syncHeaderHeight);
  document.getElementById('brand')!.addEventListener('click', (e) => { e.preventDefault(); setState({ view: 'home' }); });

  const idx = await loadIndex();
  const list = document.getElementById('park-list')!;
  for (const p of [...idx.parks].sort((a, b) => a.name.localeCompare(b.name))) list.append(h('option', { value: parkLabel(idx, p) }));
  bindSearch(document.getElementById('search') as HTMLInputElement, idx);

  if (!idx.hasMetadata) {
    const b = document.getElementById('banner')!;
    b.hidden = false;
    b.textContent = 'Park names, designations and locations are not loaded: the build ran without NPS API metadata (NPS_API_KEY unset). Parks show by code.';
  }
  const lastYear = Math.max(...idx.parks.map((p) => p.lastYear));
  const footer = document.getElementById('footer')!;
  footer.replaceChildren(h('div', { class: 'footer-inner' },
    h('div', { class: 'footer-brand' }, h('span', { class: 'brand-name' }, 'Park Pulse'),
      h('p', {}, 'Leave no trace. Go when it’s quiet.')),
    h('p', { class: 'footer-meta' },
      'Data: ', h('a', { href: 'https://irma.nps.gov/DataStore/Reference/Profile/2317666', target: '_blank', rel: 'noopener' }, 'NPS Visitor Use Statistics'),
      ` (CC0) · recreation visits 1979–${lastYear} · published ${idx.asOf ?? 'n/a'}. `,
      'Counts as published by NPS; counting methods vary by park. An independent project — not affiliated with or endorsed by the National Park Service.')));
  const mark = h('span', { class: 'footer-mark' });
  mark.innerHTML = emblem(44);
  footer.querySelector('.footer-brand')!.prepend(mark);

  // Scroll to top only when moving to a new page (view or park), not on filter tweaks.
  let prev = getState();
  subscribe((s) => {
    void render(s);
    if (s.view !== prev.view || s.park !== prev.park) scrollTo({ top: 0 });
    prev = s;
  });
  await render(getState());
}

boot().catch((err) => app.replaceChildren(errorBox(`Could not start: ${err instanceof Error ? err.message : err}`)));
