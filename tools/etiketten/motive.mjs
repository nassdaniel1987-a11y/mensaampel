// Cheerful card motifs as SVG (viewBox 0 0 100 100), built from simple shapes so they print the same everywhere.
// Every number gets its own motif; within one room no motif repeats (64 combinations per theme).
const INK = '#2b2d42';
const O = `stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`;
const c = (x, y, r, fill, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const e = (x, y, rx, ry, fill, extra = '') =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const p = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const mirror = s => `<g transform="translate(100 0) scale(-1 1)">${s}</g>`;
const both = s => s + mirror(s);

export const PALETTE = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac'];
export const PASTEL = ['#ffe3e3', '#fff0d9', '#fff9db', '#ebfbee', '#e6fcf5', '#e7f5ff', '#f3f0ff', '#fff0f6'];

// Friendly face parts.
const eyes = (y, dx, r = 4.2) =>
  both(`${e(50 - dx, y, r, r * 1.2, INK)}${c(50 - dx + r * 0.35, y - r * 0.45, r * 0.38, '#fff')}`);
const cheeks = (y, dx) => both(c(50 - dx, y, 4.5, '#ff8fab', 'opacity="0.55"'));
const smile = (y, w = 7) => p(`M${50 - w} ${y} Q50 ${y + w * 0.9} ${50 + w} ${y}`, 'none', O);

// Animals: head drawing plus where accessories go (top of head, eye line and spacing).
const ANIMALS = [
  {
    name: 'Fuchs',
    top: 22,
    eyeY: 46,
    dx: 12,
    draw: () =>
      both(p('M22 40 L22 8 L44 26Z', '#f28c28', O) + p('M26 32 L26 17 L38 27Z', '#ffe8cc')) +
      p('M16 42 Q18 22 50 22 Q82 22 84 42 Q80 70 50 84 Q20 70 16 42Z', '#f28c28', O) +
      p('M28 58 Q50 48 72 58 Q62 78 50 84 Q38 78 28 58Z', '#fff4e6') +
      e(50, 62, 5, 3.6, INK) +
      eyes(46, 12) +
      smile(68, 5),
  },
  {
    name: 'Katze',
    top: 26,
    eyeY: 52,
    dx: 12,
    draw: () =>
      both(p('M22 44 L24 12 L46 30Z', '#b197fc', O) + p('M27 36 L28 20 L39 30Z', '#ffdeeb')) +
      c(50, 56, 30, '#b197fc', O) +
      eyes(52, 12) +
      p('M46 60 L54 60 L50 65Z', '#f783ac') +
      smile(66, 5) +
      both(p('M12 60 L32 62 M12 68 L32 66', 'none', `stroke="${INK}" stroke-width="1.6" stroke-linecap="round"`)) +
      cheeks(64, 20),
  },
  {
    name: 'Hund',
    top: 24,
    eyeY: 50,
    dx: 12,
    draw: () =>
      c(50, 54, 29, '#e8a65d', O) +
      both(e(24, 50, 9, 20, '#8a5a2b', `${O} transform="rotate(18 24 50)"`)) +
      e(50, 68, 15, 11, '#fff4e6') +
      e(50, 62, 6, 4.4, INK) +
      eyes(48, 12) +
      p('M46 72 Q50 82 54 72Z', '#ff6b81', O),
  },
  {
    name: 'Bär',
    top: 26,
    eyeY: 50,
    dx: 13,
    draw: () =>
      both(c(26, 30, 11, '#a0673c', O) + c(26, 30, 5.5, '#e3b38a')) +
      c(50, 56, 30, '#a0673c', O) +
      e(50, 66, 13, 10, '#e3b38a') +
      e(50, 62, 5.5, 4, INK) +
      eyes(50, 13) +
      smile(69, 4.5),
  },
  {
    name: 'Hase',
    top: 34,
    eyeY: 58,
    dx: 11,
    draw: () =>
      both(e(38, 22, 7.5, 20, '#f8f9fa', O) + e(38, 23, 3.5, 14, '#ffc9de')) +
      c(50, 62, 26, '#f8f9fa', O) +
      eyes(57, 11) +
      e(50, 65, 3.6, 2.8, '#f783ac') +
      p('M46.5 72 h7 v6 h-7Z', '#fff', O) +
      smile(69, 4) +
      cheeks(67, 17),
  },
  {
    name: 'Frosch',
    top: 26,
    eyeY: 36,
    dx: 18,
    draw: () =>
      both(c(32, 36, 13, '#69db7c', O)) +
      e(50, 62, 36, 24, '#69db7c', O) +
      both(c(32, 36, 8, '#fff') + c(33, 37, 4.6, INK) + c(34.5, 35.5, 1.6, '#fff')) +
      p('M30 64 Q50 80 70 64', 'none', O) +
      cheeks(64, 26),
  },
  {
    name: 'Eule',
    top: 20,
    eyeY: 48,
    dx: 14,
    draw: () =>
      both(p('M22 34 L20 12 L38 26Z', '#9c6644', O)) +
      p('M18 40 Q18 20 50 20 Q82 20 82 40 L80 70 Q50 90 20 70Z', '#9c6644', O) +
      both(c(36, 48, 12, '#fff', O) + c(37, 49, 5.6, INK) + c(38.8, 47, 1.9, '#fff')) +
      p('M45 60 L55 60 L50 70Z', '#ffa94d', O) +
      p('M34 76 Q42 72 50 76 Q58 72 66 76', 'none', `stroke="#e6ccb2" stroke-width="2.4" fill="none"`),
  },
  {
    name: 'Schwein',
    top: 26,
    eyeY: 48,
    dx: 13,
    draw: () =>
      both(p('M24 38 L20 16 L40 28Z', '#f7a8b8', O)) +
      c(50, 56, 30, '#f7a8b8', O) +
      e(50, 64, 12, 8.5, '#f48fb1', O) +
      both(e(46, 64, 2, 3, INK)) +
      eyes(48, 13) +
      smile(74, 5),
  },
  {
    name: 'Panda',
    top: 26,
    eyeY: 50,
    dx: 13,
    draw: () =>
      both(c(26, 30, 11, INK)) +
      c(50, 56, 30, '#fff', O) +
      both(e(37, 50, 8, 10, INK, 'transform="rotate(-25 37 50)"') + c(38, 49, 3.2, '#fff') + c(38.8, 48.2, 1.4, INK)) +
      e(50, 62, 5, 3.6, INK) +
      smile(68, 4.5) +
      cheeks(66, 20),
  },
  {
    name: 'Maus',
    top: 36,
    eyeY: 58,
    dx: 10,
    draw: () =>
      both(c(24, 32, 16, '#ced4da', O) + c(24, 32, 9, '#ffc9de')) +
      c(50, 60, 24, '#ced4da', O) +
      eyes(56, 10) +
      c(50, 66, 3.6, '#f783ac', O) +
      smile(71, 4) +
      both(p('M20 64 L36 66 M20 71 L36 69', 'none', `stroke="${INK}" stroke-width="1.5" stroke-linecap="round"`)),
  },
  {
    name: 'Löwe',
    top: 14,
    eyeY: 50,
    dx: 11,
    draw: () =>
      Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return c((50 + 30 * Math.cos(a)).toFixed(1), (54 + 30 * Math.sin(a)).toFixed(1), 11, '#e8590c', O);
      }).join('') +
      c(50, 54, 30, '#e8590c') +
      c(50, 55, 23, '#ffd43b', O) +
      e(50, 62, 4.6, 3.4, INK) +
      eyes(50, 10) +
      smile(67, 4.5) +
      cheeks(63, 15),
  },
  {
    name: 'Pinguin',
    top: 24,
    eyeY: 50,
    dx: 11,
    draw: () =>
      p('M20 58 Q18 24 50 24 Q82 24 80 58 Q78 86 50 86 Q22 86 20 58Z', '#343a40', O) +
      p('M50 40 Q34 34 30 50 Q28 76 50 80 Q72 76 70 50 Q66 34 50 40Z', '#fff') +
      eyes(52, 10) +
      p('M43 60 L57 60 L50 69Z', '#ffa94d', O) +
      cheeks(64, 15),
  },
  {
    name: 'Küken',
    top: 22,
    eyeY: 50,
    dx: 12,
    draw: () =>
      p('M46 24 Q44 12 50 14 Q52 8 56 14 Q60 12 56 24', '#ffd43b', O) +
      c(50, 56, 31, '#ffe066', O) +
      eyes(50, 12) +
      p('M42 60 L58 60 L50 70Z', '#ff922b', O) +
      cheeks(62, 21) +
      both(p('M16 64 Q8 70 18 76', 'none', O)),
  },
  {
    name: 'Kuh',
    top: 22,
    eyeY: 46,
    dx: 13,
    draw: () =>
      both(p('M30 28 Q24 12 16 16 Q22 20 24 32Z', '#ffe8cc', O) + e(14, 42, 10, 5.5, '#fff', O)) +
      p('M20 40 Q20 22 50 22 Q80 22 80 40 L78 62 L22 62Z', '#fff', O) +
      c(34, 32, 6, INK) +
      e(66, 44, 5, 7, INK) +
      e(50, 70, 24, 15, '#ffc9de', O) +
      both(e(42, 70, 3, 4, INK)) +
      eyes(46, 13) +
      smile(78, 5),
  },
  {
    name: 'Koala',
    top: 30,
    eyeY: 52,
    dx: 12,
    draw: () =>
      both(c(20, 40, 16, '#adb5bd', O) + c(20, 40, 9, '#f1f3f5')) +
      c(50, 56, 28, '#adb5bd', O) +
      e(50, 62, 7, 9, INK) +
      c(48, 58, 1.8, '#fff') +
      eyes(50, 13) +
      smile(74, 4) +
      cheeks(64, 20),
  },
  {
    name: 'Affe',
    top: 24,
    eyeY: 50,
    dx: 10,
    draw: () =>
      both(c(18, 54, 11, '#8d5524', O) + c(18, 54, 6, '#e0ac69')) +
      c(50, 54, 30, '#8d5524', O) +
      p('M50 38 Q56 30 66 36 Q76 44 70 58 Q72 76 50 80 Q28 76 30 58 Q24 44 34 36 Q44 30 50 38Z', '#e0ac69') +
      eyes(50, 10) +
      both(e(47, 62, 1.6, 2, INK)) +
      smile(68, 7),
  },
];

