import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// The Dial answers the internet checks of tablets (Android, iPad, Windows, Firefox) so they stay in its WLAN; app paths
// stay untouched.
const compiler = spawnSync('g++', ['--version']);
test('Internetprüfung der Tablets wird beantwortet', { skip: compiler.error ? 'g++ fehlt' : false }, () => {
  mkdirSync('build', { recursive: true });
  const built = spawnSync('g++', ['-std=c++17', 'tests/native/probes.cpp', '-o', 'build/probes-test'], {
    encoding: 'utf8',
  });
  assert.equal(built.status, 0, built.stderr);
  const run = spawnSync('build/probes-test', { encoding: 'utf8' });
  const rows = Object.fromEntries(
    run.stdout
      .trim()
      .split('\n')
      .map(l => {
        const [path, code, type, body] = l.split('|');
        return [path, { code: +code, type, body }];
      }),
  );
  assert.equal(rows['/generate_204'].code, 204, 'Android');
  assert.equal(rows['/generate_204'].body, '');
  assert.equal(rows['/gen_204'].code, 204);
  assert.match(rows['/hotspot-detect.html'].body, /<TITLE>Success<\/TITLE>.*Success/, 'iPad');
  assert.equal(rows['/library/test/success.html'].code, 200);
  assert.equal(rows['/connecttest.txt'].body, 'Microsoft Connect Test', 'Windows');
  assert.equal(rows['/ncsi.txt'].body, 'Microsoft NCSI');
  assert.equal(rows['/success.txt'].code, 200, 'Firefox');
  for (const p of ['/', '/ampel', '/api/state']) assert.equal(rows[p].code, 0, `${p} bleibt die App`);
});
