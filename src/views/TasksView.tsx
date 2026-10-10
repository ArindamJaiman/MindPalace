import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlarmClock, Bell, CalendarClock, ChevronDown, CornerDownLeft, Flag, Hash, Link2, Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../store/store';
import { toast, useUi, type TaskList } from '../store/ui';
import type { Priority, Task } from '../store/types';
import { parseTask, PRIORITY_LABEL } from '../lib/parseTask';
import { isDueToday, isOverdue, sortTasks, todayProgress, toggleTaskWithFx } from '../lib/tasks';
import { DAY, dayKey, endOfDay, formatDue, fromLocalInput, greeting, startOfDay, toLocalInput } from '../lib/dates';
import { tagColor } from '../lib/links';
import { fx } from '../lib/fx';
import { sfx } from '../lib/sound';
import { ProgressRing } from '../components/ProgressRing';
import { TaskTitle } from './TaskTitle';

const LIST_TITLE: Record<TaskList, string> = {
  today: 'Today',
  upcoming: 'Upcoming',
  inbox: 'Inbox',
  all: 'All tasks',
  done: 'Completed',
};

const EXAMPLES = [
  'Call mom tomorrow 6pm #family !!',
  'Finish the report friday #work !!!',
  'Read 20 pages tonight #books',
  'Stretch in 30m #health',
  'Review [[Someday ideas]] next week',
  'Water the plants at 9am #home',
];

const PRIORITY_COLOR = ['var(--text-faint)', '#7cc4ff', '#ffc857', '#ff6b8b'];

/* ------------------------------------------------------------------ */

