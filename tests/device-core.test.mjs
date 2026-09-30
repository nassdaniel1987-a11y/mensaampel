import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../server/engine.mjs';
test('Gerätestart: virtuelle Karten nicht als freie Plätze zählen; echte Karte binden', async () => {
  const e = await createEngine();
  e.call({ op: 'hardware' });
  e.command({ type: 'confirm' }, 100);
  assert.equal(e.status(100).rooms.K.free, 0);
  assert.equal(e.command({ type: 'bind', uid: 'sim:K01', newUid: '04:A1:02:03' }, 100).ok, true);
  assert.equal(e.status(100).rooms.K.free, 1);
  assert.equal(e.command({ type: 'bind', uid: 'sim:K02', newUid: '04:A1:02:03' }, 100).ok, false);
  assert.equal(e.command({ type: 'scan', uid: '04:A1:02:03' }, 10100).ok, true);
  assert.equal(e.command({ type: 'bind', uid: '04:A1:02:03', newUid: 'AB:02:03:04' }, 10200).ok, false);
});
test('Neustartzeit: Belegung bleibt, Sperre beginnt konservativ neu', async () => {
  const e = await createEngine();
  e.command({ type: 'confirm' }, 1000000);
  e.command({ type: 'scan', uid: 'sim:K01' }, 1000000);
  e.call({ op: 'rebootClock', now: 10 });
  assert.equal(e.status(10).rooms.K.occupied, 1);
  assert.equal(e.status(10).cards[0].remainingMs, 3000);
  assert.equal(e.status(10).ready, false);
});
test('Leser: Start braucht leeres Feld, Fehler und Lesepausen sind kein Entfernen', async () => {
  const e = await createEngine();
  const s = (sample, now, uid = 'AA:BB') => e.call({ op: 'sample', sample, now, uid });
  assert.equal(s(0, 0).kind, 0);
  s(1, 100);
  s(1, 400);
  s(1, 700);
  assert.equal(s(0, 800).kind, 1);
  assert.equal(s(0, 20000).kind, 0);
  s(1, 20100);
  s(3, 20700);
  assert.equal(s(0, 21000).kind, 0);
  s(1, 22000);
  s(2, 22600);
  assert.equal(s(0, 23000).kind, 0);
  s(1, 24000);
  s(1, 24300);
  assert.equal(s(1, 24600).kind, -1);
  assert.equal(s(0, 25000).kind, 1);
});
test('Leser: andere Karte ohne bestätigte Entfernung erzeugt keine zweite Präsentation', async () => {
  const e = await createEngine();
  const s = (sample, now, uid = 'A') => e.call({ op: 'sample', sample, now, uid });
  s(1, 0);
  s(1, 300);
  s(1, 600);
  assert.equal(s(0, 800).kind, 1);
  assert.equal(s(0, 1200, 'B').kind, 0);
});
test('Defekter Import verändert einen gültigen Bestand nicht', async () => {
  const e = await createEngine();
  const original = e.snapshot(),
    bad = e.snapshot();
  bad.events = [{ at: 0, message: 'x'.repeat(600) }];
  assert.equal(e.restore(bad).ok, false);
  assert.deepEqual(e.snapshot(), original);
});
