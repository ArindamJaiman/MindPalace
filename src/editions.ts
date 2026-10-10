import { flushPersist } from './store/store';

/**
 * MindPalace comes in editions: the same tasks, notes and progress presented in different
 * worlds. The Gateway at `/` lets you pick one; each edition can switch to the other.
 */
export type Edition = 'forge' | 'terminal';

export const EDITIONS: Record<Edition, { name: string; path: string; tagline: string }> = {
  forge: {
    name: 'Forge',
    path: '/forge/',
    tagline: 'Molten, tactile, loud. Particles, combos and a fidget lab.',
  },
  terminal: {
    name: 'Terminal',
    path: '/terminal/',
    tagline: 'Black-screen operator console. A real shell, radar, zero mercy.',
  },
};

const KEY = 'mp_edition';

export function lastEdition(): Edition | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'forge' || v === 'terminal' ? v : null;
  } catch {
    return null;
  }
}

export function rememberEdition(e: Edition) {
  try {
    localStorage.setItem(KEY, e);
  } catch {
    /* private mode: nothing to remember */
  }
}

/** Save pending state, then load another edition (or the Gateway). */
export async function goToEdition(target: Edition | 'gateway', hash = '') {
  if (target !== 'gateway') rememberEdition(target);
  await flushPersist();
  location.href = (target === 'gateway' ? '/' : EDITIONS[target].path) + hash;
}
