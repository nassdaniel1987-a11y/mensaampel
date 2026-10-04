// Label tool UI: form -> preview sheets in real millimetres -> browser print at 100 %.
import { SHEETS, checkSheet, cells, buildItems, paginate, label } from './layout.mjs';
import { labelSvg } from './render.mjs';
import { THEMES } from './motive.mjs';

const $ = id => document.getElementById(id);
const KEY = 'mensaampel-etiketten-v1';
const GEO = ['w', 'h', 'cols', 'rows', 'left', 'top', 'gapX', 'gapY', 'radius'];
const defaults = () => ({
  sheet: '3474',
  geo: { ...SHEETS[0] },
  cal: { x: 0, y: 0, scale: 100 },
  sel: { K: { on: true, from: 1, to: 48 }, M: { on: true, from: 1, to: 64 }, list: '', copies: 1 },
  theme: 'gemischt',
  skip: [],
});
let state = defaults();
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved && saved.geo) state = { ...state, ...saved, geo: { ...state.geo, ...saved.geo } };
} catch {}
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
};

function fillForm() {
  $('sheet').innerHTML =
    SHEETS.map(s => `<option value="${s.id}">${s.name}</option>`).join('') +
    '<option value="eigen">Eigene Maße</option>';
  $('sheet').value = state.sheet;
  for (const k of GEO) $(k).value = state.geo[k];
  $('round').checked = !!state.geo.round;
  $('calX').value = state.cal.x;
  $('calY').value = state.cal.y;
  $('calS').value = state.cal.scale;
  $('kOn').checked = state.sel.K.on;
  $('kFrom').value = state.sel.K.from;
  $('kTo').value = state.sel.K.to;
  $('mOn').checked = state.sel.M.on;
  $('mFrom').value = state.sel.M.from;
  $('mTo').value = state.sel.M.to;
  $('list').value = state.sel.list;
  $('copies').value = state.sel.copies;
  if (state.sheet === 'eigen') $('geo').open = true;
}

function readForm(e) {
  const num = (id, d = 0) => {
    const v = parseFloat(String($(id).value).replace(',', '.'));
    return Number.isFinite(v) ? v : d;
  };
  if (e && e.target.id === 'sheet') {
    const s = SHEETS.find(x => x.id === $('sheet').value);
    state.sheet = $('sheet').value;
    if (s) state.geo = { ...s };
    state.skip = [];
    fillForm();
  } else if (e && (GEO.includes(e.target.id) || e.target.id === 'round')) {
    state.sheet = 'eigen';
    $('sheet').value = 'eigen';
    for (const k of GEO) state.geo[k] = num(k);
    state.geo.cols = Math.round(state.geo.cols);
    state.geo.rows = Math.round(state.geo.rows);
    state.geo.round = $('round').checked;
  }
  state.cal = { x: num('calX'), y: num('calY'), scale: num('calS', 100) || 100 };
  state.sel = {
    K: { on: $('kOn').checked, from: num('kFrom', 1), to: num('kTo', 48) },
    M: { on: $('mOn').checked, from: num('mFrom', 1), to: num('mTo', 64) },
    list: $('list').value,
    copies: num('copies', 1),
  };
  save();
  render();
}

function sheetBox(title, content) {
  const box = document.createElement('div');
  box.className = 'sheetbox';
  box.innerHTML = `<h2>${title}</h2><div class="sheetwrap"><div class="sheet">${content}</div></div>`;
  return box;
}
const place = (c, cls, inner = '', attrs = '', style = '') =>
  `<div class="${cls}" ${attrs} style="left:${c.x}mm;top:${c.y}mm;width:${c.w}mm;height:${c.h}mm;${style}">${inner}</div>`;

function render() {
  const g = state.geo,
    problems = checkSheet(g),
    { items, errors } = buildItems(state.sel);
  const msgs = [...problems];
  if (errors.length) msgs.push('Nicht verstanden: ' + errors.join(', ') + ' (Beispiel: K03, M10-M12).');
  if (!items.length) msgs.push('Keine Karten ausgewählt.');
  $('problems').innerHTML = msgs.map(m => `<div>${m}</div>`).join('');
  const preview = $('preview');
  preview.innerHTML = '';
  if (problems.length) return;
  const cs = cells(g, state.cal),
    per = cs.length,
    pages = paginate(items, per, state.skip);
  $('summary').textContent = `${items.length} Etiketten · ${pages.length} ${pages.length === 1 ? 'Bogen' : 'Bögen'}`;
  const opt = { radius: g.radius, round: g.round };
  pages.forEach((page, pi) => {
    let html = '';
    const filled = new Set(page.map(x => x.cell));
    if (pi === 0)
      cs.forEach((c, i) => {
        if (!filled.has(i)) html += place(c, 'cell' + (state.skip.includes(i) ? ' used' : ''), '', `data-cell="${i}"`);
      });
    for (const { cell, item } of page)
      html += place(
        cs[cell],
        'lbl' + (pi === 0 ? ' clickable' : ''),
        labelSvg(item, state.theme, cs[cell].w, cs[cell].h, opt),
        pi === 0 ? `data-cell="${cell}" title="${label(item)} – anklicken: Feld ist schon benutzt"` : '',
      );
    preview.appendChild(sheetBox(`Bogen ${pi + 1} von ${pages.length}`, html));
  });
  document
    .querySelectorAll('.theme')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === state.theme)));
}

