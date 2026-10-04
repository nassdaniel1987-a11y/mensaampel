import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../server/engine.mjs';
import { dayCurves, decisions, groups, heatmap, parsePeaks, timeline } from '../src/day-course.mjs';

// Tablet views of the course of the day (0.23), fed by a simulated Dial.
const k = n => `sim:K${String(n).padStart(2, '0')}`;
async function lunches(days) {
  const e = await createEngine();
  let now = 100000;
  const cmd = c => e.command(c, now),
    tap = uid => {
      const r = cmd({ type: 'scan', uid });
      cmd({ type: 'remove' });
      return r;
    };
  cmd({ type: 'confirm' });
  cmd({ type: 'measurementContext', weekday: 2, minute: 690, queue: 0 });
  cmd({ type: 'flowSettings', yellow: 0, batch: 4 });
  cmd({ type: 'pause', paused: false });
  assert.equal(cmd({ type: 'autoSettings', on: true, start: 30, startGroup: 4 }).ok, true);
  const state = () => ({ ...e.status(now), outCards: e.status(now).outCards });
  const lunch = (children, keepOut = 0) => {
    for (let i = 1; i <= children; i++) {
      assert.equal(tap(k(i)).ok, true, `K${i}`);
      now += 20000;
      // waiting for the release: let the automatic release happen
      for (let n = 0; n < 40 && state().flow.waiting; n++) {
        now += 15000;
        cmd({ type: 'tick' });
      }
    }
    now += 15 * 60000;
    for (let i = 1; i <= children - keepOut; i++) {
      tap(k(i));
      now += 4000;
    }
  };
  return { e, cmd, tap, lunch, state, wait: ms => (now += ms) };
}

test('Zeitleiste, Vorhersage und Wärmebild aus mehreren Dienstagen', async () => {
  const x = await lunches();
  for (let d = 0; d < 3; d++) {
    x.lunch(12);
    assert.equal(x.cmd({ type: 'newDay', confirmed: true }).ok, true);
    x.cmd({ type: 'measurementContext', weekday: 2, minute: 690, queue: 0 });
  }
  const s0 = x.state();
  assert.equal(parsePeaks(s0.peaks).length, 3);
  // Today: two groups in, the third filling.
  for (let i = 1; i <= 9; i++) {
    x.tap(k(i));
    x.wait(20000);
    for (let n = 0; n < 40 && x.state().flow.waiting; n++) {
      x.wait(15000);
      x.cmd({ type: 'tick' });
    }
  }
  const s = x.state();
  const g = groups(s.flow, s.flow.currentMinute);
  assert.equal(g.length, 3);
  assert.equal(g[0].label, 'Start');
  assert.deepEqual(
    g.map(b => b.state),
    ['done', 'done', 'now'],
  );
  const t = timeline(s);
  assert.ok(t);
  assert.ok(
    t.blocks.some(b => b.state === 'plan'),
    'planned groups from the forecast',
  );
  assert.ok(t.from <= t.blocks[0].start && t.to >= t.now);
  assert.match(t.next.title, /noch 3 Kinder/);
  assert.ok(t.finish, 'expected end from the forecast');
  assert.ok(t.compare, 'minutes per group against the usual');

  const c = dayCurves(s);
  assert.equal(c.days, 3);
  assert.ok(c.forecast.length >= 1);
  assert.ok(c.actual.length >= 1);
  assert.equal(c.actual.at(-1).value, s.outCards.length);
  assert.ok(c.note && c.note.text.length > 10);
  assert.ok(c.max >= c.actual.at(-1).value);

  const list = decisions(s);
  assert.equal(list[0].kind, 'plan');
  assert.ok(list.some(d => d.title === 'Nächste Gruppe freigegeben'));
  assert.ok(list.some(d => d.title.startsWith('Startgruppe beginnt')));

  const h = heatmap(s, 20);
  assert.equal(h.days, 3);
  const tuesday = h.rows.find(r => r.label === 'Dienstag');
  assert.ok(tuesday.cells.some(c => c.value > 0));
  assert.equal(
    h.rows.find(r => r.label === 'Montag').cells.every(c => c.value === null),
    true,
  );
  assert.equal(h.busiest.weekday, 'Dienstag');
  assert.ok(h.slots.length >= 1 && h.slots[0].includes(':'));
});

test('Ohne Uhr und ohne Daten: nichts erfinden', async () => {
  const e = await createEngine();
  e.command({ type: 'confirm' }, 1000);
  const s = e.status(1000);
  assert.equal(timeline(s), null);
  const c = dayCurves(s);
  assert.equal(c.forecast.length + c.actual.length, 0);
  assert.equal(c.note, null);
  assert.deepEqual(decisions(s), []);
  const h = heatmap(s);
  assert.equal(h.days, 0);
  assert.equal(h.busiest, null);
});

test('Entscheidungen in Worten: früher freigegeben, Entlastung', async () => {
  const x = await lunches();
  for (let i = 1; i <= 4; i++) x.tap(k(i));
  // Start group full: release by hand during the countdown.
  x.wait(10000);
  x.cmd({ type: 'pause', paused: false });
  x.cmd({ type: 'relief' });
  x.wait(60000);
  x.cmd({ type: 'pause', paused: false });
  const list = decisions(x.state());
  const titles = list.map(d => d.title);
  assert.ok(titles.includes('Von Hand früher freigegeben'));
  assert.ok(titles.includes('Ausgabe entlastet'));
  assert.equal(list.find(d => d.title === 'Entlastung beendet').why, 'Nach 1 Minute geht der Einlass weiter.');
  // newest first
  assert.ok(
    list.findIndex(d => d.title === 'Entlastung beendet') < list.findIndex(d => d.title === 'Ausgabe entlastet'),
  );
});
