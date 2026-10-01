import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Evaluation of the USB device check (scripts/device-check.py) with built-in sample data, without a device.
const python = ['python3', 'python'].find(p => !spawnSync(p, ['--version']).error);
test('Geräteprüfung über USB: Auswertung erkennt Probleme', { skip: python ? false : 'Python fehlt' }, () => {
  const r = spawnSync(python, ['scripts/device-check.py', '--selbsttest'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /Selbsttest ok/);
});
