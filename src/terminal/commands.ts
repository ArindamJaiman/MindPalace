import { gsap } from './gsap';
import { useStore } from '../store/store';
import { useUi, toast, type TaskList } from '../store/ui';
import { parseTask } from '../lib/parseTask';
import { sortTasks, todayProgress, toggleTaskWithFx } from '../lib/tasks';
import { formatDue } from '../lib/dates';
import { levelInfo, streak } from '../lib/xp';
import { sfx } from '../lib/sound';
import { notify, requestNotificationPermission } from '../lib/notify';
import { sendMagicLink, signOut, syncNow, useSync } from '../sync/sync';
import { goToEdition } from '../editions';
import { pid, SECTIONS, useTerm, userHandle, type SectionId, type Tone } from './state';

type Out = string | { text: string; tone?: Tone };

const say = (...lines: Out[]) => useTerm.getState().print(lines);
const err = (text: string) => {
  sfx.denied();
  say({ text, tone: 'red' });
};

const SECTION_ALIASES: Record<string, SectionId> = {
  '~': 'boot',
  boot: 'boot',
  home: 'boot',
  tasks: 'tasks',
  todo: 'tasks',
  vault: 'notes',
  notes: 'notes',
  recon: 'recon',
  stats: 'recon',
  radar: 'recon',
  net: 'net',
  netmap: 'net',
  graph: 'net',
  logs: 'logs',
  log: 'logs',
  sys: 'sys',
  settings: 'sys',
  etc: 'sys',
};

export function jumpTo(id: SectionId) {
  const el = document.getElementById(`sec-${id}`);
  if (!el) return;
  gsap.to(window, { scrollTo: { y: el, offsetY: 44 }, duration: 1.1, ease: 'power3.inOut' });
}

function findTask(q: string) {
  const all = useStore.getState().tasks;
  return all.find((t) => pid(t.id) === q.toLowerCase()) ?? all.find((t) => pid(t.id).startsWith(q.toLowerCase()));
}

function findNote(q: string) {
  const ql = q.toLowerCase();
  const notes = Object.values(useStore.getState().notes);
  return notes.find((n) => n.title.toLowerCase() === ql) ?? notes.find((n) => n.title.toLowerCase().includes(ql));
}

const LISTS: TaskList[] = ['today', 'upcoming', 'inbox', 'all', 'done'];

interface Command {
  help: string;
  run(args: string[], rest: string): void | Promise<void>;
  complete?: (arg: string, args: string[]) => string[];
}

const startedAt = Date.now();

