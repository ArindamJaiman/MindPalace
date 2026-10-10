import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { gsap, useGSAP, ScrollTrigger } from '../gsap';
import { SectionHead } from '../components/SectionHead';
import { useStore } from '../../store/store';
import { useUi, toast, type TaskList } from '../../store/ui';
import type { Priority, Task } from '../../store/types';
import { parseTask } from '../../lib/parseTask';
import { isDueToday, isOverdue, sortTasks, toggleTaskWithFx } from '../../lib/tasks';
import { DAY, endOfDay, formatDue, fromLocalInput, startOfDay, toLocalInput } from '../../lib/dates';
import { findNoteByTitle } from '../../lib/links';
import { fx } from '../../lib/fx';
import { sfx } from '../../lib/sound';
import { pid, useTerm } from '../state';

const LISTS: TaskList[] = ['today', 'upcoming', 'inbox', 'all', 'done'];
const PRI = ['---', '!--', '!!-', '!!!'];

/** Task title where [[links]] open the note pager. */
export function TermTitle({ title }: { title: string }) {
  const notes = useStore((s) => s.notes);
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of title.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(<Fragment key={last}>{title.slice(last, i)}</Fragment>);
    const target = m[1].trim();
    parts.push(
      <a
        key={i}
        href="#"
        className={`t-link${findNoteByTitle(notes, target) ? '' : ' ghost'}`}
        data-cursor="OPEN"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = useStore.getState().openOrCreateByTitle(target);
          useTerm.getState().openNote(id);
        }}
      >
        {m[2] ?? target}
      </a>,
    );
    last = i + m[0].length;
  }
  if (last < title.length) parts.push(<Fragment key={last}>{title.slice(last)}</Fragment>);
  return <>{parts}</>;
}

function dueCell(t: Task) {
  if (t.due === undefined) return <span className="dim">--</span>;
  if (isOverdue(t)) return <span className="red blink-slow">OVERDUE</span>;
  return <span className={isDueToday(t) ? 'bright' : ''}>{formatDue(t.due, !!t.dueHasTime).toUpperCase()}</span>;
}

