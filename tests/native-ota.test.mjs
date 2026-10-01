import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const compiler = spawnSync('g++', ['--version']);
test(
  'Update: Kennmarke über Blockgrenzen, Rückfall nach drei Fehlstarts',
  { skip: compiler.error ? 'g++ fehlt' : false },
  () => {
    mkdirSync('build', { recursive: true });
    const built = spawnSync('g++', ['-std=c++17', '-O1', 'tests/native/ota.cpp', '-o', 'build/ota-test'], {
      encoding: 'utf8',
    });
    assert.equal(built.status, 0, built.stderr);
    const run = spawnSync('build/ota-test', { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  },
);
