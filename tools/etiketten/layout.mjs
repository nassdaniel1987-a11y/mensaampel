// Sheet geometry, selection and pagination for the label tool. All sizes in millimetres on A4 portrait.
export const PAGE = { w: 210, h: 297 };

// Values from the manufacturers' templates; always check with the test page before printing a whole series.
export const SHEETS = [
  {
    id: '3474',
    name: 'Avery Zweckform 3474 · 70 × 37 mm · 24 pro Bogen (empfohlen)',
    w: 70,
    h: 37,
    cols: 3,
    rows: 8,
    left: 0,
    top: 0.5,
    gapX: 0,
    gapY: 0,
    radius: 0,
    round: false,
  },
  {
    id: '3490',
    name: 'Avery Zweckform 3490 · 70 × 36 mm · 24 pro Bogen',
    w: 70,
    h: 36,
    cols: 3,
    rows: 8,
    left: 0,
    top: 4.5,
    gapX: 0,
    gapY: 0,
    radius: 0,
    round: false,
  },
  {
    id: 'L7160',
    name: 'Avery L7160 · 63,5 × 38,1 mm · 21 pro Bogen',
    w: 63.5,
    h: 38.1,
    cols: 3,
    rows: 7,
    left: 7.2,
    top: 15.15,
    gapX: 2.5,
    gapY: 0,
    radius: 2,
    round: false,
  },
  {
    id: '3659',
    name: 'Avery Zweckform 3659 · 97 × 42,3 mm · 12 pro Bogen',
    w: 97,
    h: 42.3,
    cols: 2,
    rows: 6,
    left: 8,
    top: 21.6,
    gapX: 0,
    gapY: 0,
    radius: 0,
    round: false,
  },
  {
    id: 'karte',
    name: 'Kartengroß · 85 × 54 mm · 10 pro Bogen',
    w: 85,
    h: 54,
    cols: 2,
    rows: 5,
    left: 15,
    top: 13.5,
    gapX: 10,
    gapY: 0,
    radius: 3,
    round: false,
  },
  {
    id: 'rund40',
    name: 'Rund Ø 40 mm · 24 pro Bogen',
    w: 40,
    h: 40,
    cols: 4,
    rows: 6,
    left: 15,
    top: 22.5,
    gapX: 6.67,
    gapY: 2.4,
    radius: 20,
    round: true,
  },
];

export const ROOMS = {
  K: { name: 'Küche', color: '#1f5fa8', count: 48 },
  M: { name: 'Mensa', color: '#b3261e', count: 64 },
};

export const label = item => item.room + String(item.n).padStart(2, '0');

// Problems that make a sheet unusable (labels outside the page or overlapping); empty when fine.
export function checkSheet(s) {
  const problems = [];
  for (const k of ['w', 'h', 'cols', 'rows']) if (!(s[k] > 0)) problems.push(`${k} muss größer als 0 sein.`);
  for (const k of ['left', 'top', 'gapX', 'gapY']) if (!(s[k] >= 0)) problems.push(`${k} darf nicht negativ sein.`);
  if (problems.length) return problems;
  const right = s.left + s.cols * s.w + (s.cols - 1) * s.gapX,
    bottom = s.top + s.rows * s.h + (s.rows - 1) * s.gapY;
  if (right > PAGE.w + 0.05)
    problems.push(`Etiketten ragen rechts ${(right - PAGE.w).toFixed(1)} mm über das A4-Blatt.`);
  if (bottom > PAGE.h + 0.05)
    problems.push(`Etiketten ragen unten ${(bottom - PAGE.h).toFixed(1)} mm über das A4-Blatt.`);
  return problems;
}

// Label cells of one sheet in print order (row by row), with calibration applied: scale in percent around the page
// origin, then offset in mm.
export function cells(s, calib = { x: 0, y: 0, scale: 100 }) {
  const f = (calib.scale || 100) / 100,
    out = [];
  for (let r = 0; r < s.rows; r++)
    for (let c = 0; c < s.cols; c++)
      out.push({
        x: (s.left + c * (s.w + s.gapX)) * f + (calib.x || 0),
        y: (s.top + r * (s.h + s.gapY)) * f + (calib.y || 0),
        w: s.w * f,
        h: s.h * f,
      });
  return out;
}

// "K03, M10-M12, k5, M 7" -> items; tokens that cannot be read are returned in `errors`.
export function parseList(text) {
  const items = [],
    errors = [];
  const norm = String(text || '')
    .replace(/([KkMm])\s+(\d)/g, '$1$2')
    .replace(/\s*[-–]\s*/g, '-');
  for (const raw of norm.split(/[\s,;]+/)) {
    const t = raw.trim();
    if (!t) continue;
    const m = /^([KkMm])(\d{1,3})(?:[-–]([KkMm])?(\d{1,3}))?$/.exec(t);
    if (!m || (m[3] && m[3].toUpperCase() !== m[1].toUpperCase())) {
      errors.push(raw.trim());
      continue;
    }
    const room = m[1].toUpperCase(),
      a = +m[2],
      b = m[4] ? +m[4] : a;
    if (a < 1 || b < a || b - a > 200) {
      errors.push(raw.trim());
      continue;
    }
    for (let n = a; n <= b; n++) items.push({ room, n });
  }
  return { items, errors };
}

// Selection -> list of labels to print, each repeated `copies` times in a row.
export function buildItems(sel) {
  const base = [];
  for (const room of ['K', 'M']) {
    const r = sel[room];
    if (r && r.on) for (let n = Math.max(1, r.from | 0); n <= (r.to | 0); n++) base.push({ room, n });
  }
  const list = parseList(sel.list);
  base.push(...list.items);
  const copies = Math.min(10, Math.max(1, sel.copies | 0 || 1));
  return { items: base.flatMap(i => Array.from({ length: copies }, () => i)), errors: list.errors };
}

// Distributes items onto sheets; cells listed in `skip` are left empty on the first sheet (already used labels).
export function paginate(items, perSheet, skip = []) {
  const used = new Set(skip.filter(i => i >= 0 && i < perSheet));
  const pages = [];
  let page = [],
    cell = 0,
    first = true;
  const flush = () => {
    if (page.length) pages.push(page);
    page = [];
    cell = 0;
    first = false;
  };
  for (const item of items) {
    while (first && used.has(cell)) cell++;
    if (cell >= perSheet) flush();
    page.push({ cell, item });
    cell++;
    if (cell >= perSheet) flush();
  }
  if (page.length) pages.push(page);
  return pages;
}
