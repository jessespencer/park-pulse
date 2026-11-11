import './style.css';
import { loadIndex } from './data';
import { getState, setState, subscribe, type AppState, type View } from './state';
import { hideTooltip } from './tooltip';
import { errorBox, h } from './ui';
import { renderCompare } from './views/compare';
import { renderDrift } from './views/drift';
import { renderPark } from './views/park';
import { renderWall } from './views/wall';
import { renderWhen } from './views/when';

const VIEWS: { id: View; label: string; render: (root: HTMLElement, s: AppState) => Promise<void> }[] = [
  { id: 'park', label: 'Park heatmap', render: renderPark },
  { id: 'wall', label: 'Fingerprints', render: renderWall },
  { id: 'when', label: 'When to go', render: renderWhen },
  { id: 'drift', label: 'Season drift', render: renderDrift },
  { id: 'compare', label: 'Compare', render: renderCompare },
];

const app = document.getElementById('app')!;
const nav = document.getElementById('nav')!;
let renderSeq = 0;

function renderNav(s: AppState): void {
  nav.replaceChildren(...VIEWS.map((v) => h('a', {
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
  document.title = `${view.label} · Park Pulse`;
  // Render into a detached node so a slow, superseded render can't clobber a newer one.
  const stage = h('div', {});
  app.replaceChildren(stage);
  try {
    await view.render(stage, s);
  } catch (err) {
    if (seq === renderSeq) stage.replaceChildren(errorBox(String(err instanceof Error ? err.message : err)));
  }
}

/* Theme: auto (OS) → light → dark. A per-viewer convenience, so localStorage is fine. */
type Theme = 'auto' | 'light' | 'dark';
const themeBtn = document.getElementById('theme') as HTMLButtonElement;
function applyTheme(t: Theme): void {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === 'auto' ? '◐ Auto' : t === 'light' ? '☀ Light' : '☾ Dark';
  themeBtn.setAttribute('aria-label', `Theme: ${t}. Click to change.`);
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

/* Re-render on width changes (heatmap columns are sized to the container). */
let lastW = innerWidth;
let resizeTimer = 0;
addEventListener('resize', () => {
  if (Math.abs(innerWidth - lastW) < 40) return;
  lastW = innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => void render(getState()), 150);
});

async function boot(): Promise<void> {
  const idx = await loadIndex();
  const list = document.getElementById('park-list')!;
  const byLabel = new Map<string, string>();
  for (const p of [...idx.parks].sort((a, b) => a.name.localeCompare(b.name))) {
    const label = idx.hasMetadata ? `${p.name} (${p.code})` : p.code;
    byLabel.set(label.toLowerCase(), p.code);
    list.append(h('option', { value: label }));
  }
  const search = document.getElementById('search') as HTMLInputElement;
  const go = () => {
    const q = search.value.trim().toLowerCase();
    if (!q) return;
    const exact = byLabel.get(q);
    const code = exact
      ?? idx.parks.find((p) => p.code.toLowerCase() === q)?.code
      ?? idx.parks.find((p) => p.name.toLowerCase().startsWith(q))?.code
      ?? idx.parks.find((p) => p.name.toLowerCase().includes(q))?.code;
    if (code) {
      setState({ view: getState().view === 'drift' ? 'drift' : 'park', park: code });
      search.value = '';
      search.blur();
    } else {
      search.setCustomValidity('No park matches');
      search.reportValidity();
    }
  };
  search.addEventListener('input', () => {
    search.setCustomValidity('');
    if (byLabel.has(search.value.trim().toLowerCase())) go(); // picked from the datalist
  });
  search.addEventListener('keydown', (e) => e.key === 'Enter' && go());

  if (!idx.hasMetadata) {
    const b = document.getElementById('banner')!;
    b.hidden = false;
    b.textContent = 'Park names, designations and locations are not loaded: the build ran without NPS API metadata (NPS_API_KEY unset). Parks show by code.';
  }
  document.getElementById('footer')!.replaceChildren(
    h('p', {},
      'Data: ', h('a', { href: 'https://irma.nps.gov/DataStore/Reference/Profile/2317666', target: '_blank', rel: 'noopener' }, 'NPS Visitor Use Statistics Data Package'),
      ` (CC0), recreation visits 1979–${Math.max(...idx.parks.map((p) => p.lastYear))}, published ${idx.asOf ?? 'n/a'}. `,
      'Counts as published by NPS; counting methods vary by park. Not affiliated with the National Park Service.'),
  );
  subscribe((s) => void render(s));
  await render(getState());
}

boot().catch((err) => app.replaceChildren(errorBox(`Could not start: ${err instanceof Error ? err.message : err}`)));
