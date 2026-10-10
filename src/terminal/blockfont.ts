/**
 * A 5-row block font for big ASCII headings, rendered with a drop shadow like figlet's
 * "ANSI Shadow": solid cells are █, their shadow (down-right) is ░.
 */
const G: Record<string, string[]> = {
  A: [' ### ', '#   #', '#####', '#   #', '#   #'],
  B: ['#### ', '#   #', '#### ', '#   #', '#### '],
  C: [' ####', '#    ', '#    ', '#    ', ' ####'],
  D: ['#### ', '#   #', '#   #', '#   #', '#### '],
  E: ['#####', '#    ', '#### ', '#    ', '#####'],
  F: ['#####', '#    ', '#### ', '#    ', '#    '],
  G: [' ####', '#    ', '#  ##', '#   #', ' ####'],
  H: ['#   #', '#   #', '#####', '#   #', '#   #'],
  I: ['###', ' # ', ' # ', ' # ', '###'],
  J: ['  ###', '   # ', '   # ', '#  # ', ' ##  '],
  K: ['#   #', '#  # ', '###  ', '#  # ', '#   #'],
  L: ['#    ', '#    ', '#    ', '#    ', '#####'],
  M: ['#   #', '## ##', '# # #', '#   #', '#   #'],
  N: ['#   #', '##  #', '# # #', '#  ##', '#   #'],
  O: [' ### ', '#   #', '#   #', '#   #', ' ### '],
  P: ['#### ', '#   #', '#### ', '#    ', '#    '],
  Q: [' ### ', '#   #', '# # #', '#  # ', ' ## #'],
  R: ['#### ', '#   #', '#### ', '#  # ', '#   #'],
  S: [' ####', '#    ', ' ### ', '    #', '#### '],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  '],
  U: ['#   #', '#   #', '#   #', '#   #', ' ### '],
  V: ['#   #', '#   #', '#   #', ' # # ', '  #  '],
  W: ['#   #', '#   #', '# # #', '## ##', '#   #'],
  X: ['#   #', ' # # ', '  #  ', ' # # ', '#   #'],
  Y: ['#   #', ' # # ', '  #  ', '  #  ', '  #  '],
  Z: ['#####', '   # ', '  #  ', ' #   ', '#####'],
  '0': [' ### ', '#  ##', '# # #', '##  #', ' ### '],
  '1': [' # ', '## ', ' # ', ' # ', '###'],
  '2': ['#### ', '    #', ' ### ', '#    ', '#####'],
  '3': ['#### ', '    #', ' ### ', '    #', '#### '],
  '4': ['#   #', '#   #', '#####', '    #', '    #'],
  '5': ['#####', '#    ', '#### ', '    #', '#### '],
  '6': [' ### ', '#    ', '#### ', '#   #', ' ### '],
  '7': ['#####', '    #', '   # ', '  #  ', '  #  '],
  '8': [' ### ', '#   #', ' ### ', '#   #', ' ### '],
  '9': [' ### ', '#   #', ' ####', '    #', ' ### '],
  ' ': ['  ', '  ', '  ', '  ', '  '],
  '/': ['    #', '   # ', '  #  ', ' #   ', '#    '],
  '-': ['   ', '   ', '###', '   ', '   '],
  '.': [' ', ' ', ' ', ' ', '#'],
  ':': [' ', '#', ' ', '#', ' '],
  '!': ['#', '#', '#', ' ', '#'],
  '>': ['#  ', ' # ', '  #', ' # ', '#  '],
  _: ['     ', '     ', '     ', '     ', '#####'],
};

export function blockText(text: string, shadow = true): string {
  const glyphs = [...text.toUpperCase()].map((c) => G[c] ?? G[' ']);
  const rows = 5;
  const lines = Array.from({ length: rows }, (_, r) => glyphs.map((g) => g[r]).join(' '));
  const width = lines[0].length;
  const H = rows + (shadow ? 1 : 0);
  const W = width + (shadow ? 1 : 0);
  const grid: string[][] = Array.from({ length: H }, () => Array<string>(W).fill(' '));
  if (shadow) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < width; c++) if (lines[r][c] === '#') grid[r + 1][c + 1] = '░';
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < width; c++) if (lines[r][c] === '#') grid[r][c] = '█';
  return grid.map((row) => row.join('').replace(/\s+$/, '')).join('\n');
}

const NOISE = '█▓▒░#@$%&01<>/';

/**
 * "Decrypt" a block: every visible cell flickers through noise and locks in, sweeping left to
 * right with jitter. Returns a renderer for progress p in [0, 1].
 */
export function decryptFrames(target: string): (p: number) => string {
  const lines = target.split('\n');
  const width = Math.max(...lines.map((l) => l.length));
  const thresholds = lines.map((l) => [...l].map((_, c) => (c / width) * 0.75 + Math.random() * 0.25));
  return (p: number) =>
    lines
      .map((l, r) =>
        [...l]
          .map((ch, c) => {
            if (ch === ' ') return ' ';
            const t = thresholds[r][c];
            if (p >= t) return ch;
            if (p < t - 0.35) return ' ';
            return NOISE[(Math.random() * NOISE.length) | 0];
          })
          .join(''),
      )
      .join('\n');
}
