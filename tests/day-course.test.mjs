import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../server/engine.mjs';

// Course of the day (0.23): group events, occupancy curve per 10 minutes, half-hour peaks per closed day.
async function setup() {
  const e = await createEngine();
  let now = 100000;
  const cmd = c => e.command(c, now),
    tap = uid => {
      const r = cmd({ type: 'scan', uid });
      cmd({ type: 'remove' });
      return r;
    };
  cmd({ type: 'confirm' });
  // Tuesday 11:30
  cmd({ type: 'measurementContext', weekday: 2, minute: 690, queue: 0 });
  return { e, cmd, tap, wait: ms => (now += ms), status: () => e.status(now), now: () => now };
}
const k = n => `sim:K${String(n).padStart(2, '0')}`;
const rows = text => (text ? text.split(';').map(l => l.split(',').map(Number)) : []);

test('Tagesverlauf: Gruppen-Ereignisse mit Uhrzeit und Grund', async () => {
  const x = await setup();
  x.cmd({ type: 'flowSettings', yellow: 0, batch: 3 });
  x.cmd({ type: 'pause', paused: false });
  assert.equal(x.cmd({ type: 'autoSettings', on: true, start: 20, startGroup: 3 }).ok, true);
  for (let i = 1; i <= 3; i++) {
    assert.equal(x.tap(k(i)).ok, true);
    x.wait(5000);
  }
  let events = rows(x.status().flow.dayEvents);
  assert.deepEqual(
    events.map(e => e[1]),
    [0, 1],
  );
  assert.equal(events[0][0], 690); // 11:30
  assert.equal(events[0][2], 3); // planned size
  assert.equal(events[0][3], 1); // start group
  assert.equal(events[1][2], 3); // full with 3 children
  assert.ok(events[1][3] > 0, 'seconds until the automatic release');
  // The automatic release follows after the learned time.
  x.wait(120 * 1000);
  x.cmd({ type: 'tick' });
  x.wait(1000);
  x.cmd({ type: 'tick' });
  events = rows(x.status().flow.dayEvents);
  assert.equal(events.at(-1)[1], 2, 'automatic release');
  assert.ok(events.at(-1)[2] >= 120, 'seconds since the first child');
  // Next group, released by hand during the countdown: earlier.
  for (let i = 4; i <= 6; i++) {
    x.tap(k(i));
    x.wait(3000);
  }
  x.cmd({ type: 'pause', paused: false });
  events = rows(x.status().flow.dayEvents);
  assert.deepEqual(
    events.slice(-3).map(e => e[1]),
    [0, 1, 3],
  );
  assert.ok(events.at(-1)[2] > 0, 'seconds before the planned time');
  // Relief and the end of it.
  x.cmd({ type: 'relief' });
  x.wait(30000);
  x.cmd({ type: 'pause', paused: false });
  events = rows(x.status().flow.dayEvents);
  assert.equal(events.at(-2)[1], 5);
  assert.equal(events.at(-1)[1], 6);
  assert.equal(events.at(-1)[2], 30);
});

test('Tagesverlauf: Rücknahme der Buchung nimmt das Gruppen-Ereignis zurück', async () => {
  const x = await setup();
  x.cmd({ type: 'flowSettings', yellow: 0, batch: 3 });
  x.cmd({ type: 'pause', paused: false });
  x.tap(k(1));
  assert.equal(rows(x.status().flow.dayEvents).length, 1);
  assert.equal(x.cmd({ type: 'undo' }).ok, true);
  assert.equal(rows(x.status().flow.dayEvents).length, 0);
});

test('Tagesverlauf: Belegung je 10 Minuten, Spitzen je halbe Stunde nach Tagesende', async () => {
  const x = await setup();
  // 11:30: three cards out
  for (let i = 1; i <= 3; i++) x.tap(k(i));
  let curve = x.status().flow.curve.split(',').map(Number);
  assert.equal(curve.length, 36);
  assert.equal(curve[9], 3); // slot 9 = 11:30
  assert.equal(curve[8], -1);
  // 25 minutes later one comes back: the slots in between keep 3.
  x.wait(25 * 60000);
  x.tap(k(1));
  curve = x.status().flow.curve.split(',').map(Number);
  assert.deepEqual(curve.slice(9, 13), [3, 3, 3, -1]);
  assert.equal(curve[11], 3, 'peak of the slot with the return');
  // New day: peaks per half hour are kept, curve and events start empty.
  x.tap(k(2));
  x.tap(k(3));
  assert.equal(x.cmd({ type: 'newDay', confirmed: true }).ok, true);
  const s = x.status();
  assert.equal(s.flow.curve.split(',').filter(v => v !== '-1').length, 0);
  assert.equal(s.flow.dayEvents, '');
  const peaks = rows(s.peaks);
  assert.equal(peaks.length, 1);
  assert.equal(peaks[0][0], s.flow.history.at(-1)[0], 'day number like the report');
  // half hours from 10:00: 11:30-11:59 = index 3
  assert.deepEqual(peaks[0].slice(1), [-1, -1, -1, 3, -1, -1, -1, -1, -1, -1, -1, -1]);
  assert.ok(s.peaksRev > 0);
});

test('Tagesverlauf: Speichern, Wiederherstellen und Testdaten löschen', async () => {
  const x = await setup();
  x.cmd({ type: 'flowSettings', yellow: 0, batch: 3 });
  x.cmd({ type: 'pause', paused: false });
  x.tap(k(1));
  x.cmd({ type: 'newDay', confirmed: true });
  x.tap(k(2));
  const snap = x.e.snapshot();
  assert.equal(typeof snap.peaks, 'string');
  assert.equal(rows(snap.peaks).length, 1);
  const before = x.status();
  x.e.reset();
  assert.equal(x.e.restore(snap).ok, true);
  const after = x.status();
  assert.equal(after.peaks, before.peaks);
  assert.equal(after.flow.curve, before.flow.curve);
  assert.equal(after.flow.dayEvents, before.flow.dayEvents);
  // Broken texts are refused.
  for (const bad of [{ peaks: '1,2,3' }, { peaks: '1' + ',200'.repeat(12) }]) {
    assert.equal(x.e.restore({ ...snap, ...bad }).ok, false);
  }
  assert.equal(x.e.restore({ ...snap, flow: { ...snap.flow, dayEvents: '700,99,0,0' } }).ok, false);
  assert.equal(x.e.restore({ ...snap, flow: { ...snap.flow, curve: '1,2' } }).ok, false);
  // Older snapshots without the new fields still load.
  const old = { ...snap, flow: { ...snap.flow } };
  delete old.peaks;
  delete old.flow.curve;
  delete old.flow.dayEvents;
  assert.equal(x.e.restore(old).ok, true);
  assert.equal(x.status().peaks, '');
  assert.equal(x.e.restore(snap).ok, true);
  assert.equal(x.cmd({ type: 'clearData', confirmed: true, history: true }).ok, true);
  const s = x.status();
  assert.equal(s.peaks, '');
  assert.equal(s.flow.dayEvents, '');
});
