import type { Completion, Priority } from '../store/types';
import { DAY, dayKey, startOfDay } from './dates';

const TITLES = [
  'Spark',
  'Wanderer',
  'Doodler',
  'Thinker',
  'Builder',
  'Tinkerer',
  'Architect',
  'Curator',
  'Strategist',
  'Sage',
  'Oracle',
  'Archmage of the Palace',
];

/** Total XP required to reach `level` (level 1 needs 0). */
export function xpForLevel(level: number): number {
  return 25 * level * (level - 1);
}

export interface LevelInfo {
  level: number;
  title: string;
  into: number;
  needed: number;
  progress: number;
}

export function levelInfo(xp: number): LevelInfo {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const base = xpForLevel(level);
  const needed = xpForLevel(level + 1) - base;
  const into = xp - base;
  return {
    level,
    title: TITLES[Math.min(level - 1, TITLES.length - 1)],
    into,
    needed,
    progress: needed ? into / needed : 0,
  };
}

export function xpForTask(priority: Priority, combo: number): number {
  const base = 10 + priority * 5;
  const mult = 1 + Math.min(combo - 1, 4) * 0.25;
  return Math.round(base * mult);
}

/** Consecutive days with at least one completion, ending today (or yesterday, if today is still empty). */
export function streak(completions: Completion[]): number {
  if (!completions.length) return 0;
  const days = new Set(completions.map((c) => dayKey(c.at)));
  let cursor = startOfDay();
  if (!days.has(dayKey(cursor))) cursor -= DAY;
  let n = 0;
  while (days.has(dayKey(cursor))) {
    n++;
    cursor -= DAY;
  }
  return n;
}

export function countByDay(completions: Completion[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of completions) {
    const k = dayKey(c.at);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}
