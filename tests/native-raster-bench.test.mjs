import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createEngine } from '../server/engine.mjs';

// The faster Dial rendering (0.17.6) paints exactly the same pixels as before and is clearly faster (on the PC about
// twice; on the Dial more, as 64-bit division is slow there). Times are PC
// times, only for comparison; on the Dial (240 MHz) everything is much slower.
const compiler = spawnSync('g++', ['--version']);
test('Dial-Zeichnen: gleiche Pixel, deutlich schneller', { skip: compiler.error ? 'g++ fehlt' : false }, async () => {
  const e = await createEngine();
  const screens = JSON.parse(readFileSync('src/dial-screens.json', 'utf8')).screens.map(s => s.items);
  screens.push(e.call({ op: 'dial', now: 1000 }), e.call({ op: 'dial', now: 1000, holdMs: 1700 }));
  mkdirSync('build', { recursive: true });
  const built = spawnSync('g++', ['-std=c++17', '-O2', 'tests/native/raster-bench.cpp', '-o', 'build/raster-bench'], {
    encoding: 'utf8',
  });
  assert.equal(built.status, 0, built.stderr);
  const run = spawnSync('build/raster-bench', { input: JSON.stringify(screens), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const [same, ref, fast] = run.stdout.trim().split(' ').map(Number);
  assert.equal(same, 1, 'gleiche Pixel wie vorher');
  assert.ok(fast * 1.5 <= ref, `schneller: vorher ${ref} µs, jetzt ${fast} µs je Bild`);
});