// Accessories on top of an animal: none, party hat, bow, glasses.
function accessory(kind, a, colorIndex) {
  const col = PALETTE[colorIndex % PALETTE.length],
    col2 = PALETTE[(colorIndex + 3) % PALETTE.length];
  if (kind === 1)
    return (
      `<g transform="translate(0 ${a.top - 18}) scale(1.1) translate(-5 -2)">` +
      p('M38 30 L50 4 L62 30Z', col, O) +
      p('M44 17 L56 17 M41 24 L59 24', 'none', `stroke="${col2}" stroke-width="3"`) +
      c(50, 4, 4.5, col2, O) +
      '</g>'
    );
  if (kind === 2)
    return (
      `<g transform="translate(18 ${a.top - 24}) rotate(15 50 24)">` +
      p('M50 24 L36 14 L36 34Z', col, O) +
      p('M50 24 L64 14 L64 34Z', col, O) +
      c(50, 24, 4.5, col2, O) +
      '</g>'
    );
  if (kind === 3)
    return (
      both(c(50 - a.dx, a.eyeY, 8.5, 'rgba(255,255,255,0.35)', `stroke="${col}" stroke-width="2.8"`)) +
      p(
        `M${50 - a.dx + 8.5} ${a.eyeY} Q50 ${a.eyeY - 4} ${50 + a.dx - 8.5} ${a.eyeY}`,
        'none',
        `stroke="${col}" stroke-width="2.8"`,
      )
    );
  return '';
}

