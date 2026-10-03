import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// Router WLAN (firmware/src/netconfig.hpp): settings check, allowed hosts, rescue WLAN.
const compiler = spawnSync('g++', ['--version']);
test('Router-WLAN: Prüfung, erlaubte Adressen, Rettungs-WLAN', { skip: compiler.error ? 'g++ fehlt' : false }, () => {
  mkdirSync('build', { recursive: true });
  const built = spawnSync('g++', ['-std=c++17', 'tests/native/netconfig.cpp', '-o', 'build/netconfig-test'], {
    encoding: 'utf8',
  });
  assert.equal(built.status, 0, built.stderr);
  const out = Object.fromEntries(
    spawnSync('build/netconfig-test', { encoding: 'utf8' })
      .stdout.trim()
      .split('\n')
      .map(l => [l.slice(0, l.indexOf(' ')), l.slice(l.indexOf(' ') + 1)]),
  );
  assert.equal(out.ip, '1192.168.8.20', 'Adresse lesen und wieder schreiben');
  assert.equal(out.badip, '000000', 'kaputte Adressen abgelehnt');
  assert.equal(out.mask, '1100', 'Netzmasken');
  assert.equal(out.good, '[]', 'GL.iNet-Vorgabe ist gültig');
  assert.equal(out.refused, '111111111', 'jede falsche Einstellung abgelehnt');
  assert.equal(out.fritz, '[]', 'FRITZ!Box-Netz ist gültig');
  assert.equal(out.host, '111100', 'nur eigenes WLAN und Dial-Adresse im Router-Netz');
  assert.equal(out.rescue, '0100', 'Rettungs-WLAN erst nach 30 s ohne Router, nur im Router-Modus');
});
