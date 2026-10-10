export const DAY = 86_400_000;

export function startOfDay(t: number | Date = Date.now()): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(t: number | Date = Date.now()): number {
  const d = new Date(t);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Local-time YYYY-MM-DD key. */
export function dayKey(t: number): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Whole calendar days between the day of `t` and today (0 = today, 1 = yesterday). */
export function daysAgo(t: number): number {
  return Math.round((startOfDay() - startOfDay(t)) / DAY);
}

export function formatTime(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDue(t: number, withTime = true): string {
  const diff = Math.round((startOfDay(t) - startOfDay()) / DAY);
  let label: string;
  if (diff === 0) label = 'Today';
  else if (diff === 1) label = 'Tomorrow';
  else if (diff === -1) label = 'Yesterday';
  else if (diff > 1 && diff < 7) label = new Date(t).toLocaleDateString([], { weekday: 'short' });
  else label = new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
  return withTime ? `${label} · ${formatTime(t)}` : label;
}

export function relativeTime(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

/** Value for an <input type="datetime-local">. */
export function toLocalInput(t?: number): string {
  if (!t) return '';
  const d = new Date(t);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(t - off).toISOString().slice(0, 16);
}

export function fromLocalInput(v: string): number | undefined {
  if (!v) return undefined;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? undefined : t;
}
