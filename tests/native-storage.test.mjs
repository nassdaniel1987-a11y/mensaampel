import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// Firmware storage on a simulated flash: power cut after every single write step of a booking, a manual
// reconciliation and the very first start, with and without a file system that replaces on rename.
const compiler = spawnSync('g++', ['--version']);
test('Bestand übersteht Stromausfall an jeder Stelle', { skip: compiler.error ? 'g++ fehlt' : false }, () => {
  mkdirSync('build', { recursive: true });
  const built = spawnSync(
    'g++',
    ['-std=c++17', '-O1', '-Itests/native/shim', 'tests/native/storage.cpp', '-o', 'build/storage-test'],
    { encoding: 'utf8' },
  );
  assert.equal(built.status, 0, built.stderr);
  const run = spawnSync('build/storage-test', { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const [, runs, failures] = run.stdout.trim().split('\n').pop().split(' ').map(Number);
  assert.equal(failures, 0);
  assert.ok(runs >= 40, `nur ${runs} Durchläufe`);
});