function testPage() {
  const g = state.geo,
    cs = cells(g, state.cal),
    f = (state.cal.scale || 100) / 100;
  let html = cs
    .map(
      c =>
        place(
          c,
          'lbl',
          '',
          '',
          `box-sizing:border-box;border:0.25mm solid #000;border-radius:${g.round ? '50%' : g.radius + 'mm'}`,
        ) +
        `<div class="lbl" style="left:${c.x + c.w / 2 - 3}mm;top:${c.y + c.h / 2}mm;width:6mm;border-top:0.2mm solid #000"></div>` +
        `<div class="lbl" style="left:${c.x + c.w / 2}mm;top:${c.y + c.h / 2 - 3}mm;height:6mm;border-left:0.2mm solid #000"></div>`,
    )
    .join('');
  // 100 mm rulers (scaled like the labels) with centimetre ticks.
  const x0 = 55 * f + state.cal.x,
    y0 = 141 * f + state.cal.y;
  html += `<div class="lbl" style="left:${x0}mm;top:${y0}mm;width:${100 * f}mm;border-top:0.4mm solid #d00"></div>`;
  for (let k = 0; k <= 10; k++)
    html += `<div class="lbl" style="left:${x0 + k * 10 * f}mm;top:${y0 - 2}mm;height:4mm;border-left:0.3mm solid #d00"></div>`;
  html += `<div class="lbl" style="left:${x0}mm;top:${y0 + 3}mm;width:${100 * f}mm;text-align:center;font:3.2mm Arial;color:#d00">100 mm – bitte nachmessen</div>`;
  html += `<div class="lbl" style="left:20mm;top:${y0 + 10}mm;width:170mm;text-align:center;font:3.4mm Arial;background:#fff">Testseite · ${
    SHEETS.find(s => s.id === state.sheet)?.name || 'Eigene Maße'
  } · Versatz ${state.cal.x} / ${state.cal.y} mm · Maßstab ${state.cal.scale} %</div>`;
  $('testPage').innerHTML = `<div class="sheet">${html}</div>`;
}

function print(kind) {
  if (kind === 'test') testPage();
  document.body.classList.toggle('print-test', kind === 'test');
  window.print();
}
window.addEventListener('afterprint', () => document.body.classList.remove('print-test'));

function themes() {
  const sample = { room: 'K', n: 7 };
  $('themes').innerHTML = Object.entries(THEMES)
    .map(
      ([id, name]) =>
        `<button type="button" class="theme" data-theme="${id}">${labelSvg(id === 'gemischt' ? { room: 'M', n: 4 } : sample, id, 70, 37)}<span>${name}</span></button>`,
    )
    .join('');
}

function zoom() {
  const w = $('preview').clientWidth || 600;
  const z = Math.max(0.3, Math.min(1, (w >= 1000 ? (w - 16) / 2 : w) / 794));
  document.documentElement.style.setProperty('--z', z.toFixed(3));
}

themes();
fillForm();
zoom();
render();
$('form').addEventListener('input', readForm);
$('form').addEventListener('change', readForm);
$('themes').addEventListener('click', e => {
  const b = e.target.closest('.theme');
  if (!b) return;
  state.theme = b.dataset.theme;
  save();
  render();
});
$('preview').addEventListener('click', e => {
  const el = e.target.closest('[data-cell]');
  if (!el || !el.closest('.sheetbox') || el.closest('.sheetbox') !== $('preview').firstElementChild) return;
  const i = +el.dataset.cell;
  state.skip = state.skip.includes(i) ? state.skip.filter(x => x !== i) : [...state.skip, i];
  save();
  render();
});
$('clearSkip').addEventListener('click', () => {
  state.skip = [];
  save();
  render();
});
$('printTest').addEventListener('click', () => print('test'));
$('printLabels').addEventListener('click', () => print('labels'));
window.addEventListener('resize', zoom);
