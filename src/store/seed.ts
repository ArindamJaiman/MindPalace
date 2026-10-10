import type { Note, Task } from './types';
import { DAY, startOfDay } from '../lib/dates';

const WELCOME = `# Welcome to your MindPalace ✨

This is your second brain with a dopamine drip. Everything is stored **locally in your browser**.

> [!tip] Start here
> Open **Tasks** (\`Alt+1\`) and tick something off. Watch what happens.

## What lives here
- **Tasks** that understand plain English: \`Read 20 pages tomorrow 9pm #books !!\`
- **Notes** that link like Obsidian: type \`[[\` to link another note, like [[How linking works]]
- A **Graph** of how your ideas connect (\`Alt+3\`)
- An **Orbit** that turns finished tasks into planets (\`Alt+4\`)
- A **Fidget Lab** for when your brain needs a break (\`Alt+5\`)

## Dropping files in
Drag any \`.md\`, \`.txt\` or image file **anywhere on the window**. Markdown becomes notes and images get embedded. You can also paste images straight into a note.

## Try these
- [ ] Open [[Shortcuts]]
- [x] Find your MindPalace
- [ ] Press \`Ctrl+K\` and search for anything

#welcome #start
`;

const LINKING = `# How linking works

Notes connect with **wikilinks**. Wrap a note's title in double brackets: [[Welcome to MindPalace]].

- Link with a different label: [[Shortcuts|my cheat sheet]]
- Link to a note that doesn't exist yet: [[Someday ideas]]. Click it to create it.
- Embed another note inline with \`![[Note title]]\`
- Embed an image you dropped in with \`![[photo.png]]\`

Every link shows up in the **Backlinks** panel on the right and as a line in the **Graph**.

## Callouts
> [!note] A note callout
> Use \`> [!note]\`, \`[!tip]\`, \`[!warning]\`, \`[!success]\` or \`[!quote]\`.

> [!warning] Heads up
> Callouts are great for things you'll want to spot at a glance.

## Tags
Write #tags anywhere. Click one to search for everything with that tag.

#guide
`;

const SHORTCUTS = `# Shortcuts

| Keys | What it does |
| --- | --- |
| \`Ctrl+K\` | Command palette & quick switcher |
| \`Alt+1\` … \`Alt+6\` | Tasks, Notes, Graph, Orbit, Fidget Lab, Settings |
| \`Alt+N\` | New note |
| \`Alt+T\` | New task |
| \`Ctrl+E\` | Toggle edit / reading view |
| \`Ctrl+\\\` | Toggle the right panel |
| \`Ctrl+S\` | Saved automatically, but it feels nice |

Back to [[Welcome to MindPalace]].

#guide
`;

const IDEAS = `# Someday ideas

A parking lot for thoughts that aren't tasks yet.

- Build a reading tracker that links to [[How linking works]]
- Learn to juggle (the Fidget Lab counts as practice)
- Weekend hike?

> [!quote]
> The palest ink is better than the best memory.

#ideas
`;

export function seedNotes(now = Date.now()): Record<string, Note> {
  const list: Note[] = [
    { id: 'welcome', title: 'Welcome to MindPalace', content: WELCOME, folder: '', createdAt: now, updatedAt: now },
    { id: 'linking', title: 'How linking works', content: LINKING, folder: 'Guides', createdAt: now - 1000, updatedAt: now - 1000 },
    { id: 'shortcuts', title: 'Shortcuts', content: SHORTCUTS, folder: 'Guides', createdAt: now - 2000, updatedAt: now - 2000 },
    { id: 'ideas', title: 'Someday ideas', content: IDEAS, folder: 'Inbox', createdAt: now - 3000, updatedAt: now - 3000 },
  ];
  return Object.fromEntries(list.map((n) => [n.id, n]));
}

export function seedTasks(now = Date.now()): Task[] {
  const today = startOfDay(now);
  const base = { details: '', done: false, createdAt: now } as const;
  return [
    { ...base, id: 't1', title: 'Tick this box and feel the dopamine', priority: 3, tags: ['start'], due: today, dueHasTime: false },
    { ...base, id: 't2', title: 'Pop every bubble in the Fidget Lab', priority: 1, tags: ['fun'], due: today, dueHasTime: false },
    { ...base, id: 't3', title: 'Drag a .md file onto the window to import it', priority: 2, tags: ['start'], due: today, dueHasTime: false },
    { ...base, id: 't4', title: 'Read [[How linking works]]', priority: 1, tags: ['learn'], due: today + DAY, dueHasTime: false },
    { ...base, id: 't5', title: 'Plan the week', priority: 2, tags: ['planning'], due: today + 3 * DAY + 10 * 3_600_000, dueHasTime: true },
    { ...base, id: 't6', title: 'Turn on notifications in Settings', priority: 0, tags: ['setup'] },
  ];
}