function TaskAdd() {
  const [v, setV] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const list = useUi((s) => s.taskList);
  const tagFilter = useUi((s) => s.tagFilter);
  const focusSignal = useUi((s) => s.focusQuickAdd);
  const parsed = useMemo(() => (v.trim() ? parseTask(v) : null), [v]);

  useEffect(() => {
    if (focusSignal) ref.current?.focus();
  }, [focusSignal]);

  const submit = () => {
    if (!parsed) return;
    let { due, dueHasTime } = parsed;
    if (due === undefined && list === 'today') {
      due = startOfDay();
      dueHasTime = false;
    }
    const tags = tagFilter && !parsed.tags.includes(tagFilter) ? [...parsed.tags, tagFilter] : parsed.tags;
    const t = useStore.getState().addTask({ title: parsed.title, tags, priority: parsed.priority, due, dueHasTime });
    sfx.granted(1);
    fx.burstAt(ref.current, { count: 18, speed: 5, gravity: 0.1 });
    useTerm.getState().print([{ text: `[+] spawned ${pid(t.id)} :: ${t.title}`, tone: 'ok' }]);
    setV('');
  };

  return (
    <div className="t-add">
      <label className="t-add-row">
        <span className="pb">└─</span>
        <span className="pr">$ </span>
        <span className="bright">todo add </span>
        <input
          ref={ref}
          value={v}
          spellCheck={false}
          placeholder='"call mom tomorrow 6pm #family !!"'
          onChange={(e) => {
            setV(e.target.value);
            sfx.key();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') ref.current?.blur();
          }}
        />
      </label>
      {parsed && (
        <div className="t-parse">
          <span className="dim">  → </span>
          <span>title=</span>
          <span className="bright">"{parsed.title}"</span>
          {parsed.due !== undefined && (
            <>
              {' '}
              <span>due=</span>
              <span className="blue">{formatDue(parsed.due, parsed.dueHasTime).toUpperCase()}</span>
            </>
          )}
          {parsed.priority > 0 && (
            <>
              {' '}
              <span>pri=</span>
              <span className="red">{PRI[parsed.priority]}</span>
            </>
          )}
          {parsed.tags.map((t) => (
            <span key={t}>
              {' '}
              <span className="dim">tag=</span>#{t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskDetail({ task }: { task: Task }) {
  const { updateTask, deleteTask, restoreTask } = useStore.getState();
  const [tag, setTag] = useState('');
  const [armed, setArmed] = useState(false);
  return (
    <div className="t-detail" onClick={(e) => e.stopPropagation()}>
      <div className="dim">{`  > edit ${pid(task.id)}`}</div>
      <label className="kv">
        <span>title</span>
        <input value={task.title} onChange={(e) => updateTask(task.id, { title: e.target.value })} spellCheck={false} />
      </label>
      <label className="kv">
        <span>notes</span>
        <textarea rows={2} value={task.details} onChange={(e) => updateTask(task.id, { details: e.target.value })} placeholder="# intel" />
      </label>
      <label className="kv">
        <span>due</span>
        <input type="datetime-local" value={toLocalInput(task.due)} onChange={(e) => updateTask(task.id, { due: fromLocalInput(e.target.value), dueHasTime: true })} />
      </label>
      <div className="kv">
        <span>remind</span>
        <div className="kv-row">
          <input type="datetime-local" value={toLocalInput(task.remindAt)} onChange={(e) => updateTask(task.id, { remindAt: fromLocalInput(e.target.value) })} />
          {[
            ['+10m', 10 * 60_000],
            ['+1h', 3_600_000],
            ['+3h', 3 * 3_600_000],
          ].map(([l, ms]) => (
            <button key={l} className="t-btn" onClick={() => (updateTask(task.id, { remindAt: Date.now() + (ms as number) }), sfx.key())}>
              [{l}]
            </button>
          ))}
          <button className="t-btn" onClick={() => updateTask(task.id, { remindAt: startOfDay() + DAY + 9 * 3_600_000 })}>
            [tmrw 09:00]
          </button>
          {task.remindAt && (
            <button className="t-btn red" onClick={() => updateTask(task.id, { remindAt: undefined })}>
              [clear]
            </button>
          )}
        </div>
      </div>
      <div className="kv">
        <span>priority</span>
        <div className="kv-row">
          {([0, 1, 2, 3] as Priority[]).map((p) => (
            <button key={p} className={`t-btn p${p}${task.priority === p ? ' on' : ''}`} onClick={() => (updateTask(task.id, { priority: p }), sfx.key())}>
              [{PRI[p]}]
            </button>
          ))}
        </div>
      </div>
      <div className="kv">
        <span>tags</span>
        <div className="kv-row">
          {task.tags.map((t) => (
            <button key={t} className="t-btn" title="remove" onClick={() => updateTask(task.id, { tags: task.tags.filter((x) => x !== t) })}>
              #{t} ×
            </button>
          ))}
          <input
            className="kv-tag"
            placeholder="+tag"
            value={tag}
            onChange={(e) => setTag(e.target.value.replace(/\s/g, ''))}
            onKeyDown={(e) => {
              const v = tag.replace(/^#/, '').toLowerCase();
              if (e.key === 'Enter' && v) {
                if (!task.tags.includes(v)) updateTask(task.id, { tags: [...task.tags, v] });
                setTag('');
              }
            }}
          />
        </div>
      </div>
      <div className="kv-row end">
        <button
          className={`t-btn red${armed ? ' armed' : ''}`}
          data-cursor="DELETE"
          onClick={() => {
            if (!armed) {
              setArmed(true);
              setTimeout(() => setArmed(false), 2500);
              return;
            }
            const removed = deleteTask(task.id);
            sfx.denied();
            if (removed) toast({ kind: 'info', title: `rm -f ${pid(removed.id)}`, action: { label: 'undo', run: () => restoreTask(removed) } });
          }}
        >
          {armed ? '[ confirm rm -f ]' : '[ rm -f ]'}
        </button>
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const done = optimistic ?? task.done;
  useEffect(() => setOptimistic(null), [task.done]);

  return (
    <div className={`t-row p${task.priority}${done ? ' done' : ''}${optimistic ? ' glitching' : ''}${isOverdue(task) ? ' late' : ''}${open ? ' open' : ''}`}>
      <div className="t-cells" onClick={() => setOpen((v) => !v)} data-cursor={open ? 'CLOSE' : 'INSPECT'} role="button">
        <span className="c-pid dim">{pid(task.id)}</span>
        <button
          className="c-st"
          data-cursor={done ? 'REVERT' : 'EXECUTE'}
          aria-label={done ? 'Mark as not done' : 'Complete task'}
          onClick={(e) => {
            e.stopPropagation();
            if (optimistic !== null) return;
            if (!task.done) {
              setOptimistic(true);
              toggleTaskWithFx(task.id, e.currentTarget, 650);
            } else toggleTaskWithFx(task.id, e.currentTarget);
          }}
        >
          {done ? '[■]' : '[ ]'}
        </button>
        <span className={`c-pri p${task.priority}`}>{PRI[task.priority]}</span>
        <span className="c-due">{dueCell(task)}</span>
        <span className="c-title">
          <span className="strike">
            <TermTitle title={task.title} />
          </span>
          {task.remindAt && !task.done && <span className="blue" title={`reminder ${formatDue(task.remindAt)}`}> ⏲</span>}
        </span>
        <span className="c-tags dim">{task.tags.map((t) => `#${t}`).join(' ')}</span>
      </div>
      {open && <TaskDetail task={task} />}
    </div>
  );
}

export function TasksSection({ reduce }: { reduce: boolean }) {
  const tasks = useStore((s) => s.tasks);
  const { taskList, setTaskList, tagFilter, setTagFilter } = useUi();
  const root = useRef<HTMLElement>(null);

  const counts = useMemo(() => {
    const eod = endOfDay();
    const open = tasks.filter((t) => !t.done);
    return {
      today: open.filter(isDueToday).length,
      upcoming: open.filter((t) => t.due !== undefined && t.due > eod).length,
      inbox: open.filter((t) => t.due === undefined).length,
      all: open.length,
      done: tasks.length - open.length,
    } as Record<TaskList, number>;
  }, [tasks]);

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) if (!t.done) for (const g of t.tags) m.set(g, (m.get(g) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [tasks]);

  const { rows, doneToday } = useMemo(() => {
    const eod = endOfDay();
    const sod = startOfDay();
    const pool = tagFilter ? tasks.filter((t) => t.tags.includes(tagFilter)) : tasks;
    const open = pool.filter((t) => !t.done);
    const pick: Record<TaskList, () => Task[]> = {
      today: () => open.filter(isDueToday),
      upcoming: () => open.filter((t) => t.due !== undefined && t.due > eod),
      inbox: () => open.filter((t) => t.due === undefined),
      all: () => open,
      done: () => pool.filter((t) => t.done),
    };
    return {
      rows: pick[taskList]().sort(sortTasks),
      doneToday: taskList === 'today' ? pool.filter((t) => t.done && (t.completedAt ?? 0) >= sod).sort(sortTasks) : [],
    };
  }, [tasks, taskList, tagFilter]);

  useGSAP(
    () => {
      if (reduce) return;
      gsap.set('.t-row', { opacity: 0 });
      ScrollTrigger.batch('.t-row', {
        once: true,
        start: 'top 92%',
        onEnter: (els) => gsap.to(els, { opacity: 1, x: 0, duration: 0.35, stagger: 0.05, ease: 'power2.out', overwrite: true }),
      });
      gsap.from('.t-flags, .t-add', { opacity: 0, y: 16, stagger: 0.1, duration: 0.5, scrollTrigger: { trigger: '.t-flags', start: 'top 88%', once: true } });
    },
    { scope: root, dependencies: [] },
  );

  const cmd = `todo ls --${taskList}${tagFilter ? ` --tag=${tagFilter}` : ''}`;

  return (
    <section className="sec" id="sec-tasks" ref={root}>
      <SectionHead index="01" title="TASKS" path="~/tasks" cmd={cmd} reduce={reduce} />

      <div className="t-flags">
        {LISTS.map((l) => (
          <button
            key={l}
            className={`flag${taskList === l ? ' on' : ''}`}
            onClick={() => {
              setTaskList(l);
              sfx.key();
            }}
          >
            --{l}
            <span className="flag-n">[{counts[l]}]</span>
          </button>
        ))}
        <span className="flag-sep">│</span>
        {tags.map(([t, n]) => (
          <button
            key={t}
            className={`flag tag${tagFilter === t ? ' on' : ''}`}
            onClick={() => {
              setTagFilter(tagFilter === t ? null : t);
              sfx.key();
            }}
          >
            #{t}
            <span className="flag-n">{n}</span>
          </button>
        ))}
      </div>

      {taskList !== 'done' && <TaskAdd />}

      <div className="t-table">
        <div className="t-head">
          <span>PID</span>
          <span>ST</span>
          <span>PRI</span>
          <span>DUE</span>
          <span>TARGET</span>
          <span>TAGS</span>
        </div>
        {rows.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
        {rows.length === 0 && (
          <div className="t-empty">
            {taskList === 'today' && doneToday.length ? (
              <span className="bright">ALL TARGETS NEUTRALIZED. system idle.</span>
            ) : (
              <span className="dim">0 processes. nothing to execute.</span>
            )}
          </div>
        )}
        {doneToday.length > 0 && (
          <>
            <div className="t-divider">── neutralized today ({doneToday.length}) ──</div>
            {doneToday.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
