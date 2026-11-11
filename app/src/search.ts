import type { IndexFile, ParkSummary } from './data';
import { getState, setState } from './state';

export const parkLabel = (idx: IndexFile, p: ParkSummary): string => (idx.hasMetadata ? `${p.name} (${p.code})` : p.code);

/** Resolve free text to a park code: exact label, code, name prefix, then substring. */
export function findPark(idx: IndexFile, query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const parks = idx.parks;
  return (
    parks.find((p) => parkLabel(idx, p).toLowerCase() === q)?.code
    ?? parks.find((p) => p.code.toLowerCase() === q)?.code
    ?? parks.find((p) => p.name.toLowerCase().startsWith(q))?.code
    ?? parks.find((p) => p.shortName.toLowerCase().startsWith(q))?.code
    ?? parks.find((p) => p.name.toLowerCase().includes(q))?.code
    ?? null
  );
}

/** Wire an <input list=…> to park search. Picking from the datalist navigates immediately. */
export function bindSearch(input: HTMLInputElement, idx: IndexFile): void {
  const labels = new Set(idx.parks.map((p) => parkLabel(idx, p).toLowerCase()));
  const go = () => {
    const code = findPark(idx, input.value);
    if (code) {
      setState({ view: getState().view === 'drift' ? 'drift' : 'park', park: code });
      input.value = '';
      input.blur();
    } else {
      input.setCustomValidity('No park matches that name or code');
      input.reportValidity();
    }
  };
  input.addEventListener('input', () => {
    input.setCustomValidity('');
    if (labels.has(input.value.trim().toLowerCase())) go();
  });
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
}
