import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlarmClock, Flame, Link2, ListTree, ListTodo, Network, Sparkles, Trophy } from 'lucide-react';
import { useStore, selectActiveNote } from '../store/store';
import { navigate, useRoute } from '../hooks/useRoute';
import { backlinksFor, extractHeadings, wordCount } from '../lib/links';
import { todayProgress, toggleTaskWithFx } from '../lib/tasks';
import { levelInfo, streak } from '../lib/xp';
import { formatDue, relativeTime } from '../lib/dates';
import { ProgressRing } from './ProgressRing';
import { GraphCanvas } from '../views/GraphView';
import { TaskTitle } from '../views/TaskTitle';

function Section({ icon, title, children, count }: { icon: React.ReactNode; title: string; children: React.ReactNode; count?: number }) {
  return (
    <section className="rp-section">
      <div className="rp-heading">
        {icon}
        <span>{title}</span>
        {count !== undefined && <span className="rp-count">{count}</span>}
      </div>
      {children}
    </section>
  );
}

const plainLinks = (s: string) =>
  s
    .replace(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b ?? a)
    .replace(/(\*\*|__|==|`)/g, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, '')
    .replace(/^#+\s+/, '');

function NoteContext() {
  const note = useStore(selectActiveNote);
  const notes = useStore((s) => s.notes);
  const tasks = useStore((s) => s.tasks);
  const openNote = useStore((s) => s.openNote);

  const backlinks = useMemo(() => (note ? backlinksFor(notes, note) : []), [notes, note]);
  const headings = useMemo(() => (note ? extractHeadings(note.content) : []), [note]);
  const linkedTasks = useMemo(() => {
    if (!note) return [];
    const t = note.title.toLowerCase();
    return tasks.filter((task) => {
      for (const m of task.title.matchAll(/\[\[([^\]|#]+)/g)) if (m[1].trim().toLowerCase() === t) return true;
      return false;
    });
  }, [tasks, note]);

  if (!note) return <div className="rp-empty">Open a note to see its links.</div>;

  return (
    <>
      <Section icon={<Network size={14} />} title="Local graph">
        <div className="rp-graph">
          <GraphCanvas focusId={note.id} compact />
        </div>
      </Section>

      <Section icon={<Link2 size={14} />} title="Backlinks" count={backlinks.length}>
        {backlinks.length === 0 && <div className="rp-empty">Nothing links here yet. Type [[{note.title}]] in another note.</div>}
        {backlinks.map((b) => (
          <button key={b.note.id} className="rp-backlink" onClick={() => openNote(b.note.id)}>
            <div className="rp-backlink-title">{b.note.title}</div>
            {b.snippets.slice(0, 2).map((s, i) => (
              <div key={i} className="rp-backlink-snippet">
                {plainLinks(s).slice(0, 140)}
              </div>
            ))}
          </button>
        ))}
      </Section>

      {linkedTasks.length > 0 && (
        <Section icon={<ListTodo size={14} />} title="Linked tasks" count={linkedTasks.length}>
          {linkedTasks.map((t) => (
            <div key={t.id} className={`rp-task${t.done ? ' done' : ''}`}>
              <button
                className={`mini-check${t.done ? ' checked' : ''}`}
                onClick={(e) => toggleTaskWithFx(t.id, e.currentTarget)}
                aria-label="Toggle task"
              />
              <span>
                <TaskTitle title={t.title} />
              </span>
            </div>
          ))}
        </Section>
      )}

      <Section icon={<ListTree size={14} />} title="Outline">
        {headings.length === 0 && <div className="rp-empty">Add # headings to build an outline.</div>}
        {headings.map((h, i) => (
          <button
            key={i}
            className="rp-outline"
            style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
            onClick={() => window.dispatchEvent(new CustomEvent('mp:goto-heading', { detail: { index: i, line: h.line } }))}
          >
            {h.text}
          </button>
        ))}
      </Section>

      <div className="rp-meta">
        {wordCount(note.content)} words · edited {relativeTime(note.updatedAt)}
      </div>
    </>
  );
}

function TodayContext() {
  const tasks = useStore((s) => s.tasks);
  const completions = useStore((s) => s.completions);
  const xp = useStore((s) => s.xp);
  const progress = todayProgress(tasks);
  const lvl = levelInfo(xp);
  const st = streak(completions);
  const upcoming = useMemo(
    () =>
      tasks
        .filter((t) => !t.done && t.remindAt && t.remindAt > Date.now())
        .sort((a, b) => a.remindAt! - b.remindAt!)
        .slice(0, 4),
    [tasks],
  );
  const recent = completions.slice(-5).reverse();

  return (
    <>
      <div className="rp-today">
        <ProgressRing
          value={progress.ratio}
          size={140}
          stroke={12}
          label={progress.total ? `${Math.round(progress.ratio * 100)}%` : '—'}
          sublabel={progress.total ? `${progress.done} of ${progress.total} today` : 'nothing due'}
        />
      </div>

      <div className="rp-stats">
        <div className="rp-stat">
          <Flame size={18} className={st > 0 ? 'flame-on' : ''} />
          <div>
            <div className="rp-stat-value">{st}</div>
            <div className="rp-stat-label">day streak</div>
          </div>
        </div>
        <div className="rp-stat" onClick={() => navigate('orbit')} role="button" data-snap>
          <Trophy size={18} className="trophy" />
          <div>
            <div className="rp-stat-value">Lv {lvl.level}</div>
            <div className="rp-stat-label">{lvl.title}</div>
          </div>
        </div>
      </div>
      <div className="xp-bar" title={`${lvl.into} / ${lvl.needed} XP`}>
        <motion.div className="xp-fill" animate={{ width: `${lvl.progress * 100}%` }} transition={{ type: 'spring', stiffness: 80, damping: 15 }} />
        <span className="xp-text">
          {lvl.into} / {lvl.needed} XP
        </span>
      </div>

      <Section icon={<AlarmClock size={14} />} title="Coming up">
        {upcoming.length === 0 && <div className="rp-empty">No reminders set. Add a time like “at 5pm” to a task.</div>}
        {upcoming.map((t) => (
          <div key={t.id} className="rp-reminder">
            <span className="rp-reminder-time">{formatDue(t.remindAt!)}</span>
            <span className="rp-reminder-title">
              <TaskTitle title={t.title} />
            </span>
          </div>
        ))}
      </Section>

      <Section icon={<Sparkles size={14} />} title="Recently finished">
        {recent.length === 0 && <div className="rp-empty">Your wins will show up here.</div>}
        <AnimatePresence initial={false}>
          {recent.map((c) => (
            <motion.div
              key={c.taskId + c.at}
              className="rp-win"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              layout
            >
              <span className="rp-win-xp">+{c.xp}</span>
              <span className="rp-win-title">{plainLinks(c.title)}</span>
              <span className="rp-win-time">{relativeTime(c.at)}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </Section>
    </>
  );
}

export function RightPanel() {
  const open = useStore((s) => s.settings.rightOpen);
  const route = useRoute();
  const show = open && route !== 'graph' && route !== 'orbit' && route !== 'fidget' && route !== 'settings';
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.aside
          className="right-panel"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 300, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        >
          <div className="right-inner">{route === 'notes' ? <NoteContext /> : <TodayContext />}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
