import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { SHEETS, checkSheet, cells, parseList, buildItems, paginate } from '../tools/etiketten/layout.mjs';
import { motif, THEMES } from '../tools/etiketten/motive.mjs';
import { labelSvg } from '../tools/etiketten/render.mjs';

test('Etiketten: alle Bogenvorlagen passen auf A4', () => {
  for (const s of SHEETS) assert.deepEqual(checkSheet(s), [], s.id);
  assert.ok(checkSheet({ ...SHEETS[0], cols: 4 }).length > 0);
});

test('Etiketten: Positionen in mm, mit Versatz und Maßstab', () => {
  const s = SHEETS.find(x => x.id === '3474');
  const c = cells(s);
  assert.equal(c.length, 24);
  assert.deepEqual(c[0], { x: 0, y: 0.5, w: 70, h: 37 });
  assert.deepEqual(c[23], { x: 140, y: 0.5 + 7 * 37, w: 70, h: 37 });
  const k = cells(
    SHEETS.find(x => x.id === 'L7160'),
    { x: 1, y: -0.5, scale: 100 },
  );
  assert.ok(Math.abs(k[4].x - (7.2 + 63.5 + 2.5 + 1)) < 1e-9);
  assert.ok(Math.abs(k[4].y - (15.15 + 38.1 - 0.5)) < 1e-9);
  const z = cells(s, { x: 0, y: 0, scale: 101 });
  assert.ok(Math.abs(z[1].x - 70.7) < 1e-9 && Math.abs(z[1].w - 70.7) < 1e-9);
});

test('Etiketten: Auswahl, freie Liste und angefangener Bogen', () => {
  const l = parseList('K03, m10-M12; k 5  M7 – M8, X1, K5-K2');
  assert.deepEqual(
    l.items.map(i => i.room + i.n),
    ['K3', 'M10', 'M11', 'M12', 'K5', 'M7', 'M8'],
  );
  assert.deepEqual(l.errors, ['X1', 'K5-K2']);
  const all = buildItems({ K: { on: true, from: 1, to: 48 }, M: { on: true, from: 1, to: 64 }, list: '', copies: 1 });
  assert.equal(all.items.length, 112);
  const two = buildItems({ K: { on: false }, M: { on: false }, list: 'K1-K3', copies: 2 });
  assert.deepEqual(
    two.items.map(i => i.n),
    [1, 1, 2, 2, 3, 3],
  );
  const pages = paginate(all.items, 24, [0, 1, 5]);
  assert.equal(pages[0][0].cell, 2);
  assert.ok(!pages[0].some(x => x.cell === 5));
  assert.equal(pages[0].length, 21);
  assert.equal(pages[1][0].cell, 0, 'nur der erste Bogen hat belegte Felder');
  assert.equal(
    pages.reduce((n, p) => n + p.length, 0),
    112,
  );
  assert.equal(pages.length, 5);
  assert.equal(paginate(all.items.slice(0, 2), 24, [...Array(24).keys()])[0][0].cell, 0, 'voller Bogen → neuer Bogen');
});

test('Etiketten: jedes Motiv je Raum und Thema nur einmal', () => {
  for (const theme of ['tiere', 'weltraum', 'gemischt']) {
    for (const [room, count] of [
      ['K', 48],
      ['M', 64],
    ]) {
      const seen = new Set();
      for (let n = 1; n <= count; n++) seen.add(motif(theme, room, n).svg);
      assert.equal(seen.size, count, `${theme} ${room}`);
    }
  }
  assert.equal(motif('schlicht', 'K', 1), null);
  assert.notEqual(motif('tiere', 'K', 1).svg, motif('tiere', 'M', 1).svg, 'K01 und M01 sehen verschieden aus');
});

test('Etiketten: SVG in Millimetern für alle Formate und Themen', () => {
  for (const theme of Object.keys(THEMES))
    for (const s of SHEETS) {
      const svg = labelSvg({ room: 'M', n: 64 }, theme, s.w, s.h, { radius: s.radius, round: s.round });
      assert.match(svg, new RegExp(`width="${s.w}mm" height="${s.h}mm"`));
      assert.match(svg, />M64</);
      assert.match(svg, />Mensa</);
      assert.doesNotMatch(svg, /NaN|undefined/);
    }
});

test('Etiketten-Tool wird als eine Offline-Datei gebaut', () => {
  execFileSync(process.execPath, ['scripts/build-label-tool.mjs']);
  const html = readFileSync('Etiketten-Tool.html', 'utf8');
  assert.doesNotMatch(html, /src="app\.mjs"|href="style\.css"|^import /m);
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/, 'keine externen Adressen');
  assert.match(html, /@page/);
  assert.match(html, /function labelSvg/);
});
