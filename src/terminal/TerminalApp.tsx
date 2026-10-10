import { useEffect } from 'react';
import { ScrollTrigger, prefersReduced } from './gsap';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { configureSound, sfx } from '../lib/sound';
import { configureFx, fx } from '../lib/fx';
import { setCompletionPresenter, type CompletionPresenter } from '../lib/tasks';
import { startReminderLoop } from '../lib/notify';
import { FxLayer } from '../components/FxLayer';
import { Rain } from './components/Rain';
import { HackerCursor } from './components/HackerCursor';
import { TopBar } from './components/TopBar';
import { Shell } from './components/Shell';
import { Pager } from './components/Pager';
import { Overlay } from './components/Overlay';
import { TermToasts } from './components/TermToasts';
import { DropOverlay } from './components/DropOverlay';
import { Hero } from './sections/Hero';
import { TasksSection } from './sections/TasksSection';
import { NotesSection } from './sections/NotesSection';
import { ReconSection } from './sections/ReconSection';
import { NetSection } from './sections/NetSection';
import { LogsSection } from './sections/LogsSection';
import { SysSection } from './sections/SysSection';
import { jumpTo } from './commands';
import { SECTIONS, useTerm, type SectionId } from './state';

/** Terminal edition: glyph debris, access-granted chirps, glitch overlays. */
const terminalPresenter: CompletionPresenter = {
  completed({ x, y, xp, combo }) {
    sfx.granted(combo);
    fx.ripple(x, y, 'rgba(245,245,245,0.85)', 34);
    fx.burst(x, y, { count: 16 + combo * 6, speed: 4.5 + combo * 0.6, gravity: 0.12, size: 4 });
    fx.text(x + 44, y - 4, `+${xp} XP`, '#f5f5f5', 16);
    if (combo >= 2) setTimeout(() => fx.text(x + 140, y - 24, `COMBO x${combo}`, combo % 2 ? '#ff2b2b' : '#2f7bff', 15 + Math.min(combo, 6) * 2), 100);
    useTerm.getState().print([{ text: `[+] target neutralized (+${xp}xp)${combo > 1 ? ` · combo x${combo}` : ''}`, tone: 'ok' }]);
  },
  uncompleted({ x, y, xp }) {
    sfx.denied();
    if (xp) fx.text(x + 30, y - 8, `${xp} XP`, '#737373', 13);
  },
  levelUp({ level, title }) {
    sfx.rankUp();
    useTerm.getState().showOverlay({ kind: 'rank', title: 'RANK UP', sub: `lvl ${level} // ${title.toUpperCase()}` });
  },
  dayCleared() {
    sfx.rankUp();
    useTerm.getState().showOverlay({ kind: 'cleared', title: 'CLEARED', sub: 'all targets neutralized. system idle.' });
  },
};

const HASH_TO_SECTION: Record<string, SectionId> = { tasks: 'tasks', notes: 'notes', vault: 'notes', recon: 'recon', net: 'net', logs: 'logs', sys: 'sys' };

function useTerminalRuntime(reduce: boolean, hydrated: boolean) {
  const sound = useStore((s) => s.settings.sound);
  const volume = useStore((s) => s.settings.volume);

  useEffect(() => configureSound(sound, volume), [sound, volume]);

  useEffect(() => {
    configureFx({
      palette: ['#f5f5f5', '#d4d4d4', '#8a8a8a', '#ff2b2b', '#2f7bff'],
      shapes: ['glyph', 'glyph', 'square', 'streak'],
      textFont: '"JetBrains Mono", monospace',
    });
    setCompletionPresenter(terminalPresenter);
    const stop = startReminderLoop();
    return stop;
  }, []);

  // Track which section is on screen (drives the prompt path and the workspace bar).
  useEffect(() => {
    if (!hydrated) return;
    const triggers = SECTIONS.map((s) =>
      ScrollTrigger.create({
        trigger: `#sec-${s.id}`,
        start: 'top 45%',
        end: 'bottom 45%',
        // Measure after the hero's pin so its spacer is accounted for.
        refreshPriority: -10,
        onToggle: (self) => self.isActive && useTerm.getState().setSection(s.id),
      }),
    );
    ScrollTrigger.sort();
    ScrollTrigger.refresh();
    // Content grows (new rows, expanded tasks, fonts): keep every trigger's range accurate.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => ScrollTrigger.refresh(), 200);
    });
    const main = document.querySelector('main.term');
    if (main) ro.observe(main);
    const go = () => {
      const key = location.hash.replace(/^#\/?/, '').split('/')[0];
      const id = HASH_TO_SECTION[key];
      if (id) setTimeout(() => jumpTo(id), 300);
    };
    go();
    window.addEventListener('hashchange', go);
    // Fonts change line heights; recompute pin/trigger positions once they're in.
    void document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => {
      triggers.forEach((t) => t.kill());
      ro.disconnect();
      clearTimeout(timer);
      window.removeEventListener('hashchange', go);
    };
  }, [hydrated]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduce);
  }, [reduce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, .cm-editor, [contenteditable="true"]');
      if (useTerm.getState().pager) return;
      if (e.altKey && /^[1-7]$/.test(e.key)) {
        e.preventDefault();
        jumpTo(SECTIONS[Number(e.key) - 1].id);
        return;
      }
      if (e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        jumpTo('tasks');
        setTimeout(() => useUi.getState().requestQuickAdd(), 600);
        return;
      }
      if (typing) return;
      if (e.key === '/' || e.key === ':' || e.key === '`' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        useTerm.getState().focusShell();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Boot() {
  return (
    <div className="boot-wait">
      <span className="blink">█</span> mounting /dev/mind…
    </div>
  );
}

export function TerminalApp() {
  const hydrated = useStore((s) => s.hydrated);
  const rain = useStore((s) => s.settings.termRain);
  const trail = useStore((s) => s.settings.termTrail);
  const reduceSetting = useStore((s) => s.settings.reduceMotion);
  const reduce = prefersReduced(reduceSetting);
  useTerminalRuntime(reduce, hydrated);

  if (!hydrated) return <Boot />;
  return (
    <>
      <Rain enabled={rain && !reduce} />
      <div className="crt" aria-hidden />
      <TopBar />
      <main className="term">
        <Hero reduce={reduce} />
        <TasksSection reduce={reduce} />
        <NotesSection reduce={reduce} />
        <ReconSection reduce={reduce} />
        <NetSection reduce={reduce} />
        <LogsSection reduce={reduce} />
        <SysSection reduce={reduce} />
      </main>
      <Shell />
      <Pager />
      <Overlay />
      <TermToasts />
      <DropOverlay />
      <FxLayer />
      <HackerCursor trail={trail} reduce={reduce} />
    </>
  );
}
