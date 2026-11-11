const el = () => document.getElementById('tooltip') as HTMLDivElement;

/** Show the shared tooltip near a pointer position (clamped to the viewport). */
export function showTooltip(html: string, x: number, y: number): void {
  const t = el();
  t.innerHTML = html;
  t.hidden = false;
  const pad = 12;
  const { width, height } = t.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  if (left + width > innerWidth - 8) left = Math.max(8, x - width - pad);
  if (top + height > innerHeight - 8) top = Math.max(8, y - height - pad);
  t.style.left = `${left}px`;
  t.style.top = `${top}px`;
}

export function hideTooltip(): void {
  el().hidden = true;
}

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
