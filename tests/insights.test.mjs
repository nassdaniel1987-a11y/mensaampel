import test from 'node:test';
import assert from 'node:assert/strict';
import { forecast, coach, simulate, waitText, confidence, slotLevel, stayLevel, daysLevel } from '../src/insights.mjs';

// day, weekday, issued, returned, groups, auto, earlier, too full, reliefs, first, last, missing, tenths, peak, mensa
const day = (n, wd, o = {}) => {
  const d = [n, wd, 80, 80, 10, 8, 2, 0, 0, 690, 750, 0, 120, 40, 0];
  for (const [k, v] of Object.entries(o)) d[k] = v;
  return d;
};
const flow = (history, o = {}) => ({ history, batch: 6, yellow: 5, autoOn: true, autoStart: 200, ...o });
const rooms = { M: { capacity: 64, limit: 64, open: false } };

test('Prognose: letzte vier gleiche Wochentage, Mensa mit Vorschlag, alte Berichte ohne Spitzen', () => {
  const h = [
    day(1, 1, { 2: 50, 14: 0 }),
    day(2, 2, { 2: 99 }),
    day(3, 1, { 2: 70, 14: 12 }),
    day(4, 1, { 2: 80, 14: 23 }),
    day(5, 1, { 2: 90, 14: 0, 9: 700, 10: 760 }),
    day(6, 1, { 2: 100, 14: 18 }),
    day(7, 1, { 2: 0 }), // holiday without issues
  ];
  const f = forecast(h, 1);
  assert.equal(f.days, 4, 'nur die letzten vier Montage mit Ausgaben');
  assert.equal(f.meals, 85);
  assert.equal(f.mensaDays, 3);
  assert.equal(f.mensaNeeded, true);
  assert.equal(f.mensaSeats, 25);
  assert.equal(f.start, '11:33');
  assert.equal(f.minutes, 60);
  assert.equal(forecast(h, 3), null, 'Mittwoch ohne Daten');
  assert.equal(forecast(h, -1), null, 'ohne Wochentag');
  const old = forecast([[1, 1, 60, 60, 5, 5, 0, 0, 0, 700, 730, 0, 120]], 1);
  assert.equal(old.peak, -1);
  assert.equal(old.mensaNeeded, false);
});

test('Coach: Regeln mit Begründung und Befehl zum Übernehmen', () => {
  assert.equal(coach(flow([day(1, 1)]), rooms)[0].id, 'wait');
  // Many reliefs: smaller groups.
  let tips = coach(flow([1, 2, 3, 4].map(n => day(n, n % 5, { 8: 4 }))), rooms);
  const smaller = tips.find(t => t.id === 'smaller');
  assert.deepEqual(smaller.action, { type: 'flowSettings', yellow: 5, batch: 5 });
  assert.match(smaller.reason, /16 von 40 Gruppen/);
  // Calm and often released earlier: larger groups.
  tips = coach(flow([1, 2, 3].map(n => day(n, 1, { 5: 4, 6: 4 }))), rooms);
  assert.equal(tips.find(t => t.id === 'larger').action.batch, 7);
  // Manual release only: suggest the automatic.
  tips = coach(
    flow(
      [1, 2, 3].map(n => day(n, 1)),
      { autoOn: false },
    ),
    rooms,
  );
  assert.deepEqual(tips.find(t => t.id === 'auto').action, { type: 'autoSettings', on: true, start: 20 });
  // Mensa used every day.
  tips = coach(flow([1, 2, 3, 4].map(n => day(n, 1, { 14: 10 + n }))), rooms);
  assert.deepEqual(tips.find(t => t.id === 'mensa').action, {
    type: 'room',
    room: 'M',
    capacity: 64,
    limit: 15,
    open: true,
  });
  assert.equal(
    coach(flow([1, 2, 3, 4].map(n => day(n, 1, { 14: 12 }))), { M: { ...rooms.M, open: true } }).find(
      t => t.id === 'mensa',
    ),
    undefined,
  );
  // Missing cards: tip without command.
  tips = coach(flow([1, 2, 3].map(n => day(n, 1, { 11: 1 }))), rooms);
  assert.equal(tips.find(t => t.id === 'missing').action, undefined);
  // Nothing to improve.
  tips = coach(flow([1, 2, 3].map(n => day(n, 1, { 6: 0 }))), rooms);
  assert.deepEqual(
    tips.map(t => t.id),
    ['fine'],
  );
});

