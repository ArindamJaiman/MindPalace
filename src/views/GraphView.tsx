import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { Hash, ListTodo, LocateFixed, Tag } from 'lucide-react';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { navigate } from '../hooks/useRoute';
import { extractLinks, extractTags, findNoteByTitle, tagColor } from '../lib/links';
import { sfx } from '../lib/sound';

type Kind = 'note' | 'ghost' | 'tag' | 'task';

interface GNode extends SimulationNodeDatum {
  id: string;
  label: string;
  kind: Kind;
  degree: number;
  ref?: string;
  done?: boolean;
}

type GLink = SimulationLinkDatum<GNode> & { source: string | GNode; target: string | GNode };

/** Colours and shapes for the graph; editions override the defaults. */
export interface GraphPalette {
  note?: string;
  focus: string;
  ghost: string;
  task: string;
  taskDone: string;
  link: string;
  linkDim: string;
  spark: string;
  label: string;
  labelGhost: string;
  ghostHole: string;
  font: string;
  square: boolean;
  tagColor?: (tag: string) => string;
}

const DEFAULT_PALETTE: GraphPalette = {
  focus: '#ffffff',
  ghost: '#5a616b',
  task: '#22d3ee',
  taskDone: '#3ddc84',
  link: 'rgba(190,200,215,0.12)',
  linkDim: 'rgba(255,255,255,0.035)',
  spark: '#ffffff',
  label: '#d0d6dd',
  labelGhost: '#7d858f',
  ghostHole: 'rgba(6,7,8,0.95)',
  font: 'Inter, sans-serif',
  square: false,
};

interface Props {
  focusId?: string;
  compact?: boolean;
  showTags?: boolean;
  showTasks?: boolean;
  palette?: Partial<GraphPalette>;
  /** Override what clicking a node does (default: open it in the Forge views). */
  onActivate?: (node: { kind: Kind; ref?: string; label: string }) => void;
}

const positions = new Map<string, { x: number; y: number }>();

