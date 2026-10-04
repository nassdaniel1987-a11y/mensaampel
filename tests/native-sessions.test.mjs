import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// Several tablets signed in at the same time (firmware/src/sessions.hpp).
const compiler = spawnSync('g++', ['--version']);
test('Mehrere Tablets gleichzeitig angemeldet', { skip: compiler.error ? 'g++ fehlt' : false }, () => {
  mkdirSync('build', { recursive: true });
  const built = spawnSync('g++', ['-std=c++17', 'tests/native/sessions.cpp', '-o', 'build/sessions-test'], {
    encoding: 'utf8',
  });
  assert.equal(built.status, 0, built.stderr);
  const out = Object.fromEntries(
    spawnSync('build/sessions-test', { encoding: 'utf8' })
      .stdout.trim()
      .split('\n')
      .map(l => l.split(' ')),
  );
  assert.equal(out.both, '11', 'zwei Tablets gleichzeitig');
  assert.equal(out.fifth, '10111', 'fünftes ersetzt das am längsten unbenutzte (B), nicht das aktive A');
  assert.equal(out.logout, '01', 'Abmelden betrifft nur das eigene Tablet');
  assert.equal(out.wrong, '000', 'leeres oder falsches Token');
  assert.equal(out.expired, '0', 'nach 8 Stunden abgelaufen');
  assert.equal(out.keep, '10', 'nach Kennwortwechsel bleibt nur das eigene');
});
