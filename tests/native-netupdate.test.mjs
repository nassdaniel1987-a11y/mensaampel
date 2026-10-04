import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// Online update (firmware/src/netupdate.hpp): versions, release tag from the redirect, download address.
const compiler = spawnSync('g++', ['--version']);
test('Online-Update: Versionen, Release-Adresse, Download', { skip: compiler.error ? 'g++ fehlt' : false }, () => {
  mkdirSync('build', { recursive: true });
  const built = spawnSync('g++', ['-std=c++17', 'tests/native/netupdate.cpp', '-o', 'build/netupdate-test'], {
    encoding: 'utf8',
  });
  assert.equal(built.status, 0, built.stderr);
  const out = Object.fromEntries(
    spawnSync('build/netupdate-test', { encoding: 'utf8' })
      .stdout.trim()
      .split('\n')
      .map(l => [l.slice(0, l.indexOf(' ')), l.slice(l.indexOf(' ') + 1)]),
  );
  assert.equal(out.parse, '0.25.0' + '1', 'Version mit v und Zusatz');
  assert.equal(out.bad, '0000', 'kaputte Versionen abgelehnt');
  assert.equal(out.compare, '1111', 'Vergleich nach Zahlen, nicht nach Text');
  assert.equal(out.tag, '[v0.25.0-preview]');
  assert.equal(out.badtag, '[][][]', 'nur saubere Versions-Tags');
  assert.equal(out.list, '[v0.25.2-preview][][]', 'Rückfall über die Release-Liste');
  assert.equal(
    out.url,
    'https://github.com/nassdaniel1987-a11y/mensaampel/releases/download/v0.25.0-preview/Mensaampel-Dial-Update.bin',
  );
  assert.equal(out.strength, 'sehr gut|schwach|sehr schwach');
});