function QuickAdd() {
  const [value, setValue] = useState('');
  const [ex, setEx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusSignal = useUi((s) => s.focusQuickAdd);
  const taskList = useUi((s) => s.taskList);
  const tagFilter = useUi((s) => s.tagFilter);
  const addTask = useStore((s) => s.addTask);
  const parsed = useMemo(() => (value.trim() ? parseTask(value) : null), [value]);

  useEffect(() => {
    if (focusSignal) inputRef.current?.focus();
  }, [focusSignal]);

  useEffect(() => {
    const id = setInterval(() => setEx((i) => (i + 1) % EXAMPLES.length), 3500);
    return () => clearInterval(id);
  }, []);

  const submit = () => {
    if (!parsed) return;
    let { due, dueHasTime } = parsed;
    if (due === undefined && taskList === 'today') {
      due = startOfDay();
      dueHasTime = false;
    }
    const tags = tagFilter && !parsed.tags.includes(tagFilter) ? [...parsed.tags, tagFilter] : parsed.tags;
    addTask({ title: parsed.title, tags, priority: parsed.priority, due, dueHasTime });
    sfx.add();
    const r = inputRef.current?.getBoundingClientRect();
    if (r) fx.burst(r.left + 24, r.top + r.height / 2, { count: 14, speed: 4, gravity: 0.05, shapes: ['circle', 'star'] });
    setValue('');
  };

  return (
    <div className={`quick-add${value ? ' has-value' : ''}`}>
      <div className="qa-row">
        <span className="qa-plus">
          <Plus size={18} />
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') inputRef.current?.blur();
          }}
          placeholder={`Add a task… try “${EXAMPLES[ex]}”`}
          aria-label="Add a task"
        />
        <AnimatePresence>
          {value && (
            <motion.button
              className="qa-submit"
              onClick={submit}
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 600, damping: 25 }}
            >
              <CornerDownLeft size={15} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {parsed && parsed.chips.length > 0 && (
          <motion.div className="qa-chips" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <AnimatePresence initial={false}>
              {parsed.chips.map((c) => (
                <motion.span
                  key={c.kind + c.label}
                  className={`chip chip-${c.kind}`}
                  style={c.kind === 'tag' ? ({ '--tag': tagColor(c.label.slice(1)) } as React.CSSProperties) : undefined}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 700, damping: 22 }}
                >
                  {c.kind === 'date' && <CalendarClock size={12} />}
                  {c.kind === 'priority' && <Flag size={12} />}
                  {c.kind === 'link' && <Link2 size={12} />}
                  {c.label}
                </motion.span>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TaskDetails({ task }: { task: Task }) {
  const { updateTask, deleteTask, restoreTask } = useStore.getState();
  const [tagInput, setTagInput] = useState('');

  const quickRemind = (ms: number) => {
    updateTask(task.id, { remindAt: Date.now() + ms });
    sfx.tick();
  };

  return (
    <motion.div
      className="task-details"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 36 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="td-grid">
        <label className="td-field td-wide">
          <span>Title</span>
          <input value={task.title} onChange={(e) => updateTask(task.id, { title: e.target.value })} />
        </label>
        <label className="td-field td-wide">
          <span>Notes</span>
          <textarea
            rows={2}
            placeholder="Anything worth remembering…"
            value={task.details}
            onChange={(e) => updateTask(task.id, { details: e.target.value })}
          />
        </label>
        <label className="td-field">
          <span>
            <CalendarClock size={12} /> Due
          </span>
          <input
            type="datetime-local"
            value={toLocalInput(task.due)}
            onChange={(e) => updateTask(task.id, { due: fromLocalInput(e.target.value), dueHasTime: true })}
          />
        </label>
        <label className="td-field">
          <span>
            <AlarmClock size={12} /> Remind me
          </span>
          <input
            type="datetime-local"
            value={toLocalInput(task.remindAt)}
            onChange={(e) => updateTask(task.id, { remindAt: fromLocalInput(e.target.value) })}
          />
        </label>
      </div>
      <div className="td-row">
        <div className="td-quick">
          <span className="td-label">Remind in</span>
          <button onClick={() => quickRemind(10 * 60_000)}>10m</button>
          <button onClick={() => quickRemind(60 * 60_000)}>1h</button>
          <button onClick={() => quickRemind(3 * 60 * 60_000)}>3h</button>
          <button
            onClick={() => {
              updateTask(task.id, { remindAt: startOfDay() + DAY + 9 * 3_600_000 });
              sfx.tick();
            }}
          >
            Tomorrow 9am
          </button>
          {task.remindAt && (
            <button className="td-clear" onClick={() => updateTask(task.id, { remindAt: undefined })}>
              <X size={12} /> clear
            </button>
          )}
        </div>
      </div>
      <div className="td-row">
        <div className="td-prio">
          <span className="td-label">Priority</span>
          {([0, 1, 2, 3] as Priority[]).map((p) => (
            <button
              key={p}
              className={task.priority === p ? 'active' : ''}
              style={{ '--p': PRIORITY_COLOR[p] } as React.CSSProperties}
              onClick={() => {
                updateTask(task.id, { priority: p });
                sfx.tick();
              }}
            >
              <Flag size={12} /> {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="td-row">
        <div className="td-tags">
          <span className="td-label">Tags</span>
          {task.tags.map((t) => (
            <span key={t} className="chip chip-tag" style={{ '--tag': tagColor(t) } as React.CSSProperties}>
              #{t}
              <button onClick={() => updateTask(task.id, { tags: task.tags.filter((x) => x !== t) })} aria-label={`Remove ${t}`}>
                <X size={10} />
              </button>
            </span>
          ))}
          <span className="td-tag-input">
            <Hash size={12} />
            <input
              placeholder="add tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value.replace(/\s/g, ''))}
              onKeyDown={(e) => {
                const v = tagInput.replace(/^#/, '').toLowerCase();
                if (e.key === 'Enter' && v) {
                  if (!task.tags.includes(v)) updateTask(task.id, { tags: [...task.tags, v] });
                  setTagInput('');
                  sfx.pop(1.3);
                }
              }}
            />
          </span>
        </div>
        <button
          className="td-delete"
          onClick={() => {
            const removed = deleteTask(task.id);
            sfx.delete();
            if (removed) toast({ kind: 'info', title: 'Task deleted', action: { label: 'Undo', run: () => restoreTask(removed) } });
          }}
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </motion.div>
  );
}

function TaskItem({ task }: { task: Task }) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);
  const done = optimistic ?? task.done;
  const overdue = isOverdue(task);

  useEffect(() => setOptimistic(null), [task.done]);

  return (
    <motion.div
      layout="position"
      className={`task prio-${task.priority}${done ? ' done' : ''}${overdue ? ' overdue' : ''}${expanded ? ' expanded' : ''}`}
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.95, transition: { duration: 0.28 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 36 }}
    >
      <div className="task-row" onClick={() => setExpanded((v) => !v)}>
        <button
          className={`check${done ? ' checked' : ''}`}
          aria-label={done ? 'Mark as not done' : 'Complete task'}
          onClick={(e) => {
            e.stopPropagation();
            if (optimistic !== null) return;
            if (!task.done) {
              setOptimistic(true);
              toggleTaskWithFx(task.id, e.currentTarget, 550);
            } else toggleTaskWithFx(task.id, e.currentTarget);
          }}
        >
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5l4.2 4.2L19 7" />
          </svg>
        </button>
        <div className="task-main">
          <div className="task-title">
            <span className="strike">
              <TaskTitle title={task.title} />
            </span>
          </div>
          {(task.due || task.tags.length > 0 || task.remindAt || task.details) && (
            <div className="task-meta">
              {task.due !== undefined && (
                <span className={`meta-due${overdue ? ' late' : ''}${isDueToday(task) && !overdue ? ' today' : ''}`}>
                  <CalendarClock size={12} />
                  {formatDue(task.due, !!task.dueHasTime)}
                </span>
              )}
              {task.remindAt && !task.done && (
                <span className={`meta-remind${task.reminded ? ' fired' : ''}`} title={`Reminder: ${formatDue(task.remindAt)}`}>
                  <Bell size={11} />
                </span>
              )}
              {task.tags.map((t) => (
                <span key={t} className="meta-tag" style={{ '--tag': tagColor(t) } as React.CSSProperties}>
                  #{t}
                </span>
              ))}
              {task.details && <span className="meta-details">{task.details.slice(0, 60)}</span>}
            </div>
          )}
        </div>
        {task.priority > 0 && (
          <span className="task-flag" style={{ color: PRIORITY_COLOR[task.priority] }} title={`${PRIORITY_LABEL[task.priority]} priority`}>
            <Flag size={14} fill="currentColor" />
          </span>
        )}
        <motion.span className="task-chevron" animate={{ rotate: expanded ? 180 : 0 }}>
          <ChevronDown size={16} />
        </motion.span>
      </div>
      <AnimatePresence>{expanded && <TaskDetails task={task} />}</AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

function groupBy(tasks: Task[], keyFn: (t: Task) => number | undefined): { label: string; tasks: Task[] }[] {
  const groups = new Map<string, { label: string; tasks: Task[] }>();
  for (const t of tasks) {
    const k = keyFn(t);
    const key = k === undefined ? 'none' : dayKey(k);
    if (!groups.has(key)) groups.set(key, { label: k === undefined ? 'No date' : formatDue(k, false), tasks: [] });
    groups.get(key)!.tasks.push(t);
  }
  return [...groups.values()];
}

function EmptyState({ list }: { list: TaskList }) {
  const copy: Record<TaskList, [string, string]> = {
    today: ['Nothing due today', 'A clear runway. Add something above, or go play in the Fidget Lab.'],
    upcoming: ['The future is wide open', 'Tasks with a future date will gather here.'],
    inbox: ['Inbox zero', 'Tasks without a date land here.'],
    all: ['No open tasks', 'Either you are extremely productive, or just getting started.'],
    done: ['No wins yet', 'Complete a task and it will show up here, with XP to match.'],
  };
  return (
    <motion.div className="empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="empty-orb">
        <span />
        <span />
        <span />
      </div>
      <div className="empty-title">{copy[list][0]}</div>
      <div className="empty-sub">{copy[list][1]}</div>
    </motion.div>
  );
}

function motivation(done: number, total: number): string {
  if (!total) return 'Nothing scheduled. Plan something fun?';
  const r = done / total;
  if (r === 0) return 'One small checkbox to get the ball rolling.';
  if (r < 0.5) return 'Momentum is building. Keep stacking wins.';
  if (r < 1) return 'Over halfway. The finish line can see you.';
  return 'Everything done. Legendary.';
}

export function TasksView() {
  const tasks = useStore((s) => s.tasks);
  const name = useStore((s) => s.settings.name);
  const { taskList, tagFilter, setTagFilter } = useUi();
  const [showDone, setShowDone] = useState(true);
  const progress = todayProgress(tasks);

  const filtered = useMemo(() => (tagFilter ? tasks.filter((t) => t.tags.includes(tagFilter)) : tasks), [tasks, tagFilter]);

  const { open, doneToday, groups } = useMemo(() => {
    const eod = endOfDay();
    const sod = startOfDay();
    const openTasks = filtered.filter((t) => !t.done);
    let list: Task[] = [];
    let grouped: { label: string; tasks: Task[] }[] | null = null;
    switch (taskList) {
      case 'today':
        list = openTasks.filter(isDueToday);
        break;
      case 'upcoming':
        list = openTasks.filter((t) => t.due !== undefined && t.due > eod);
        grouped = groupBy(list.sort(sortTasks), (t) => t.due);
        break;
      case 'inbox':
        list = openTasks.filter((t) => t.due === undefined);
        break;
      case 'all':
        list = openTasks;
        break;
      case 'done':
        list = filtered.filter((t) => t.done).sort(sortTasks);
        grouped = groupBy(list, (t) => t.completedAt);
        break;
    }
    return {
      open: list.sort(sortTasks),
      doneToday: taskList === 'today' ? filtered.filter((t) => t.done && (t.completedAt ?? 0) >= sod).sort(sortTasks) : [],
      groups: grouped,
    };
  }, [filtered, taskList]);

  const dateLine = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="view tasks-view">
      <div className="tasks-inner">
        <header className="tasks-hero">
          <div className="hero-text">
            <div className="hero-greeting">
              {greeting()}
              {name ? `, ${name}` : ''} 👋
            </div>
            <h1 className="hero-title">
              {LIST_TITLE[taskList]}
              <motion.span key={open.length} className="hero-count" initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                {taskList === 'done' ? open.length : open.length || ''}
              </motion.span>
            </h1>
            <div className="hero-sub">
              {dateLine} · {motivation(progress.done, progress.total)}
            </div>
          </div>
          <ProgressRing
            value={progress.ratio}
            size={92}
            stroke={9}
            label={progress.total ? `${progress.done}/${progress.total}` : '✨'}
            sublabel="today"
          />
        </header>

        {taskList !== 'done' && <QuickAdd />}

        <AnimatePresence>
          {tagFilter && (
            <motion.div className="filter-chip-row" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <span className="chip chip-tag" style={{ '--tag': tagColor(tagFilter) } as React.CSSProperties}>
                Filtering by #{tagFilter}
                <button onClick={() => setTagFilter(null)} aria-label="Clear filter">
                  <X size={11} />
                </button>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {groups ? (
          groups.length === 0 ? (
            <EmptyState list={taskList} />
          ) : (
            groups.map((g) => (
              <div key={g.label} className="task-group">
                <div className="group-label">{g.label}</div>
                <div className="task-list">
                  <AnimatePresence initial={false}>
                    {g.tasks.map((t) => (
                      <TaskItem key={t.id} task={t} />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))
          )
        ) : (
          <>
            <div className="task-list">
              <AnimatePresence initial={false}>
                {open.map((t) => (
                  <TaskItem key={t.id} task={t} />
                ))}
              </AnimatePresence>
            </div>
            {open.length === 0 && doneToday.length === 0 && <EmptyState list={taskList} />}
            {open.length === 0 && doneToday.length > 0 && (
              <motion.div className="all-clear" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <span className="all-clear-emoji">🏆</span> All clear for today. You earned this moment.
              </motion.div>
            )}
          </>
        )}

        {doneToday.length > 0 && (
          <div className="task-group done-group">
            <button className="group-label toggle" onClick={() => setShowDone((v) => !v)}>
              <motion.span animate={{ rotate: showDone ? 0 : -90 }} style={{ display: 'inline-flex' }}>
                <ChevronDown size={14} />
              </motion.span>
              Done today · {doneToday.length}
            </button>
            <AnimatePresence initial={false}>
              {showDone && (
                <motion.div className="task-list" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <AnimatePresence initial={false}>
                    {doneToday.map((t) => (
                      <TaskItem key={t.id} task={t} />
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
