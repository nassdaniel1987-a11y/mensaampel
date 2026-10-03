import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../server/engine.mjs';
import { diaryLines, parseDiary } from '../src/insights.mjs';

// Outlier protection and learning diary (0.20).
async function setup({ auto = false } = {}) {
  const e = await createEngine();
  let now = 100000;
  const cmd = c => e.command(c, now),
    tap = uid => {
      const r = cmd({ type: 'scan', uid });
      cmd({ type: 'remove' });
      return r;
    };
  cmd({ type: 'confirm' });
  cmd({ type: 'measurementContext', weekday: 2, minute: 720, queue: 0 });
  if (auto) {
    cmd({ type: 'flowSettings', yellow: 0, batch: 3 });
    cmd({ type: 'pause', paused: false });
    assert.equal(cmd({ type: 'autoSettings', on: true, start: 20, startGroup: 3 }).ok, true);
  }
  return { e, cmd, tap, wait: ms => (now += ms), flow: () => e.status(now).flow };
}
const k = n => `sim:K${String(n).padStart(2, '0')}`;

test('Ausreißer: eine vergessene Karte verstellt die Verweildauer nur begrenzt', async () => {
  const x = await setup();
  for (let i = 1; i <= 5; i++) {
    x.tap(k(i));
    x.wait(1200 * 1000);
    x.tap(k(i));
    x.wait(4000);
  }
  assert.equal(x.flow().stayAvg, 1200);
  // 85 minutes: plausible, but far longer than usual -> counts only as 40 minutes (twice the learned value).
  x.tap(k(9));
  x.wait(5100 * 1000);
  x.tap(k(9));
  const f = x.flow();
  assert.equal(f.stayAvg, Math.trunc((1200 * 5 + 2400) / 6));
  const lines = parseDiary(f.diary);
  const outlier = lines.find(l => l.kind === 6);
  assert.deepEqual([outlier.before, outlier.after], [5100, 2400]);
  assert.ok(lines.some(l => l.kind === 4 && l.after === f.stayAvg));
});

test('Ausreißer: eine viel zu schnelle Gruppe zieht die Freigabezeit nur wenig herunter', async () => {
  const x = await setup({ auto: true });
  let card = 1;
  const group = () => {
    for (let i = 0; i < 3; i++) assert.equal(x.tap(k(card++)).ok, true);
  };
  for (let r = 0; r < 3; r++) {
    group();
    x.wait(45000);
    assert.equal(x.cmd({ type: 'pause', paused: false }).ok, true); // released early: learns 15 s per child
    x.wait(4000);
  }
  const before = x.flow().auto.perChild;
  group();
  x.wait(2000);
  x.cmd({ type: 'pause', paused: false }); // after 2 s: unusual
  const after = x.flow().auto.perChild,
    lines = parseDiary(x.flow().diary);
  assert.ok(after >= Math.round(before * 0.75), `${before} -> ${after}`);
  assert.ok(lines.some(l => l.kind === 5));
});

test('Lern-Tagebuch: Sätze je Mittag, Zeitfenster lesbar', () => {
  const text = [
    [12, 2, 0, 2 * 48 + 24, 180, 160, 4],
    [12, 2, 0, 2 * 48 + 25, -1, 150, 1],
    [12, 2, 3, -1, 6, 7, 1],
    [12, 2, 5, 2 * 48 + 24, 30, 112, 1],
    [12, 2, 4, -1, 1200, 1260, 8],
    [12, 2, 6, -1, 5100, 2400, 1],
    [13, 3, 7, -1, 0, 0, 1],
  ]
    .map(l => l.join(','))
    .join(';');
  const days = diaryLines(parseDiary(text));
  assert.equal(days.length, 2);
  assert.equal(days[0].title, 'Mittag 13 (Mittwoch)', 'neuester zuerst');
  assert.match(days[0].lines[0], /zurückgesetzt/);
  const tue = days[1].lines.join('\n');
  assert.match(tue, /Dienstag 12:00–12:30: 18,0 s → 16,0 s pro Kind \(4 Gruppen\)/);
  assert.match(tue, /12:30–13:00: neu gelernt 15,0 s pro Kind/);
  assert.match(tue, /Startgruppe: 6 → 7 Kinder/);
  assert.match(tue, /ungewöhnlich schnelle Gruppe .*3,0 s.*11,2 s/);
  assert.match(tue, /Karten bleiben im Schnitt 20 → 21 Min\. \(8 Rückgaben\)/);
  assert.match(tue, /Karte war ungewöhnlich lange weg \(85 Min\.\) – zählt nur als 40 Min\./);
  assert.deepEqual(diaryLines(parseDiary('')), []);
  assert.deepEqual(parseDiary(undefined), []);
});