export function animal(i) {
  const a = ANIMALS[i % 16],
    kind = Math.floor(i / 16) % 4;
  return { name: a.name, svg: a.draw() + accessory(kind, a, i) };
}

// Monsters and space: monster, alien, rocket, planet, each in 8 colours x 2 variants.
function monster(v) {
  const col = PALETTE[v % 8],
    alt = Math.floor(v / 8) % 2,
    n = 1 + (v % 3),
    dark = 'rgba(0,0,0,0.12)';
  let s = '';
  if (alt === 0) s += both(p('M30 30 L24 10 L40 24Z', '#fff', O));
  else s += both(p('M40 26 L34 10', 'none', O) + c(34, 9, 4.5, PALETTE[(v + 4) % 8], O));
  s += p('M18 84 Q14 40 30 28 Q50 14 70 28 Q86 40 82 84 Q74 90 66 84 Q58 90 50 84 Q42 90 34 84 Q26 90 18 84Z', col, O);
  s += c(32, 70, 4, dark) + c(68, 64, 5, dark) + c(60, 78, 3, dark);
  const xs = n === 1 ? [50] : n === 2 ? [39, 61] : [34, 50, 66];
  for (const x of xs) s += c(x, 48, n === 1 ? 12 : 8.5, '#fff', O) + c(x + 1, 49, n === 1 ? 5.5 : 4, INK);
  s += alt
    ? p('M36 64 Q50 78 64 64Z', INK) + p('M42 64 L45 69 L48 64 M52 64 L55 69 L58 64', '#fff')
    : e(50, 68, 6, 5, INK) + e(50, 70, 3.5, 2, '#ff8fab');
  return { name: 'Monster', svg: s };
}

