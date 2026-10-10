import { motion } from 'framer-motion';
import { useStore } from '../store/store';
import { PopIt } from '../fidgets/PopIt';
import { Spinner } from '../fidgets/Spinner';
import { SwitchBoard } from '../fidgets/SwitchBoard';
import { Jelly } from '../fidgets/Jelly';

const CARDS = [
  { id: 'popit', title: 'Pop-it', hint: 'Hold and swipe to pop a whole row. Pop them all to flip it.', el: <PopIt /> },
  { id: 'spinner', title: 'Spinner', hint: 'Grab it and flick. How high can the RPM go?', el: <Spinner /> },
  { id: 'jelly', title: 'Blobby', hint: 'Poke, pull and squish. Blobby is watching you.', el: <Jelly /> },
  { id: 'switches', title: 'Switchboard', hint: 'Clicky switches, a notched knob and THE button.', el: <SwitchBoard /> },
];

export function FidgetView() {
  const f = useStore((s) => s.fidget);
  const stats = [
    { label: 'pops', value: f.pops },
    { label: 'flips', value: f.flips },
    { label: 'best RPM', value: f.bestRpm },
    { label: 'squishes', value: f.squishes },
    { label: 'switches', value: f.switches },
    { label: 'presses', value: f.buttonPresses },
  ];

  return (
    <div className="view fidget-view">
      <header className="fidget-head">
        <div>
          <h1>Fidget Lab</h1>
          <p>Brain full? Two minutes in here, then back to it.</p>
        </div>
        <div className="fidget-stats">
          {stats.map((s) => (
            <div key={s.label} className="fidget-stat">
              <motion.span key={s.value} className="fidget-stat-v" initial={{ y: -8, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }}>
                {s.value.toLocaleString()}
              </motion.span>
              <span className="fidget-stat-l">{s.label}</span>
            </div>
          ))}
        </div>
      </header>
      <div className="fidget-grid">
        {CARDS.map((c, i) => (
          <motion.section
            key={c.id}
            className={`fidget-card card-${c.id}`}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.07, type: 'spring', stiffness: 260, damping: 24 }}
          >
            <div className="fidget-card-head">
              <h2>{c.title}</h2>
              <span>{c.hint}</span>
            </div>
            <div className="fidget-stage">{c.el}</div>
          </motion.section>
        ))}
      </div>
    </div>
  );
}
