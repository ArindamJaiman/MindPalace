import { useMemo, useRef, useState } from 'react';
import { gsap, useGSAP } from '../gsap';
import { SectionHead } from '../components/SectionHead';
import { GraphCanvas, type GraphPalette } from '../../views/GraphView';
import { useStore } from '../../store/store';
import { useUi } from '../../store/ui';
import { extractLinks } from '../../lib/links';
import { scrollToSection, useTerm } from '../state';

const PALETTE: Partial<GraphPalette> = {
  note: '#e5e5e5',
  focus: '#ff2b2b',
  ghost: '#525252',
  task: '#2f7bff',
  taskDone: '#737373',
  link: 'rgba(200,200,200,0.14)',
  linkDim: 'rgba(255,255,255,0.03)',
  spark: '#ff2b2b',
  label: '#a3a3a3',
  labelGhost: '#525252',
  ghostHole: '#000',
  font: '"JetBrains Mono", monospace',
  square: true,
  tagColor: () => '#ff2b2b',
};

export function NetSection({ reduce }: { reduce: boolean }) {
  const [showTags, setShowTags] = useState(false);
  const notes = useStore((s) => s.notes);
  const root = useRef<HTMLElement>(null);
  const { hosts, links } = useMemo(() => {
    const list = Object.values(notes);
    return { hosts: list.length, links: list.reduce((n, x) => n + extractLinks(x.content).length, 0) };
  }, [notes]);

  useGSAP(
    () => {
      if (reduce) return;
      gsap.from('.net-frame', {
        clipPath: 'inset(50% 0 50% 0)',
        duration: 0.9,
        ease: 'expo.out',
        scrollTrigger: { trigger: '.net-frame', start: 'top 80%', once: true },
      });
    },
    { scope: root, dependencies: [] },
  );

  return (
    <section className="sec" id="sec-net" ref={root}>
      <SectionHead index="04" title="NETMAP" path="~/netmap" cmd="nmap -sn 10.0.palace.0/24 --links" reduce={reduce} />
      <pre className="net-out dim">
        Starting Nmap 7.95 ( mindpalace ) {'\n'}
        Nmap scan report: <span className="bright">{hosts} hosts up</span>, {links} links traced. click a host to open it.
      </pre>
      <div className="net-tools">
        <button className={`flag${showTags ? ' on' : ''}`} onClick={() => setShowTags((v) => !v)}>
          --tags
        </button>
        <span className="dim">scroll = zoom · drag = pan · ■ red = tag · ■ blue = task</span>
      </div>
      <div className="net-frame">
        <GraphCanvas
          showTags={showTags}
          showTasks
          palette={PALETTE}
          onActivate={(n) => {
            const st = useStore.getState();
            if (n.kind === 'note' && n.ref) useTerm.getState().openNote(n.ref);
            else if (n.kind === 'ghost' && n.ref) useTerm.getState().openNote(st.openOrCreateByTitle(n.ref));
            else if (n.kind === 'tag' && n.ref) {
              useUi.getState().setSearch(`#${n.ref}`);
              scrollToSection('notes');
            } else if (n.kind === 'task') scrollToSection('tasks');
          }}
        />
        <div className="net-scan" />
      </div>
    </section>
  );
}
