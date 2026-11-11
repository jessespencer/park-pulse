import { MONTHS_LONG, NATIONAL, fmtInt, fmtPct, loadIndex, loadPark } from '../data';
import { renderHeatmap } from '../heatmap';
import { setState, type AppState } from '../state';
import { errorBox, fill, h, loading, modeToggle, parkOptions, select } from '../ui';

export async function renderPark(root: HTMLElement, s: AppState): Promise<void> {
  fill(root, loading());
  const [idx, park] = await Promise.all([loadIndex(), loadPark(s.park).catch(() => null)]);
  if (!park) {
    fill(root, errorBox(`No visitation data for park code “${s.park}”.`));
    return;
  }
  const isNat = park.code === NATIONAL;
  const legend = h('div', { class: 'legend' });
  const heat = h('div', {});
  const meta = [
    !isNat && park.designation !== 'Unknown' ? park.designation : null,
    park.states?.length ? park.states.join(', ') : null,
    `${park.firstYear}–${park.lastYear}`,
  ].filter(Boolean).join(' · ');

  const facts = h('dl', { class: 'facts' });
  if (park.peakMonth) facts.append(h('div', {}, h('dt', {}, 'Typical peak'), h('dd', {}, MONTHS_LONG[park.peakMonth - 1])));
  if (park.peakiness != null) facts.append(h('div', {}, h('dt', {}, 'Busiest 3 months'), h('dd', {}, `${fmtPct(park.peakiness, 0)} of visits`)));
  if (park.latestAnnual != null) facts.append(h('div', {}, h('dt', {}, `${park.lastYear} visits`), h('dd', {}, fmtInt(park.latestAnnual))));

  const notes = park.notes.filter((n) => n.year >= park.firstYear);
  fill(root, 
    h('section', { class: 'view-head' },
      h('div', {},
        h('h1', {}, park.name),
        h('p', { class: 'muted' }, meta)),
      select('Park', parkOptions(idx), park.code, (v) => setState({ park: v }))),
    facts,
    h('div', { class: 'controls' }, modeToggle(s.mode), legend),
    h('p', { class: 'hint muted' }, 'Rows are years, columns are months. Hover or tap a cell for the exact count. ⚑ marks shutdowns, closures and data notes.'),
    heat,
    h('section', { class: 'notes' },
      h('h2', {}, 'Annotated breaks'),
      h('p', { class: 'muted' }, 'Counts are shown as NPS published them — nothing is smoothed or filled in.'),
      h('ul', {}, ...notes.map((n) => h('li', { class: `note-${n.kind}` },
        h('strong', {}, `${MONTHS_LONG[n.month - 1]} ${n.year}: `), n.text))),
      !isNat && h('p', {},
        'Counting methods vary by park and have changed over time. See this park’s ',
        h('a', { href: `https://irma.nps.gov/Stats/Reports/Park/${park.code}`, target: '_blank', rel: 'noopener' },
          'Visitor Use Counting Procedures on IRMA'),
        ' before reading a sudden jump as a real change.')),
    !isNat && h('p', { class: 'see-also' },
      h('a', { href: `?view=drift&park=${park.code}`, onclick: (e: Event) => { e.preventDefault(); setState({ view: 'drift' }); } }, 'Season drift for this park →'),
      ' ',
      h('a', { href: `?view=compare&a=${park.code}`, onclick: (e: Event) => { e.preventDefault(); setState({ view: 'compare', a: park.code }); } }, 'Compare with another park →')),
  );
  renderHeatmap(heat, park, s.mode, { legendHost: legend });
}