test('Simulator: größere Gruppen = kürzere Wartezeit an der Tür, längere Schlange an der Ausgabe', () => {
  const base = { children: 60, minutes: 10, perChild: 20, stay: 1200, seats: 48 };
  const small = simulate({ ...base, batch: 4 }),
    large = simulate({ ...base, batch: 8 }),
    none = simulate({ ...base, batch: 0 });
  for (const r of [small, large, none]) assert.equal(r.complete, true);
  assert.equal(small.groups, 15);
  assert.equal(large.groups, 8);
  assert.ok(large.doorAvg <= small.doorAvg, `Tür ${large.doorAvg} <= ${small.doorAvg}`);
  assert.ok(large.serveryMax >= small.serveryMax, `Ausgabe ${large.serveryMax} >= ${small.serveryMax}`);
  assert.equal(none.groups, 0);
  // Seats limit: with 10 seats and long stays children wait at the door.
  const few = simulate({ ...base, seats: 10, batch: 0 });
  assert.ok(few.doorMax >= 1200 - 60, 'warten, bis Plätze frei werden');
  assert.deepEqual(simulate({ ...base, batch: 4 }), small, 'immer gleich (keine Zufallszahlen)');
  assert.equal(waitText(45), '45 s');
  assert.equal(waitText(150), '3 Min.');
});

test('Wie sicher ist das Gelernte: Stufen, leere Daten, Wochentage', () => {
  assert.deepEqual([0, 1, 2, 3, 6, 7].map(slotLevel), [0, 1, 1, 2, 2, 3]);
  assert.deepEqual([0, 4, 5, 29, 30].map(stayLevel), [0, 1, 2, 2, 3]);
  assert.deepEqual([0, 1, 2, 3, 4].map(daysLevel), [0, 1, 2, 2, 3]);
  const empty = confidence({ history: [] });
  assert.equal(empty.rows.length, 5);
  assert.ok(empty.rows.every(r => r.level === 0 && /noch nicht/.test(r.text)));
  assert.equal(empty.stay.level, 0);
  // Tuesday: 5 days and a window with 8 groups -> sure; Friday: 1 day, 2 groups -> unsure.
  const c = confidence({
    history: [...[1, 2, 3, 4, 5].map(n => day(n, 2)), day(6, 5), day(7, 5, { 2: 0 })],
    autoSlots: [
      [2, 24, 150, 8, 6],
      [2, 25, 150, 3, 6],
      [5, 24, 150, 2, 6],
      [6, 24, 150, 9, 6], // Saturday is not shown
    ],
    autoGlobalN: 13,
    stayN: 40,
  });
  assert.deepEqual(c.halfHours, [24, 25]);
  const tue = c.rows.find(r => r.weekday === 2),
    fri = c.rows.find(r => r.weekday === 5);
  assert.equal(tue.level, 3);
  assert.equal(tue.text, 'Dienstag: sicher (5 Mittage)');
  assert.deepEqual(
    tue.cells.map(x => [x.n, x.level]),
    [
      [8, 3],
      [3, 2],
    ],
  );
  assert.equal(fri.days, 1, 'Tag ohne Ausgaben zählt nicht');
  assert.equal(fri.level, 1);
  assert.match(fri.text, /unsicher.*noch 3 Mittage.*noch 5 Gruppen/);
  assert.equal(c.groups.level, 2);
  assert.equal(c.stay.level, 3);
});
