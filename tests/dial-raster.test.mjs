import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { paintFrame, textWidth, supported } from '../src/dial-paint.mjs';
import { createEngine } from '../server/engine.mjs';

const hash = frame => {
  let h = 2166136261;
  for (const v of frame) {
    h = Math.imul(h ^ (v & 255), 16777619) >>> 0;
    h = Math.imul(h ^ (v >> 8), 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};
// Shapes at awkward positions and angles, all font sizes, umlauts, clipping at the strip and screen borders.
const shapes = [
  [
    ['g', 0x1407, 0x0a83, 1],
    ['a', 120, 120, 100, 119, 0, 360, 0xffff, 3],
    ['l', 80, 120, 108, 148, 14, 0xffff],
    ['l', 108, 148, 160, 92, 14, 0xffff],
    ['t', 120, 190, 5, 0xffff, '46'],
    ['l', 10, -5, 250, 250, 3, 0xf800],
  ],
  [
    ['g', 0xd924, 0x18c3, 0],
    ['l', 100, 100, 100, 100, 20, 0x07e0],
    ['t', 120, 120, 5, 0xffe0, '12:05'],
  ],
  [
    ['f', 0x2104],
    ['a', 120, 120, 104, 116, 0, 360, 0x4208],
    ['a', 120, 120, 104, 116, 270, 397, 0xffff],
  ],
  [
    ['f', 0],
    ['a', 120, 120, 100, 119, -90, 250, 0x07e0],
    ['a', 120, 120, 60, 70, 13, 14, 0xf800],
  ],
  [
    ['f', 0xffff],
    ['r', 30, 140, 180, 38, 19, 0xfda0],
    ['r', -5, 40, 60, 60, 12, 0x001f],
    ['c', 200, 47, 30, 0xf81f],
  ],
  [
    ['f', 0x0000],
    ['t', 120, 50, 1, 0xffff, 'Größe 1: Äpfel, Öl, Übung – „ß“ …'],
    ['t', 120, 96, 2, 0xffe0, 'Küche 46 · Mensa 0'],
    ['t', 120, 140, 3, 0x07e0, 'PLATZ FREI'],
    ['t', 120, 200, 4, 0xffff, 'K01'],
    ['t', 0, 239, 2, 0xffff, 'Rand€'],
  ],
];
const compiler = spawnSync('g++', ['--version']);
test(
  'Dial-Zeichnung: Browser und Gerät malen pixelgleich',
  { skip: compiler.error ? 'g++ fehlt' : false },
  async () => {
    const e = await createEngine();
    const screens = JSON.parse(readFileSync('src/dial-screens.json', 'utf8')).screens.map(s => s.items);
    screens.push(e.call({ op: 'dial', now: 1000 }), e.call({ op: 'dial', now: 1000, holdMs: 1700 }));
    const lists = [...shapes, ...screens];
    mkdirSync('build', { recursive: true });
    const built = spawnSync('g++', ['-std=c++17', '-O1', 'tests/native/raster.cpp', '-o', 'build/raster-test'], {
      encoding: 'utf8',
    });
    assert.equal(built.status, 0, built.stderr);
    const run = spawnSync('build/raster-test', { input: JSON.stringify(lists), encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const native = run.stdout.trim().split('\n');
    assert.equal(native.length, lists.length);
    lists.forEach((list, i) => assert.equal(hash(paintFrame(list)), native[i], `Bild ${i}`));
  },
);

test('Dial-Schrift: Umlaute vorhanden, Breiten plausibel', () => {
  assert.ok(supported('Prüfen Größe Übung Äpfel Öl ß', 1));
  assert.ok(supported('Küche · Mensa – „gut“ …', 2));
  assert.ok(supported('PLATZ FREI EINLASS ZU', 3));
  assert.ok(!supported('klein', 3), 'Größe 3 nur Großbuchstaben');
  assert.ok(textWidth('MMMM', 2) > textWidth('iiii', 2), 'Proportionalschrift');
  assert.equal(textWidth('€', 1), textWidth('?', 1), 'Unbekanntes als ?');
});
