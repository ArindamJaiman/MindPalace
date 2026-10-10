import type { Priority } from '../store/types';
import { DAY, formatDue, startOfDay } from './dates';

export interface Chip {
  kind: 'date' | 'tag' | 'priority' | 'link';
  label: string;
}

export interface ParsedTask {
  title: string;
  tags: string[];
  priority: Priority;
  due?: number;
  dueHasTime: boolean;
  chips: Chip[];
}

export const PRIORITY_LABEL = ['None', 'Low', 'Medium', 'High'] as const;

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tues: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?';

/**
 * Natural-language quick add, e.g. "Call mom tomorrow 5pm #family !!".
 * Recognised tokens are removed from the title and returned as structured fields.
 */
export function parseTask(input: string, now = new Date()): ParsedTask {
  let s = ` ${input} `;
  const tags: string[] = [];
  let priority: Priority = 0;
  let date: Date | null = null;
  let time: { h: number; m: number } | null = null;
  let relative: { ms: number; hasTime: boolean } | null = null;

  /** Replace a match with a space; `fn` may return false to leave that match in the title. */
  const take = (re: RegExp, fn: (m: string[]) => unknown) => {
    s = s.replace(re, (...args) => (fn(args as string[]) === false ? (args[0] as string) : ' '));
  };
  const today = () => new Date(startOfDay(now));

  take(/\s#([\p{L}_][\p{L}\p{N}_/-]*)/gu, (m) => {
    if (!tags.includes(m[1].toLowerCase())) tags.push(m[1].toLowerCase());
  });
  take(/\s(!{1,3})(?=\s)/, (m) => (priority = m[1].length as Priority));

  take(/\sin\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w)(?=\s)/i, (m) => {
    const n = Number(m[1]);
    const u = m[2].toLowerCase()[0];
    const unit = u === 'm' ? 60_000 : u === 'h' ? 3_600_000 : u === 'd' ? DAY : 7 * DAY;
    relative = { ms: n * unit, hasTime: u === 'm' || u === 'h' };
  });

  take(/\s(today|tod)(?=\s)/i, () => (date = today()));
  take(/\s(tonight)(?=\s)/i, () => {
    date = today();
    time ??= { h: 20, m: 0 };
  });
  take(/\s(tomorrow|tmrw|tmr)(?=\s)/i, () => (date = new Date(startOfDay(now) + DAY)));
  take(/\snext\s+week(?=\s)/i, () => (date = new Date(startOfDay(now) + 7 * DAY)));

  take(
    /\s(?:(next|this|on)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|wed|thurs|thur|thu|fri|sat|sun)(?=\s)/i,
    (m) => {
      const word = m[2].toLowerCase();
      // Abbreviations like "sun" or "sat" are common words, so require a prefix for them.
      if (!m[1] && word.length <= 4) return false;
      let delta = (WEEKDAYS[word] - now.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      date = new Date(startOfDay(now) + delta * DAY);
    },
  );

  const setMonthDay = (monthStr: string, dayStr: string) => {
    const mi = MONTHS.indexOf(monthStr.toLowerCase().slice(0, 3));
    const d = new Date(now.getFullYear(), mi, Number(dayStr));
    if (d.getTime() < startOfDay(now)) d.setFullYear(d.getFullYear() + 1);
    date = d;
  };
  take(new RegExp(`\\s(?:on\\s+)?${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?=\\s)`, 'i'), (m) => setMonthDay(m[1], m[2]));
  take(new RegExp(`\\s(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}(?=\\s)`, 'i'), (m) => setMonthDay(m[2], m[1]));

  take(/\s(?:at\s+|@)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s)/i, (m) => {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === 'pm') h += 12;
    time = { h, m: Number(m[2] ?? 0) };
  });
  take(/\s(?:at\s+|@)(\d{1,2})(?::(\d{2}))?(?=\s)/i, (m) => (time = { h: Number(m[1]), m: Number(m[2] ?? 0) }));
  take(/\s(?:at\s+)?(\d{1,2}):(\d{2})(?=\s)/, (m) => (time = { h: Number(m[1]), m: Number(m[2]) }));
  take(/\s(?:at\s+)?(noon|midday)(?=\s)/i, () => (time = { h: 12, m: 0 }));

  let due: number | undefined;
  let dueHasTime = false;
  const rel = relative as { ms: number; hasTime: boolean } | null;
  const t = time as { h: number; m: number } | null;
  const d = date as Date | null;
  if (rel) {
    due = rel.hasTime ? now.getTime() + rel.ms : startOfDay(now.getTime() + rel.ms);
    dueHasTime = rel.hasTime;
  } else if (d || t) {
    const base = new Date(d ?? today());
    if (t && t.h < 24 && t.m < 60) {
      base.setHours(t.h, t.m, 0, 0);
      dueHasTime = true;
      if (!d && base.getTime() < now.getTime()) base.setTime(base.getTime() + DAY);
    }
    due = base.getTime();
  }

  const title = s.replace(/\s+/g, ' ').trim() || input.trim();

  const chips: Chip[] = [];
  if (due !== undefined) chips.push({ kind: 'date', label: formatDue(due, dueHasTime) });
  if (priority) chips.push({ kind: 'priority', label: `${'!'.repeat(priority)} ${PRIORITY_LABEL[priority]}` });
  for (const tag of tags) chips.push({ kind: 'tag', label: `#${tag}` });
  for (const m of title.matchAll(/\[\[([^\]|]+)/g)) chips.push({ kind: 'link', label: m[1] });

  return { title, tags, priority, due, dueHasTime, chips };
}