function useGraphData({ focusId, showTags, showTasks }: Props) {
  const notes = useStore((s) => s.notes);
  const tasks = useStore((s) => s.tasks);

  return useMemo(() => {
    const nodes = new Map<string, GNode>();
    const links: { source: string; target: string }[] = [];
    const seen = new Set<string>();
    const addLink = (a: string, b: string) => {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (a === b || seen.has(key)) return;
      seen.add(key);
      links.push({ source: a, target: b });
    };

    for (const n of Object.values(notes)) nodes.set(n.id, { id: n.id, label: n.title, kind: 'note', degree: 0, ref: n.id });

    for (const n of Object.values(notes)) {
      for (const l of extractLinks(n.content)) {
        if (/\.(png|jpe?g|gif|webp|svg|pdf)$/i.test(l.target)) continue;
        const target = findNoteByTitle(notes, l.target);
        if (target) addLink(n.id, target.id);
        else {
          const gid = `ghost:${l.target.toLowerCase()}`;
          if (!nodes.has(gid)) nodes.set(gid, { id: gid, label: l.target, kind: 'ghost', degree: 0, ref: l.target });
          addLink(n.id, gid);
        }
      }
      if (showTags) {
        for (const t of extractTags(n.content)) {
          const tid = `tag:${t}`;
          if (!nodes.has(tid)) nodes.set(tid, { id: tid, label: `#${t}`, kind: 'tag', degree: 0, ref: t });
          addLink(n.id, tid);
        }
      }
    }

    if (showTasks) {
      for (const t of tasks) {
        const targets = [...t.title.matchAll(/\[\[([^\]|#]+)/g)].map((m) => findNoteByTitle(notes, m[1])).filter(Boolean);
        if (!targets.length) continue;
        const id = `task:${t.id}`;
        nodes.set(id, { id, label: t.title.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b ?? a), kind: 'task', degree: 0, ref: t.id, done: t.done });
        for (const n of targets) addLink(id, n!.id);
      }
    }

    for (const l of links) {
      nodes.get(l.source)!.degree++;
      nodes.get(l.target)!.degree++;
    }

    let nodeList = [...nodes.values()];
    let linkList = links;
    if (focusId) {
      const keep = new Set([focusId]);
      for (const l of links) {
        if (l.source === focusId) keep.add(l.target);
        if (l.target === focusId) keep.add(l.source);
      }
      nodeList = nodeList.filter((n) => keep.has(n.id));
      linkList = links.filter((l) => keep.has(l.source) && keep.has(l.target));
    }
    const signature = nodeList.map((n) => n.id + n.label).join(',') + '#' + linkList.map((l) => l.source + '>' + l.target).join(',');
    return { nodes: nodeList, links: linkList, signature };
  }, [notes, tasks, focusId, showTags, showTasks]);
}

export function GraphCanvas(props: Props) {
  const { focusId, compact } = props;
  const data = useGraphData(props);
  const storeAccent = useStore((s) => s.settings.accent);
  const pal: GraphPalette = { ...DEFAULT_PALETTE, ...props.palette };
  const accent = pal.note ?? storeAccent;
  const palRef = useRef(pal);
  palRef.current = pal;
  const activateRef = useRef(props.onActivate);
  activateRef.current = props.onActivate;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const simRef = useRef<Simulation<GNode, GLink> | null>(null);
  const nodesRef = useRef<GNode[]>([]);
  const linksRef = useRef<GLink[]>([]);
  const view = useRef({ k: 1, x: 0, y: 0 });
  const hoverRef = useRef<GNode | null>(null);

  // (Re)build the simulation only when the graph's shape changes, not on every keystroke.
  useEffect(() => {
    const { nodes, links } = dataRef.current;
    const prev = new Map(nodesRef.current.map((n) => [n.id, n]));
    const simNodes: GNode[] = nodes.map((n) => {
      const old = prev.get(n.id) ?? positions.get(n.id);
      return { ...n, x: old?.x ?? (Math.random() - 0.5) * 40, y: old?.y ?? (Math.random() - 0.5) * 40 };
    });
    const simLinks: GLink[] = links.map((l) => ({ ...l }));
    nodesRef.current = simNodes;
    linksRef.current = simLinks;
    simRef.current?.stop();
    const sim = forceSimulation<GNode, GLink>(simNodes)
      .force('link', forceLink<GNode, GLink>(simLinks).id((d) => d.id).distance(compact ? 78 : 80).strength(0.6))
      .force('charge', forceManyBody().strength(compact ? -260 : -260))
      .force('center', forceCenter(0, 0))
      .force('x', forceX(0).strength(0.04))
      .force('y', forceY(0).strength(0.04))
      .force('collide', forceCollide<GNode>().radius((d) => radius(d) + 6))
      .alpha(prev.size ? 0.5 : 1)
      .alphaDecay(0.025);
    sim.stop(); // we tick manually inside the render loop
    simRef.current = sim;
    return () => {
      for (const n of simNodes) if (n.x !== undefined && n.y !== undefined) positions.set(n.id, { x: n.x, y: n.y });
    };
  }, [data.signature, compact]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ro = new ResizeObserver(() => {
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    });
    ro.observe(wrap);

    const toWorld = (sx: number, sy: number) => ({
      x: (sx - w / 2 - view.current.x) / view.current.k,
      y: (sy - h / 2 - view.current.y) / view.current.k,
    });
    const hit = (sx: number, sy: number): GNode | null => {
      const p = toWorld(sx, sy);
      let best: GNode | null = null;
      let bestD = Infinity;
      for (const n of nodesRef.current) {
        const d = Math.hypot((n.x ?? 0) - p.x, (n.y ?? 0) - p.y);
        const r = radius(n) + 6 / view.current.k;
        if (d < r && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    };

    let drag: { node: GNode | null; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null = null;

    const onDown = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const node = hit(sx, sy);
      drag = { node, sx, sy, vx: view.current.x, vy: view.current.y, moved: false };
      canvas.setPointerCapture(e.pointerId);
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
        simRef.current?.alphaTarget(0.3);
      }
    };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      if (drag) {
        if (Math.hypot(sx - drag.sx, sy - drag.sy) > 4) drag.moved = true;
        if (drag.node) {
          const p = toWorld(sx, sy);
          drag.node.fx = p.x;
          drag.node.fy = p.y;
        } else {
          view.current.x = drag.vx + (sx - drag.sx);
          view.current.y = drag.vy + (sy - drag.sy);
        }
        return;
      }
      const n = hit(sx, sy);
      if (n !== hoverRef.current) {
        hoverRef.current = n;
        if (n) sfx.tick();
        canvas.style.cursor = n ? 'pointer' : 'grab';
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      const { node, moved } = drag;
      drag = null;
      canvas.releasePointerCapture(e.pointerId);
      simRef.current?.alphaTarget(0);
      if (node) {
        node.fx = null;
        node.fy = null;
        if (!moved) (activateRef.current ?? activate)(node);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left - w / 2;
      const sy = e.clientY - r.top - h / 2;
      const v = view.current;
      const k = Math.min(4, Math.max(0.2, v.k * Math.exp(-e.deltaY * 0.0015)));
      v.x = sx - ((sx - v.x) * k) / v.k;
      v.y = sy - ((sy - v.y) * k) / v.k;
      v.k = k;
    };
    const onLeave = () => {
      hoverRef.current = null;
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let raf = 0;
    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      const sim = simRef.current;
      if (sim && sim.alpha() > sim.alphaMin()) sim.tick();
      if (!w || !h) return;
      const v = view.current;
      const P = palRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2 + v.x, h / 2 + v.y);
      ctx.scale(v.k, v.k);

      const hover = hoverRef.current;
      const neighbors = new Set<string>();
      if (hover) {
        neighbors.add(hover.id);
        for (const l of linksRef.current) {
          const s = l.source as GNode;
          const t = l.target as GNode;
          if (s.id === hover.id) neighbors.add(t.id);
          if (t.id === hover.id) neighbors.add(s.id);
        }
      }

      // links
      ctx.lineWidth = 1 / Math.sqrt(v.k);
      for (const l of linksRef.current) {
        const s = l.source as GNode;
        const t = l.target as GNode;
        const lit = hover && (s.id === hover.id || t.id === hover.id);
        ctx.strokeStyle = lit ? accent : hover ? P.linkDim : P.link;
        ctx.globalAlpha = lit ? 0.9 : 1;
        ctx.beginPath();
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(t.x!, t.y!);
        ctx.stroke();
        if (lit) {
          // little sparks flowing along highlighted links
          for (let i = 0; i < 2; i++) {
            const f = (time * 0.0006 + i * 0.5) % 1;
            const fromHover = s.id === hover!.id;
            const px = fromHover ? s.x! + (t.x! - s.x!) * f : t.x! + (s.x! - t.x!) * f;
            const py = fromHover ? s.y! + (t.y! - s.y!) * f : t.y! + (s.y! - t.y!) * f;
            ctx.fillStyle = P.spark;
            ctx.beginPath();
            ctx.arc(px, py, 1.8 / Math.sqrt(v.k), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;

      // nodes
      for (const n of nodesRef.current) {
        const isFocus = n.id === focusId;
        const lit = !hover || neighbors.has(n.id);
        let r = radius(n);
        if (isFocus) r += Math.sin(time * 0.004) * 1.2 + 1;
        if (n === hover) r += 2;
        ctx.globalAlpha = lit ? 1 : 0.18;
        const color = nodeColor(n, accent, isFocus, P);
        if ((hover && neighbors.has(n.id)) || isFocus) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 16;
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        if (P.square) ctx.rect(n.x! - r, n.y! - r, r * 2, r * 2);
        else ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
        ctx.fill();
        if (n.kind === 'ghost') {
          ctx.fillStyle = P.ghostHole;
          ctx.beginPath();
          if (P.square) ctx.rect(n.x! - r * 0.55, n.y! - r * 0.55, r * 1.1, r * 1.1);
          else ctx.arc(n.x!, n.y!, r * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }

      // labels
      const labelAlpha = compact ? 1 : Math.min(1, Math.max(0, (v.k - 0.55) * 2));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const fontSize = (compact ? 10 : 11.5) / Math.max(0.8, Math.sqrt(v.k));
      ctx.font = `500 ${fontSize}px ${P.font}`;
      for (const n of nodesRef.current) {
        const show = hover ? neighbors.has(n.id) : labelAlpha > 0.02 || n.id === focusId;
        if (!show) continue;
        ctx.globalAlpha = hover ? (n === hover ? 1 : 0.85) : n.id === focusId ? 1 : labelAlpha * 0.8;
        ctx.fillStyle = n === hover ? '#fff' : n.kind === 'ghost' ? P.labelGhost : P.label;
        const label = n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label;
        ctx.fillText(label, n.x!, n.y! + radius(n) + 4);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [accent, focusId, compact]);

  return (
    <div ref={wrapRef} className={`graph-canvas${compact ? ' compact' : ''}`}>
      <canvas ref={canvasRef} />
      {compact && data.nodes.length <= 1 && <div className="graph-empty-hint">No links yet</div>}
    </div>
  );
}

function radius(n: GNode): number {
  if (n.kind === 'note') return 4.5 + Math.sqrt(n.degree) * 2.4;
  if (n.kind === 'tag') return 3.5 + Math.sqrt(n.degree);
  return 3.5;
}

function nodeColor(n: GNode, accent: string, focus: boolean, P: GraphPalette): string {
  if (focus) return P.focus;
  switch (n.kind) {
    case 'note':
      return accent;
    case 'ghost':
      return P.ghost;
    case 'tag':
      return (P.tagColor ?? tagColor)(n.ref ?? n.label);
    case 'task':
      return n.done ? P.taskDone : P.task;
  }
}

function activate(n: GNode) {
  const st = useStore.getState();
  sfx.pop(1.1);
  if (n.kind === 'note' && n.ref) {
    st.openNote(n.ref);
    navigate('notes');
  } else if (n.kind === 'ghost' && n.ref) {
    st.openOrCreateByTitle(n.ref);
    navigate('notes');
  } else if (n.kind === 'tag' && n.ref) {
    useUi.getState().setSearch(`#${n.ref}`);
    useUi.getState().setTagFilter(n.ref);
    st.setSettings({ leftOpen: true });
  } else if (n.kind === 'task') {
    navigate('tasks');
  }
}

export function GraphView() {
  const [showTags, setShowTags] = useState(false);
  const [showTasks, setShowTasks] = useState(true);
  const notes = useStore((s) => s.notes);
  const [resetKey, setResetKey] = useState(0);
  const count = Object.keys(notes).length;

  return (
    <div className="view graph-view">
      <GraphCanvas key={resetKey} showTags={showTags} showTasks={showTasks} />
      <motion.div className="graph-hud" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="graph-title">
          <h1>Graph</h1>
          <span>{count} notes · scroll to zoom · drag to pan · click to open</span>
        </div>
        <div className="graph-controls">
          <button className={`toggle-pill${showTags ? ' on' : ''}`} onClick={() => setShowTags((v) => !v)}>
            <Tag size={13} /> Tags
          </button>
          <button className={`toggle-pill${showTasks ? ' on' : ''}`} onClick={() => setShowTasks((v) => !v)}>
            <ListTodo size={13} /> Tasks
          </button>
          <button className="toggle-pill" onClick={() => setResetKey((k) => k + 1)} title="Re-center">
            <LocateFixed size={13} /> Recenter
          </button>
        </div>
      </motion.div>
      <div className="graph-legend">
        <span>
          <i style={{ background: 'var(--accent)' }} /> note
        </span>
        <span>
          <i className="ghost" /> not created yet
        </span>
        {showTasks && (
          <span>
            <i style={{ background: '#22d3ee' }} /> task
          </span>
        )}
        {showTags && (
          <span>
            <Hash size={11} /> tag
          </span>
        )}
      </div>
    </div>
  );
}
