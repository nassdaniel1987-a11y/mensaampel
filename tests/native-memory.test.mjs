import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// Peak heap of the Dial's hot paths with a full stock (112 real cards, 60 report days, 80 events).
// Measured on 64-bit, where pointers and strings are larger than on the ESP32: the budgets are upper limits with margin.
const compiler = spawnSync('g++', ['--version']);
test('Speicherbedarf mit vollem Bestand bleibt im Rahmen', { skip: compiler.error ? 'g++ fehlt' : false }, () => {
  mkdirSync('build', { recursive: true });
  const built = spawnSync('g++', ['-std=c++17', '-O1', 'tests/native/memory.cpp', '-o', 'build/memory-test'], {
    encoding: 'utf8',
  });
  assert.equal(built.status, 0, built.stderr);
  const run = spawnSync('build/memory-test', { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const m = JSON.parse(run.stdout);
  assert.ok(m.saveSame, 'Speichertext entspricht snapshot()');
  assert.ok(m.stateSame, 'Statustext entspricht status()');
  assert.ok(m.days >= 60 && m.events >= 80);
  assert.ok(m.save < 110000, `Speichern ${m.save}`);
  assert.ok(m.stateLean < 115000, `Status ${m.stateLean}`);
  assert.ok(m.booking < 135000, `Scan ${m.booking}`);
  assert.ok(m.lookup < 1024, `Kartenprüfung ${m.lookup}`);
  assert.ok(m.leanBytes < m.stateBytes / 2, 'Status ohne Karten ist deutlich kleiner');
});
