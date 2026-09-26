import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../server/engine.mjs';
async function setup() {
  const e = await createEngine();
  let now = 100000;
  const cmd = c => e.command(c, now);
  const tap = uid => {
    const r = cmd({ type: 'scan', uid: 'sim:' + uid });
    cmd({ type: 'remove' });
    return r;
  };
  cmd({ type: 'confirm' });
  return { e, cmd, tap, advance: n => (now += n), status: () => e.status(now) };
}
test('48 Küche, 64 Mensa, Start gesperrt bis bestätigt', async () => {
  const e = await createEngine();
  assert.equal(e.status(0).signal.reason, 'confirm');
  assert.equal(e.status(0).cards.length, 112);
  e.command({ type: 'confirm' }, 0);
  assert.equal(e.status(0).signal.free, 48);
});
test('Ausgabe/Rückgabe, Grenzzeit exakt 10 Sekunden und andere Karten', async () => {
  const t = await setup();
  assert.equal(t.tap('K01').ok, true);
  assert.equal(t.status().rooms.K.free, 47);
  assert.equal(t.tap('K02').ok, true);
  t.advance(9999);
  assert.equal(t.tap('K01').ok, false);
  t.advance(1);
  assert.equal(t.tap('K01').ok, true);
  assert.equal(t.status().rooms.K.free, 47);
});
test('Dauerhaftes Vorhalten und abgewiesene Präsentation buchen niemals verzögert', async () => {
  const t = await setup();
  t.cmd({ type: 'scan', uid: 'sim:K01' });
  t.advance(20000);
  assert.equal(t.cmd({ type: 'scan', uid: 'sim:K01' }).ok, false);
  assert.equal(t.status().rooms.K.free, 47);
  t.cmd({ type: 'remove' });
  t.cmd({ type: 'scan', uid: 'sim:K01' });
  t.cmd({ type: 'remove' });
  t.cmd({ type: 'scan', uid: 'sim:K01' });
  t.advance(20000);
  assert.equal(t.cmd({ type: 'scan', uid: 'sim:K01' }).ok, false);
  assert.equal(t.status().rooms.K.free, 48);
});
test('Volle Küche, Raumzuordnung und Mensa-Teilfreigabe', async () => {
  const t = await setup();
  for (let i = 1; i <= 48; i++) assert.equal(t.tap('K' + String(i).padStart(2, '0')).ok, true);
  assert.equal(t.status().signal.green, false);
  assert.equal(t.tap('M01').ok, false);
  t.cmd({ type: 'room', room: 'M', capacity: 64, limit: 1, open: true });
  assert.equal(t.tap('M01').ok, true);
  assert.equal(t.tap('M02').ok, false);
  assert.equal(t.status().rooms.M.occupied, 1);
  assert.equal(t.status().signal.green, false);
});
test('Pause verhindert Ausgaben und erlaubt Rückgaben', async () => {
  const t = await setup();
  t.tap('K01');
  t.advance(10000);
  t.cmd({ type: 'pause', paused: true });
  assert.equal(t.tap('K02').ok, false);
  assert.equal(t.tap('K01').ok, true);
  assert.equal(t.status().signal.reason, 'paused');
});
test('Geschlossener Raum nimmt belegte Karten zurück', async () => {
  const t = await setup();
  t.tap('K01');
  t.advance(10000);
  t.cmd({ type: 'room', room: 'K', capacity: 48, limit: 48, open: false });
  assert.equal(t.tap('K01').ok, true);
  assert.equal(t.tap('K02').ok, false);
});
test('Kapazität unter Belegung und ungültige Werte werden atomar abgewiesen', async () => {
  const t = await setup();
  t.tap('K01');
  const prev = t.e.snapshot();
  assert.equal(t.cmd({ type: 'room', room: 'K', capacity: 0, limit: 0, open: true }).ok, false);
  assert.deepEqual(t.e.snapshot(), prev);
  assert.equal(t.cmd({ type: 'settings', cooldown: 0 }).ok, false);
  assert.equal(t.cmd({ type: 'settings', cooldown: 1.5 }).ok, false);
  assert.equal(t.cmd({ type: 'settings', cooldown: 601 }).ok, false);
});
test('Unbekannte Karte, Einlernen, doppelte UID/Label und verlorene Karte', async () => {
  const t = await setup();
  assert.equal(t.tap('K49').ok, false);
  assert.equal(t.cmd({ type: 'enroll', uid: 'sim:K49', label: 'K49', room: 'K' }).ok, true);
  assert.equal(t.cmd({ type: 'enroll', uid: 'sim:K49', label: 'K50', room: 'K' }).ok, false);
  t.tap('K01');
  t.cmd({ type: 'correct', uid: 'sim:K01', out: true, lost: true });
  assert.equal(t.status().rooms.K.occupied, 1);
  t.advance(10000);
  assert.equal(t.tap('K01').ok, false);
});
test('Korrektur und Rückgängig machen respektieren Kapazität', async () => {
  const t = await setup();
  t.tap('K01');
  assert.equal(t.cmd({ type: 'undo' }).ok, true);
  assert.equal(t.status().rooms.K.occupied, 0);
  assert.equal(t.tap('K01').ok, false);
  t.cmd({ type: 'room', room: 'K', capacity: 1, limit: 1, open: true });
  assert.equal(t.cmd({ type: 'correct', uid: 'sim:K01', out: true, lost: false }).ok, true);
  assert.equal(t.cmd({ type: 'correct', uid: 'sim:K02', out: true, lost: false }).ok, false);
});
test('Neustart behält Karten und verlangt Bestätigung', async () => {
  const t = await setup();
  t.tap('K01');
  t.cmd({ type: 'restart' });
  assert.equal(t.status().rooms.K.occupied, 1);
  assert.equal(t.status().signal.reason, 'confirm');
  assert.equal(t.tap('K02').ok, false);
});
test('Neuer Tag benötigt ausdrückliche Bestätigung, Verlustmarkierung bleibt', async () => {
  const t = await setup();
  t.tap('K01');
  t.cmd({ type: 'correct', uid: 'sim:K01', out: true, lost: true });
  assert.equal(t.cmd({ type: 'newDay' }).ok, false);
  assert.equal(t.cmd({ type: 'newDay', confirmed: true }).ok, true);
  assert.equal(t.status().rooms.K.occupied, 0);
  assert.equal(t.status().rooms.K.free, 47);
  assert.equal(t.status().rooms.M.open, false);
});
test('Import validiert Schema, doppelte IDs und Überbelegung', async () => {
  const t = await setup();
  let x = t.e.snapshot();
  x.schema = 3;
  assert.equal(t.e.restore(x).ok, false);
  x = t.e.snapshot();
  x.cards[1].uid = x.cards[0].uid;
  assert.equal(t.e.restore(x).ok, false);
  x = t.e.snapshot();
  x.rooms.K.limit = 0;
  x.cards[0].out = true;
  assert.equal(t.e.restore(x).ok, false);
});
test('Begrenztes Protokoll und konfigurierbare Sperre', async () => {
  const t = await setup();
  t.cmd({ type: 'settings', cooldown: 2 });
  t.tap('K01');
  t.advance(2000);
  assert.equal(t.tap('K01').ok, true);
  for (let i = 0; i < 100; i++) t.cmd({ type: 'pause', paused: i % 2 === 0 });
  assert.equal(t.status().events.length, 80);
});
