import * as d3 from 'd3';
import { contourRule, topo } from '../art';
import { MONTHS, MONTHS_LONG, NATIONAL, fmtInt, fmtPct, loadIndex, loadPark, stateLine, type ParkDetail } from '../data';
import { renderHeatmap } from '../heatmap';
import { busyMonths, monthSpan, quietMonths } from '../insights';
import { setState, type AppState } from '../state';
import { hideTooltip, showTooltip } from '../tooltip';
import { errorBox, fill, h, loading, modeToggle, parkOptions, select } from '../ui';

const KIND_LABEL = { shutdown: 'Shutdown', covid: 'COVID-19', data: 'Data note' } as const;

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

  // Entrance sign
  const seed = [...park.code].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const eyebrow = [
    !isNat && !['Unknown', 'Other', 'Not in NPS API'].includes(park.designation) ? park.designation : null,
    stateLine(park.states),
  ].filter(Boolean).join(' · ');
  const sign = h('section', { class: 'park-sign' },
    topo({ seed, step: 0.085, index: 4 }),
    h('div', { class: 'sign-text' },
      h('p', { class: 'eyebrow' }, eyebrow || 'National Park System'),
      h('h1', {}, isNat ? 'All park units' : park.shortName && park.shortName !== park.name ? park.shortName : park.name),
      isNat || park.shortName === park.name ? null : h('p', { class: 'sign-sub' }, park.name)),
    h('div', { class: 'sign-stat' },
      h('p', { class: 'eyebrow' }, park.latestAnnual != null ? `${park.lastYear} visits` : `Counted since ${park.firstYear}`),
      h('b', {}, park.latestAnnual != null ? fmtInt(park.latestAnnual) : String(park.firstYear))));

  // Trail notes: the answer before the detail.
  const notes = h('dl', { class: 'trail-notes' });
  const note = (label: string, value: string, hint?: string) =>
    notes.append(h('div', { class: 'note-card' }, h('dt', {}, label), h('dd', {}, value), hint ? h('p', { class: 'muted small' }, hint) : null));
  if (park.profile) {
    const quiet = quietMonths(park).slice(0, 2).sort((a, b) => a - b);
    note('Peak month', MONTHS_LONG[park.peakMonth! - 1], `${fmtPct(park.profile[park.peakMonth! - 1], 0)} of a typical year`);
    note('Best bet for quiet', quiet.map((m) => MONTHS[m]).join(' & ') || '—', 'Quietest months that aren’t off-season');
    note('Busy season', monthSpan(busyMonths(park)), 'Months above an even 1/12 share');
  }
  if (park.peakiness != null) note('Busiest 3 months', fmtPct(park.peakiness, 0), 'of all visits in a typical year');

  const ribbon = h('div', { class: 'ribbon-wrap' });
  const breaks = park.notes.filter((n) => n.year >= park.firstYear);

  fill(root,
    sign,
    h('div', { class: 'park-tools' },
      select('Change park', parkOptions(idx), park.code, (v) => setState({ park: v })),
      !isNat && h('a', { class: 'chip-link', href: `?view=drift&park=${park.code}`, onclick: (e: Event) => { e.preventDefault(); setState({ view: 'drift' }); } }, 'Season drift →'),
      !isNat && h('a', { class: 'chip-link', href: `?view=compare&a=${park.code}`, onclick: (e: Event) => { e.preventDefault(); setState({ view: 'compare', a: park.code }); } }, 'Compare →')),
    notes.childElementCount ? contourRule() : null,
    notes.childElementCount ? notes : null,
    park.profile && h('section', { class: 'section tight' },
      h('h2', { class: 'section-title' }, 'A typical year'),
      h('p', { class: 'muted small' }, `Average share of the year’s visits by month, ${park.profileYears[0]}–${park.profileYears.at(-1)} (2020 excluded). Dashed line = an even month.`),
      ribbon),
    h('section', { class: 'section tight' },
      h('h2', { class: 'section-title' }, `Every month since ${park.firstYear}`),
      h('div', { class: 'controls' }, modeToggle(s.mode), legend),
      h('p', { class: 'hint muted' }, 'Rows are years, columns are months. Hover or tap a cell for the exact count. ⚑ marks shutdowns, closures and data notes.'),
      heat),
    h('section', { class: 'section ranger-notes panel' },
      h('h2', { class: 'section-title' }, 'Ranger notes'),
      h('p', { class: 'muted small' }, 'Breaks in the record are flagged, never smoothed. Counts are exactly as NPS published them.'),
      h('ul', {}, ...breaks.map((n) => h('li', { class: `note-${n.kind}` },
        h('span', { class: `tag tag-${n.kind}` }, KIND_LABEL[n.kind]),
        h('strong', {}, ` ${MONTHS_LONG[n.month - 1]} ${n.year}. `), n.text))),
      !isNat && h('p', { class: 'small' },
        'Counting methods vary by park and have changed over time. Check this park’s ',
        h('a', { href: `https://irma.nps.gov/Stats/Reports/Park/${park.code}`, target: '_blank', rel: 'noopener' },
          'Visitor Use Counting Procedures on IRMA'),
        ' before reading a sudden jump as a real change.')),
  );
  if (park.profile) drawRibbon(ribbon, park);
  renderHeatmap(heat, park, s.mode, { legendHost: legend });
}

/** 12-bar typical-year chart with peak + quietest direct labels. */
function drawRibbon(host: HTMLElement, park: ParkDetail): void {
  const p = park.profile!;
  const W = Math.max(host.clientWidth, 280), H = 150, m = { t: 18, r: 4, b: 22, l: 4 };
  const x = d3.scaleBand<number>().domain(d3.range(12)).range([m.l, W - m.r]).paddingInner(0.18);
  const y = d3.scaleLinear().domain([0, Math.max(d3.max(p)!, 1 / 12) * 1.08]).range([H - m.b, m.t]);
  const peak = park.peakMonth! - 1;
  const quiet = quietMonths(park)[0];
  const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%')
    .attr('role', 'img').attr('aria-label', `Typical year: peak in ${MONTHS_LONG[peak]}`);
  svg.append('g').selectAll('rect').data(p).join('rect')
    .attr('class', (_, i) => (i === peak ? 'rib-bar peak' : i === quiet ? 'rib-bar quiet' : 'rib-bar'))
    .attr('x', (_, i) => x(i)!).attr('width', x.bandwidth())
    .attr('y', (v) => y(v)).attr('height', (v) => Math.max(y(0) - y(v), 1)).attr('rx', 4)
    .on('pointerenter pointermove', (ev: PointerEvent, v) => {
      const i = p.indexOf(v);
      showTooltip(`<strong>${MONTHS_LONG[i]}</strong><br>${fmtPct(v)} of a typical year`, ev.clientX, ev.clientY);
    })
    .on('pointerleave', hideTooltip);
  svg.append('line').attr('class', 'even-line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(1 / 12)).attr('y2', y(1 / 12));
  svg.append('g').selectAll('text').data(d3.range(12)).join('text')
    .attr('class', 'rib-month').attr('x', (i) => x(i)! + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle')
    .text((i) => (W < 420 ? MONTHS[i][0] : MONTHS[i]));
  const label = (i: number, text: string) => svg.append('text').attr('class', 'rib-label')
    .attr('x', x(i)! + x.bandwidth() / 2).attr('y', y(p[i]) - 5).attr('text-anchor', 'middle').text(text);
  label(peak, fmtPct(p[peak], 0));
  if (quiet != null && quiet !== peak) label(quiet, fmtPct(p[quiet], 0));
}
