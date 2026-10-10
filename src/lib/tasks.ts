import type { Task } from '../store/types';
import { useStore } from '../store/store';
import { toast } from '../store/ui';
import { endOfDay, startOfDay } from './dates';
import { fx } from './fx';
import { sfx } from './sound';
import { levelInfo, xpForTask } from './xp';

export function isOverdue(t: Task, now = Date.now()): boolean {
  if (t.done || t.due === undefined) return false;
  return t.dueHasTime ? t.due < now : endOfDay(t.due) < now;
}

export function isDueToday(t: Task): boolean {
  return t.due !== undefined && t.due <= endOfDay();
}

export function todayProgress(tasks: Task[]) {
  const sod = startOfDay();
  const eod = endOfDay();
  let total = 0;
  let done = 0;
  for (const t of tasks) {
    if (t.done && (t.completedAt ?? 0) >= sod) {
      total++;
      done++;
    } else if (!t.done && t.due !== undefined && t.due <= eod) total++;
  }
  return { total, done, ratio: total ? done / total : 0 };
}

export function sortTasks(a: Task, b: Task): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.done && b.done) return (b.completedAt ?? 0) - (a.completedAt ?? 0);
  const ad = a.due ?? Infinity;
  const bd = b.due ?? Infinity;
  if (ad !== bd) return ad - bd;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return b.createdAt - a.createdAt;
}

let combo = 0;
let lastCompleteAt = 0;

/**
 * Toggle a task with all the juice: sound, particles, XP text, combos and level-ups.
 * Feedback fires instantly; with `commitDelay` the store update lands a beat later so the
 * row can finish its check animation before it moves to the done list.
 */
export function toggleTaskWithFx(id: string, anchor: Element | null, commitDelay = 0) {
  const store = useStore.getState();
  const task = store.tasks.find((t) => t.id === id);
  if (!task) return;

  const rect = anchor?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

  if (task.done) {
    const res = store.toggleTask(id, 1);
    sfx.uncomplete();
    if (res?.xp) fx.text(x + 30, y - 10, `${res.xp} XP`, '#8a8aa3', 14);
    return;
  }

  const now = Date.now();
  combo = now - lastCompleteAt < 90_000 ? combo + 1 : 1;
  lastCompleteAt = now;
  const myCombo = combo;
  const gained = xpForTask(task.priority, myCombo);
  const accent = store.settings.accent;

  sfx.complete(myCombo);
  fx.ripple(x, y, accent, 46);
  fx.burst(x, y, { count: 22 + myCombo * 6, speed: 5 + myCombo * 0.7, colors: [accent, '#4fd1c5', '#ffc857', '#ff7ab6'] });
  fx.text(x + 34, y - 6, `+${gained} XP`, '#ffc857');
  if (myCombo >= 2) {
    const hue = (myCombo * 47) % 360;
    setTimeout(() => fx.text(x + 120, y - 26, `x${myCombo} COMBO!`, `hsl(${hue} 95% 68%)`, 15 + Math.min(myCombo, 6) * 2), 120);
  }

  const wasDueToday = isDueToday(task);
  const commit = () => {
    const res = useStore.getState().toggleTask(id, myCombo);
    if (!res?.completed) return;
    if (res.leveledUp) {
      setTimeout(() => {
        sfx.levelUp();
        fx.confetti(1.1);
        const info = levelInfo(useStore.getState().xp);
        toast({ kind: 'level', title: `Level ${info.level} unlocked!`, body: `You are now a ${info.title}.`, duration: 5000 });
        useStore.getState().pushNotification({ kind: 'achievement', title: `Reached level ${info.level}`, body: info.title });
      }, 150);
    }
    if (wasDueToday && !useStore.getState().tasks.some((t) => !t.done && isDueToday(t))) {
      setTimeout(
        () => {
          fx.confetti(0.8);
          sfx.chime();
          toast({ kind: 'success', title: 'Today: cleared ✨', body: 'Every task due today is done. Go touch some grass.', duration: 5000 });
        },
        res.leveledUp ? 1200 : 250,
      );
    }
  };
  if (commitDelay) setTimeout(commit, commitDelay);
  else commit();
}
