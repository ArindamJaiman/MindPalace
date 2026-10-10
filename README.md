# MindPalace

A todo list and second brain that's meant to feel good to use. You get Obsidian-style linked notes, natural-language tasks, a progress "orbit", and a fidget lab for when your brain needs a break.

## Features

- **Tasks**: plain-English quick add (`Call mom tomorrow 6pm #family !!`), due dates, reminders, priorities and tags. Completing a task gives you sound, particles, XP, combos, levels and streaks.
- **Notes**: Markdown with `[[wikilinks]]`, `![[embeds]]`, `#tags`, `> [!callouts]`, clickable checkboxes, backlinks, an outline and tabs. Edit, split or read view.
- **Uploading**: drag `.md`/`.txt` files, images or whole folders (an Obsidian vault works too) anywhere on the window. You can also paste images straight into a note.
- **Graph**: a force-directed map of how your notes, tags and tasks connect.
- **Orbit**: each finished task becomes a planet. Rings are days and position is the time of day. The sun grows as you clear today.
- **Fidget Lab**: a pop-it, a fidget spinner, Blobby the jelly, and a switchboard with a big red button.
- **Cursor**: a comet or ribbon trail, a springy ring that morphs around buttons, and magnetic icons.
- **Notifications**: an in-app inbox, toasts and desktop notifications for reminders. The service worker is ready for Web Push.
- **Command palette** (`Ctrl+K`) and keyboard shortcuts (`Alt+1`…`Alt+6`, `Alt+N`, `Alt+T`, `Ctrl+E`).

Data is stored locally in IndexedDB. Cloud sync is optional.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

## Stack

React 19, TypeScript, Vite, Zustand (persisted to IndexedDB), framer-motion, CodeMirror 6, marked + DOMPurify, d3-force. Sounds are synthesized live with the Web Audio API, so there are no audio files.