function alien(v) {
  const col = PALETTE[(v + 3) % 8],
    alt = Math.floor(v / 8) % 2;
  let s = both(p('M40 24 Q36 12 28 8', 'none', O) + c(28, 8, 4.5, PALETTE[(v + 6) % 8], O));
  s += p('M50 18 Q86 18 80 52 Q76 82 50 86 Q24 82 20 52 Q14 18 50 18Z', col, O);
  if (alt) s += c(50, 42, 7, '#fff', O) + c(50, 43, 3.4, INK);
  s += both(e(36, 56, 8, 11, INK, 'transform="rotate(-20 36 56)"') + c(38, 52, 2.6, '#fff'));
  s += smile(72, 6) + cheeks(70, 22);
  return { name: 'Alien', svg: s };
}

function rocket(v) {
  const col = PALETTE[v % 8],
    win = PALETTE[(v + 4) % 8],
    alt = Math.floor(v / 8) % 2;
  let s = '<g transform="rotate(20 50 50)">';
  s += p('M42 78 Q50 100 58 78Z', '#ffa94d') + p('M45 78 Q50 92 55 78Z', '#ffe066');
  s += both(p('M36 60 L24 80 L38 76Z', col, O));
  s += p('M50 6 Q70 26 64 76 L36 76 Q30 26 50 6Z', '#f8f9fa', O);
  s += p('M50 6 Q60 16 62 28 L38 28 Q40 16 50 6Z', col, O);
  s += c(50, 44, 8.5, win, O) + c(47, 41, 2.5, '#fff');
  if (alt) s += p('M37 60 L63 60 M36 66 L64 66', 'none', `stroke="${col}" stroke-width="3.2"`);
  else s += c(50, 62, 3.5, col, O);
  s += '</g>';
  return { name: 'Rakete', svg: s };
}

function planet(v) {
  const col = PALETTE[(v + 5) % 8],
    ring = PALETTE[(v + 1) % 8],
    alt = Math.floor(v / 8) % 2;
  let s = '';
  const star = (x, y, r) =>
    p(
      `M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3}Z`,
      '#ffd43b',
    );
  s += star(14, 16, 6) + star(86, 84, 5) + star(84, 14, 3.5);
  if (!alt) s += p('M8 58 Q50 36 92 50', 'none', `stroke="${ring}" stroke-width="7" stroke-linecap="round"`);
  s += c(50, 52, 28, col, O);
  if (!alt)
    s += p('M14 56 Q50 70 88 48', 'none', `stroke="${ring}" stroke-width="7" stroke-linecap="round" opacity="0.95"`);
  else s += c(36, 66, 4, 'rgba(0,0,0,0.12)') + c(64, 40, 5, 'rgba(0,0,0,0.12)') + c(80, 26, 7, '#e9ecef', O);
  s += eyes(48, 10, 3.6) + smile(58, 5) + cheeks(56, 17);
  return { name: 'Planet', svg: s };
}

const SPACE = [monster, alien, rocket, planet];
export function space(i) {
  return SPACE[i % 4](Math.floor(i / 4) % 16);
}

export const THEMES = {
  tiere: 'Tiere',
  weltraum: 'Monster & Weltraum',
  gemischt: 'Gemischt',
  schlicht: 'Schlicht (nur Nummer)',
};

// Index 0..63 per room; the Mensa set starts elsewhere so that K01 and M01 look different.
export const motifIndex = (room, n) => (((n - 1 + (room === 'M' ? 8 : 0)) % 64) + 64) % 64;

export function motif(theme, room, n) {
  const i = motifIndex(room, n);
  if (theme === 'schlicht') return null;
  if (theme === 'tiere') return animal(i);
  if (theme === 'weltraum') return space(i);
  return i % 2 ? space((i - 1) / 2) : animal(i / 2);
}

// Small deterministic confetti for the label background.
export function confetti(seed, w, h, count = 7) {
  let x = (seed * 2654435761) >>> 0;
  const rnd = () => (x = (x * 1103515245 + 12345) >>> 0) / 4294967296;
  let s = '';
  for (let k = 0; k < count; k++) {
    const cx = (rnd() * w).toFixed(2),
      cy = (rnd() * h).toFixed(2),
      r = (0.5 + rnd() * 0.9).toFixed(2),
      col = PALETTE[Math.floor(rnd() * 8)];
    s +=
      k % 3 === 2
        ? `<rect x="${cx}" y="${cy}" width="${r * 2}" height="${r * 0.9}" rx="0.3" fill="${col}" opacity="0.5" transform="rotate(${Math.floor(rnd() * 180)} ${cx} ${cy})"/>`
        : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}" opacity="0.45"/>`;
  }
  return s;
}