export const COMMANDS: Record<string, Command> = {
  help: {
    help: 'list commands',
    run() {
      say({ text: 'palace-sh, version 1.0 · available commands:', tone: 'bright' });
      for (const [name, c] of Object.entries(COMMANDS)) if (!c.help.startsWith('(')) say(`  ${name.padEnd(9)} ${c.help}`);
      say({ text: 'tip: Tab completes, ↑/↓ recalls history, / focuses the shell.', tone: 'dim' });
    },
  },
  todo: {
    help: 'todo add <text> | ls [list] | done <pid> | undo <pid> | rm <pid>',
    complete: (arg, args) => (args.length <= 1 ? ['add', 'ls', 'done', 'undo', 'rm'] : args[0] === 'ls' ? LISTS : []).filter((x) => x.startsWith(arg)),
    run(args, rest) {
      const [sub, ...more] = args;
      const st = useStore.getState();
      if (sub === 'add') {
        const text = rest.replace(/^add\s+/, '');
        if (!text.trim()) return err('usage: todo add <text>   e.g. todo add call mom tomorrow 6pm #family !!');
        const p = parseTask(text);
        const t = st.addTask({ title: p.title, tags: p.tags, priority: p.priority, due: p.due, dueHasTime: p.dueHasTime });
        sfx.granted(1);
        say({ text: `[+] spawned ${pid(t.id)} :: ${t.title}${p.due !== undefined ? ` (due ${formatDue(p.due, p.dueHasTime)})` : ''}`, tone: 'ok' });
        return;
      }
      if (!sub || sub === 'ls') {
        const list = (more[0] as TaskList) ?? useUi.getState().taskList;
        if (!LISTS.includes(list)) return err(`todo: unknown list "${list}" (${LISTS.join('|')})`);
        useUi.getState().setTaskList(list);
        const rows = st.tasks.filter((t) => (list === 'done' ? t.done : !t.done)).sort(sortTasks).slice(0, 10);
        say({ text: `PID   PRI  TARGET`, tone: 'dim' });
        rows.forEach((t) => say(`${pid(t.id)}  ${['---', '!--', '!!-', '!!!'][t.priority]}  ${t.title}`));
        if (!rows.length) say({ text: '0 processes.', tone: 'dim' });
        jumpTo('tasks');
        return;
      }
      if (sub === 'done' || sub === 'undo') {
        const t = more[0] && findTask(more[0]);
        if (!t) return err(`todo: no such pid "${more[0] ?? ''}"`);
        if ((sub === 'done') === t.done) return say({ text: `${pid(t.id)} already ${t.done ? 'done' : 'open'}.`, tone: 'dim' });
        toggleTaskWithFx(t.id, null);
        return;
      }
      if (sub === 'rm') {
        const t = more[0] && findTask(more[0]);
        if (!t) return err(`todo: no such pid "${more[0] ?? ''}"`);
        const removed = st.deleteTask(t.id);
        sfx.denied();
        say({ text: `[-] killed ${pid(t.id)}`, tone: 'red' });
        if (removed) toast({ kind: 'info', title: `rm ${pid(removed.id)}`, action: { label: 'undo', run: () => useStore.getState().restoreTask(removed) } });
        return;
      }
      err(`todo: unknown subcommand "${sub}"`);
    },
  },
  note: {
    help: 'note new <title> | open <title>',
    complete: (arg, args) =>
      args.length <= 1
        ? ['new', 'open'].filter((x) => x.startsWith(arg))
        : Object.values(useStore.getState().notes)
            .map((n) => n.title)
            .filter((t) => t.toLowerCase().startsWith(arg.toLowerCase())),
    run(args, rest) {
      const [sub] = args;
      const title = rest.replace(/^(new|open)\s*/, '').trim();
      if (sub === 'new') {
        const n = useStore.getState().createNote({ title: title || undefined }, false);
        sfx.granted(1);
        say({ text: `[+] touched ~/vault/${n.title}.md`, tone: 'ok' });
        useTerm.getState().openNote(n.id, 'edit');
        return;
      }
      if (sub === 'open') {
        const n = title && findNote(title);
        if (!n) return err(`note: no match for "${title}"`);
        useTerm.getState().openNote(n.id);
        return;
      }
      err('usage: note new <title> | note open <title>');
    },
  },
  ls: {
    help: 'list the vault',
    run() {
      const notes = Object.values(useStore.getState().notes).sort((a, b) => (a.folder + a.title).localeCompare(b.folder + b.title));
      notes.forEach((n) => say({ text: `${n.folder ? `${n.folder}/` : ''}${n.title}.md`, tone: n.folder ? undefined : 'bright' }));
      say({ text: `${notes.length} files`, tone: 'dim' });
    },
  },
  cat: {
    help: 'open a note in the pager',
    complete: (arg) =>
      Object.values(useStore.getState().notes)
        .map((n) => n.title)
        .filter((t) => t.toLowerCase().startsWith(arg.toLowerCase())),
    run(_a, rest) {
      const n = findNote(rest.trim());
      if (!n) return err(`cat: ${rest.trim() || '?'}: No such file`);
      useTerm.getState().openNote(n.id);
    },
  },
  grep: {
    help: 'search the vault',
    run(_a, rest) {
      const q = rest.trim().replace(/^["']|["']$/g, '');
      if (!q) return err('usage: grep <pattern>');
      useUi.getState().setSearch(q);
      const hits = Object.values(useStore.getState().notes).filter((n) => (n.title + n.content).toLowerCase().includes(q.toLowerCase())).length;
      say({ text: `${hits} file${hits === 1 ? '' : 's'} match "${q}"`, tone: hits ? 'ok' : 'dim' });
      jumpTo('notes');
    },
  },
  cd: {
    help: 'jump to a section: ' + SECTIONS.map((s) => s.label).join(' '),
    complete: (arg) => Object.keys(SECTION_ALIASES).filter((k) => k.startsWith(arg)),
    run(args) {
      const id = SECTION_ALIASES[(args[0] ?? '~').replace(/^~\//, '').replace(/\/$/, '')];
      if (!id) return err(`cd: no such directory: ${args[0]}`);
      jumpTo(id);
    },
  },
  stats: {
    help: 'xp, rank and streak',
    run() {
      const st = useStore.getState();
      const lvl = levelInfo(st.xp);
      const p = todayProgress(st.tasks);
      say(
        { text: `rank     lvl ${lvl.level} ${lvl.title.toUpperCase()}`, tone: 'bright' },
        `xp       ${st.xp} (${lvl.into}/${lvl.needed} to next)`,
        `today    ${p.done}/${p.total} neutralized`,
        `streak   ${streak(st.completions)}d · kills ${st.completions.length}`,
      );
    },
  },
  whoami: {
    help: 'who you are',
    run() {
      const { settings } = useStore.getState();
      const { email } = useSync.getState();
      say(`${userHandle(settings.name)}${email ? ` <${email}>` : ' (local session)'}`);
    },
  },
  date: { help: 'current time', run: () => say(new Date().toString()) },
  uptime: {
    help: 'session uptime',
    run() {
      const s = Math.round((Date.now() - startedAt) / 1000);
      say(`up ${Math.floor(s / 60)}m ${s % 60}s, 1 user, load average: 0.42, 0.13, 0.07`);
    },
  },
  sync: {
    help: 'sync with the cloud now',
    async run() {
      if (!useSync.getState().email) return err('sync: not logged in (try: login <email>)');
      say({ text: '[*] syncing…', tone: 'blue' });
      await syncNow();
      say({ text: `[+] ${useSync.getState().status}`, tone: 'ok' });
    },
  },
  login: {
    help: 'email yourself a magic sign-in link',
    async run(args) {
      if (!args[0]) return err('usage: login <email>');
      try {
        await sendMagicLink(args[0]);
        sfx.granted(2);
        say({ text: `[+] magic link dispatched to ${args[0]}. open it in this browser.`, tone: 'ok' });
      } catch (e) {
        err(`login: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  },
  logout: {
    help: 'sign out of cloud sync',
    async run() {
      await signOut();
      say({ text: 'session closed. data stays on this device.', tone: 'dim' });
    },
  },
  notify: {
    help: 'notify on | test',
    complete: (arg) => ['on', 'test'].filter((x) => x.startsWith(arg)),
    async run(args) {
      if (args[0] === 'on') {
        const p = await requestNotificationPermission();
        say({ text: `notifications: ${p}`, tone: p === 'granted' ? 'ok' : 'red' });
      } else notify({ kind: 'info', toastKind: 'reminder', title: '⏲ test alert', body: 'reminder pipeline nominal.' });
    },
  },
  clear: { help: 'clear the screen', run: () => useTerm.getState().clearOutput() },
  history: {
    help: 'command history',
    run() {
      loadHistory().forEach((h, i) => say(`${String(i + 1).padStart(4)}  ${h}`));
    },
  },
  echo: { help: '(echo)', run: (_a, rest) => say(rest) },
  matrix: {
    help: 'toggle code rain',
    run() {
      const st = useStore.getState();
      st.setSettings({ termRain: !st.settings.termRain });
      say({ text: `code rain ${st.settings.termRain ? 'offline' : 'online'}.`, tone: 'dim' });
    },
  },
  forge: { help: 'switch to the Forge edition', run: () => void goToEdition('forge') },
  exit: { help: 'leave the terminal (to Forge)', run: () => void goToEdition('forge') },
  gateway: { help: 'choose an edition', run: () => void goToEdition('gateway') },
  sudo: {
    help: '(sudo)',
    run() {
      sfx.denied();
      document.body.classList.remove('shake');
      void document.body.offsetWidth;
      document.body.classList.add('shake');
      say({ text: `${userHandle(useStore.getState().settings.name)} is not in the sudoers file. This incident will be reported.`, tone: 'red' });
    },
  },
  rm: {
    help: '(rm)',
    run(_a, rest) {
      if (/-rf\s+\/?$/.test(rest.trim()) || rest.includes('-rf /')) return err('nice try.');
      err('rm: use "todo rm <pid>" or open a note and press d');
    },
  },
  hack: {
    help: 'hack the planet',
    async run(args) {
      const target = args[0] ?? 'procrastination.exe';
      const steps = ['[*] resolving target', '[*] scanning 65535 ports', '[*] injecting focus.dll', '[*] escalating privileges', '[*] bypassing distraction firewall'];
      for (const s of steps) {
        say({ text: `${s}… ${target}`, tone: 'dim' });
        sfx.key();
        await new Promise((r) => setTimeout(r, 260));
      }
      for (let i = 1; i <= 10; i++) {
        say({ text: `[${'#'.repeat(i)}${'.'.repeat(10 - i)}] ${i * 10}%`, tone: i === 10 ? 'bright' : 'dim' });
        await new Promise((r) => setTimeout(r, 70));
      }
      sfx.granted(4);
      say({ text: `[+] ${target} neutralized. now go finish a real task.`, tone: 'ok' });
    },
  },
};

const HISTORY_KEY = 'mp_term_history';

export function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function saveHistory(h: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-100)));
  } catch {
    /* ignore */
  }
}

function tokenize(input: string): string[] {
  return input.match(/"[^"]*"|'[^']*'|\S+/g)?.map((t) => t.replace(/^["']|["']$/g, '')) ?? [];
}

export async function runCommand(input: string) {
  const line = input.trim();
  if (!line) return;
  const h = loadHistory();
  if (h[h.length - 1] !== line) saveHistory([...h, line]);
  const name = useStore.getState().settings.name;
  say({ text: `${userHandle(name)}㉿mindpalace $ ${line}`, tone: 'blue' });
  const [cmd, ...args] = tokenize(line);
  const rest = line.slice(line.indexOf(cmd) + cmd.length).trim();
  const c = COMMANDS[cmd.toLowerCase()];
  if (!c) return err(`zsh: command not found: ${cmd}  (try: help)`);
  try {
    await c.run(args, rest);
  } catch (e) {
    err(`${cmd}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Tab completion: commands first, then the command's own argument completer. */
export function complete(input: string): string {
  const endsWithSpace = /\s$/.test(input);
  const parts = tokenize(input);
  if (parts.length <= 1 && !endsWithSpace) {
    const hits = Object.keys(COMMANDS).filter((c) => c.startsWith((parts[0] ?? '').toLowerCase()));
    if (hits.length === 1) return `${hits[0]} `;
    if (hits.length > 1) say({ text: hits.join('  '), tone: 'dim' });
    return input;
  }
  const c = COMMANDS[parts[0].toLowerCase()];
  if (!c?.complete) return input;
  const args = parts.slice(1);
  const arg = endsWithSpace ? '' : (args.pop() ?? '');
  const hits = c.complete(arg, endsWithSpace ? args : [...args, arg]);
  if (hits.length === 1) {
    const base = input.slice(0, input.length - arg.length);
    return `${base}${hits[0].includes(' ') ? `"${hits[0]}"` : hits[0]} `;
  }
  if (hits.length > 1) say({ text: hits.join('  '), tone: 'dim' });
  return input;
}
