import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../server/engine.mjs';

// Rest mode, start check and the Ampel's "busy" value (0.19.0).
const minute = 60000;
async function setup() {
  const e = await createEngine();
  const x = { e, now: 100000 };
  x.cmd = c => e.command(c, x.now);
  x.cmd({ type: 'confirm' });
  return Object.assign(x, {
    resting: (at, lastInput) => e.call({ op: 'resting', now: at, lastInput }),
  });
}
test('Ruhemodus: erst nach der eingestellten Zeit ohne Eingabe, nie mit Karte draußen', async () => {
  const x = await setup();
  assert.equal(x.e.snapshot().rest, 20, 'Standard 20 Minuten');
  assert.equal(x.resting(x.now + 19 * minute, x.now), false);
  assert.equal(x.resting(x.now + 20 * minute, x.now), true);
  x.cmd({ type: 'scan', uid: 'sim:K01' });
  x.cmd({ type: 'remove' });
  assert.equal(x.resting(x.now + 60 * minute, x.now), false, 'Karte draußen: wach bleiben');
  x.now += 5000;
  x.cmd({ type: 'scan', uid: 'sim:K01' });
  x.cmd({ type: 'remove' });
  assert.equal(x.resting(x.now + 60 * minute, x.now), true);
  assert.equal(x.cmd({ type: 'settings', cooldown: 3, rest: 0 }).ok, true);
  assert.equal(x.resting(x.now + 600 * minute, x.now), false, 'aus');
  assert.equal(x.cmd({ type: 'settings', cooldown: 3, rest: 121 }).ok, false);
  assert.equal(x.cmd({ type: 'settings', cooldown: 3, rest: 10 }).ok, true);
  assert.equal(x.resting(x.now + 10 * minute, x.now), true);
});
test('Ruhemodus: nicht vor der Bestandsbestätigung, alte Bestände bekommen 20 Minuten', async () => {
  const x = await setup();
  const old = x.e.snapshot();
  delete old.rest;
  old.ready = false;
  x.e.restore(old);
  assert.equal(x.e.snapshot().rest, 20);
  assert.equal(x.resting(x.now + 60 * minute, x.now), false, 'Bestand nicht bestätigt');
});
test('Ampel: Belegung in Prozent der freigegebenen Plätze', async () => {
  const x = await setup();
  assert.equal(x.e.status(x.now).signal.busy, 0);
  x.cmd({ type: 'scan', uid: 'sim:K01' });
  x.cmd({ type: 'remove' });
  const s = x.e.status(x.now);
  const seats = Object.values(s.rooms)
    .filter(r => r.open)
    .reduce((n, r) => n + r.limit, 0);
  assert.equal(s.signal.busy, Math.floor(100 / seats));
});
test('Start-Check: alle Zustände werden gezeichnet', async () => {
  const x = await setup();
  const list = x.e.call({
    op: 'dial',
    now: x.now,
    screen: 'check',
    checks: [
      ['Leser', 0],
      ['Uhr', 1],
      ['Speicher', 0],
      ['Router', 2],
    ],
    hint: 'Router fehlt',
  });
  const texts = list.filter(i => i[0] === 't').map(i => i[5]);
  for (const t of ['START-CHECK', 'Leser', 'Uhr', 'Speicher', 'Router', 'Router fehlt'])
    assert.ok(texts.includes(t), t);
  assert.ok(list.filter(i => i[0] === 'l').length >= 6, 'Haken und Kreuze');
});
