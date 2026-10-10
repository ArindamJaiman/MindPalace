import { useStore } from '../store/store';
import { useUi, type Toast } from '../store/ui';
import type { AppNotification } from '../store/types';
import { sfx } from './sound';
import { formatDue } from './dates';

/**
 * Notification plumbing. Today: in-app inbox + toasts + system notifications while a tab is open.
 * The registered service worker (public/sw.js) already handles `push` events, so server-sent
 * Web Push can be added later without changing callers.
 */

let swReg: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register('/sw.js');
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'navigate' && typeof e.data.url === 'string') {
        const hash = new URL(e.data.url, location.href).hash;
        if (hash) location.hash = hash;
      }
    });
  } catch {
    swReg = null;
  }
}

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  const p = await Notification.requestPermission();
  useStore.getState().setSettings({ notifications: p === 'granted' });
  return p;
}

async function systemNotify(title: string, body: string, link?: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, icon: '/favicon.svg', badge: '/favicon.svg', data: { url: link ?? '/' } };
  try {
    if (swReg) await swReg.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    /* some browsers refuse page-level notifications; the in-app toast still shows */
  }
}

export function notify(
  n: Omit<AppNotification, 'id' | 'at' | 'read'> & { toastKind?: Toast['kind']; action?: Toast['action'] },
) {
  const { toastKind, action, ...rest } = n;
  useStore.getState().pushNotification(rest);
  useUi.getState().toast({ kind: toastKind ?? 'info', title: n.title, body: n.body, action, duration: 7000 });
  sfx.chime();
  if (useStore.getState().settings.notifications) void systemNotify(n.title, n.body, n.link);
}

function checkReminders() {
  const { tasks, updateTask } = useStore.getState();
  const now = Date.now();
  for (const t of tasks) {
    if (t.done || t.reminded || t.remindAt === undefined || t.remindAt > now) continue;
    updateTask(t.id, { reminded: true });
    notify({
      kind: 'reminder',
      toastKind: 'reminder',
      title: `⏰ ${t.title.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b ?? a)}`,
      body: t.due ? `Due ${formatDue(t.due, !!t.dueHasTime)}` : 'Reminder',
      link: '/#/tasks',
      action: {
        label: 'Snooze 10m',
        run: () => useStore.getState().updateTask(t.id, { remindAt: Date.now() + 10 * 60_000 }),
      },
    });
  }
}

export function startReminderLoop(): () => void {
  checkReminders();
  const iv = setInterval(checkReminders, 15_000);
  const onFocus = () => checkReminders();
  window.addEventListener('focus', onFocus);
  return () => {
    clearInterval(iv);
    window.removeEventListener('focus', onFocus);
  };
}
