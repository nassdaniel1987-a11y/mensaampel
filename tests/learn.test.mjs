import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../server/engine.mjs';
import { textWidth } from '../src/dial-paint.mjs';
// Monday 12:00, no groups: every scan books at once.
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
  cmd({ type: 'measurementContext', weekday: 1, minute: 720, queue: 0 });
  return {
    e,
    cmd,
    tap,
    wait: ms => (now += ms),
    state: () => e.status(now),
    get now() {
      return now;
    },
  };
}
const card = (s, label) => s.cards.find(c => c.label === label);
const k = n => `sim:K${String(n).padStart(2, '0')}`;
test('Verweildauer: lernt nur plausible Zeiten, Wartezeit-Hinweis, Rückgängig nimmt sie zurück', async () => {
  const x = await setup();
  assert.equal(x.state().signal.nextFreeIn, -1, 'ohne Daten keine Schätzung');
  assert.equal(x.state().signal.stayMinutes, -1);
  // Too short (double scan) and too long (forgotten) are not learned.
  x.tap(k(1));
  x.wait(30000);
  x.tap(k(1));
  x.tap(k(2));
  x.wait(2 * 3600000);
  x.tap(k(2));
  assert.equal(x.state().flow.stayN, 0);
  // Five children stay 20 minutes.
  for (let i = 1; i <= 5; i++) x.tap(k(10 + i));
  x.wait(20 * 60000);
  for (let i = 1; i <= 5; i++) x.tap(k(10 + i));
  let f = x.state().flow;
  assert.equal(f.stayN, 5);
  assert.equal(f.stayAvg, 1200);
  assert.equal(f.stay, undefined, 'Lerntabelle nicht im Status (Dial-Speicher)');
  const stay = x.e.snapshot().flow.stay;
  assert.equal(stay.length, 7 * 8 * 2);
  assert.deepEqual(
    stay.slice((1 * 8 + 6) * 2, (1 * 8 + 6) * 2 + 2),
    [1200, 5],
    'Montag, ab 14:00 (Uhr lief 2 h weiter)',
  );
  assert.equal(stay.filter(v => v > 0).length, 2);
  assert.equal(x.state().signal.stayMinutes, 20);
  // Two children out for 5 and 15 minutes: the next seat is expected in about 5 minutes.
  x.tap(k(20));
  x.wait(10 * 60000);
  x.tap(k(21));
  x.wait(5 * 60000);
  assert.equal(x.state().signal.nextFreeIn, 300);
  x.wait(10 * 60000);
  assert.equal(x.state().signal.nextFreeIn, 0, 'überfällig: gleich');
  // A return learned and then undone leaves the learned values unchanged.
  const before = { ...x.state().flow, stay: x.e.snapshot().flow.stay };
  x.tap(k(20));
  assert.equal(x.state().flow.stayN, 6);
  assert.equal(x.cmd({ type: 'undo' }).ok, true);
  const after = { ...x.state().flow, stay: x.e.snapshot().flow.stay };
  assert.equal(after.stayN, before.stayN);
  assert.equal(after.stayAvg, before.stayAvg);
  assert.deepEqual(after.stay, before.stay);
  // Saved and loaded again; after a reboot issue times are unknown: no estimate until new issues.
  const saved = x.e.snapshot();
  const broken = structuredClone(saved);
  broken.flow.stay = [1, 2, 3];
  assert.equal(x.e.restore(broken).ok, false, 'kaputte Tabelle wird abgewiesen');
  x.e.restore(saved);
  assert.equal(x.state().flow.stayN, before.stayN);
  x.cmd({ type: 'restart' });
  assert.equal(x.state().flow.stayAvg, before.stayAvg);
  // Learned values are deleted with "Gelerntes".
  x.cmd({ type: 'confirm' });
  assert.equal(x.cmd({ type: 'clearData', confirmed: true, learned: true }).ok, true);
  assert.equal(x.state().flow.stayN, 0);
});
test('Tagesbericht: höchste Belegung und Mensa-Spitze, alte Berichte laden weiter', async () => {
  const x = await setup();
  x.cmd({ type: 'room', room: 'M', capacity: 64, limit: 64, open: true });
  for (let i = 1; i <= 4; i++) x.tap(k(i));
  x.tap('sim:M01');
  x.tap('sim:M02');
  x.tap(k(1));
  x.tap('sim:M01');
  const t = x.state().flow.today;
  assert.equal(t.length, 15);
  assert.equal(t[13], 6);
  assert.equal(t[14], 2);
  // Reports before 0.16 had 12 or 13 values.
  const s = x.e.snapshot();
  s.flow.history = [s.flow.today.slice(0, 12), s.flow.today.slice(0, 13)];
  s.flow.today = s.flow.today.slice(0, 13);
  delete s.flow.stay;
  delete s.flow.stayAvg;
  delete s.flow.stayN;
  x.e.restore(s);
  const f = x.state().flow;
  assert.deepEqual(
    f.history.map(d => d.length),
    [15, 15],
  );
  assert.equal(f.history[0][14], -1);
  assert.equal(f.stayN, 0);
});
test('Mensa-Assistent: Küche voll, Vorschlag aus gleichen Wochentagen, Ring öffnet mit Vorschlag', async () => {
  const x = await setup();
  x.cmd({ type: 'room', room: 'K', capacity: 48, limit: 5, open: true });
  for (let i = 1; i <= 3; i++) x.tap(k(i));
  assert.equal(x.state().signal.mensaHint, -1, 'noch genug Platz');
  x.tap(k(4));
  assert.equal(x.state().signal.mensaHint, 20, 'ohne Daten 20');
  assert.equal(x.state().signal.mensaBasis, 0);
  const shown = () =>
    x.e
      .call({ op: 'dial', now: x.now })
      .filter(i => i[0] === 't')
      .map(i => i[5]);
  assert.ok(shown().includes('Mensa öffnen? Drehen'));
  assert.ok(textWidth('Mensa öffnen? Drehen', 1) <= 186, 'Hinweis passt in die Pille');
  // Turning opens the Mensa setting with the suggestion.
  x.cmd({ type: 'dialTurn', steps: 1 });
  x.cmd({ type: 'dialTurn', steps: 1 });
  assert.equal(x.state().mensaEdit, 20);
  x.wait(600);
  assert.match(x.cmd({ type: 'dialPress' }).message, /20 Plätze/);
  assert.equal(x.state().signal.mensaHint, -1, 'Mensa offen');
  // Monday with 23 Mensa seats used, then Tuesday with 40: next Monday suggests 25.
  x.cmd({ type: 'room', room: 'M', capacity: 64, limit: 64, open: true });
  for (let i = 1; i <= 23; i++) x.tap(`sim:M${String(i).padStart(2, '0')}`);
  // Next morning: the clock shows the new weekday, then the new serving day is started.
  const day = weekday => {
    x.wait(20 * 60000);
    for (const c of x.state().cards.filter(c => c.out)) x.tap(c.uid);
    x.wait(3600000);
    x.cmd({ type: 'measurementContext', weekday, minute: 600, queue: 0 });
    x.cmd({ type: 'newDay', confirmed: true });
  };
  day(2);
  x.cmd({ type: 'room', room: 'M', capacity: 64, limit: 64, open: true });
  for (let i = 1; i <= 40; i++) x.tap(`sim:M${String(i).padStart(2, '0')}`);
  day(1);
  const hist = x.state().flow.history;
  assert.deepEqual(
    hist.map(d => [d[1], d[14]]),
    [
      [1, 23],
      [2, 40],
    ],
  );
  x.cmd({ type: 'room', room: 'K', capacity: 48, limit: 1, open: true });
  assert.equal(x.state().signal.mensaHint, 25);
  assert.equal(x.state().signal.mensaBasis, 1, 'ein früherer Montag');
  // The staff menu also starts with the suggestion.
  x.cmd({ type: 'staffLearn' });
  x.tap('staff-1');
  x.tap('staff-1');
  // Turn until the selected (middle) entry is "Mensa freigeben".
  const selected = () => x.e.call({ op: 'dial', now: x.now }).find(i => i[0] === 't' && i[2] === 105)?.[5];
  for (let i = 0; i < 10 && selected() !== 'Mensa freigeben'; i++) x.cmd({ type: 'dialTurn', steps: 1 });
  assert.equal(selected(), 'Mensa freigeben');
  x.cmd({ type: 'dialPress' });
  assert.equal(x.state().mensaEdit, 25);
});
test('Hinweise: fehlende Karten und Sofort-Rückgaben werden gezählt und zurückgesetzt', async () => {
  const x = await setup();
  x.tap(k(7));
  x.cmd({ type: 'newDay', confirmed: true });
  let c = card(x.state(), 'K07');
  assert.equal(c.missed, 1);
  assert.equal(c.lost, true);
  x.tap(k(7)); // back again and free
  x.tap(k(12));
  x.wait(10000);
  x.tap(k(12));
  c = card(x.state(), 'K12');
  assert.equal(c.quick, 1);
  // Undo of the quick return takes the counter back.
  assert.equal(x.cmd({ type: 'undo' }).ok, true);
  assert.equal(card(x.state(), 'K12').quick, undefined);
  x.wait(10000);
  x.tap(k(12));
  assert.equal(card(x.state(), 'K12').quick, 1);
  // Stored with the cards (also in the compact Dial text) and loaded again.
  const saved = x.e.snapshot();
  assert.equal(card(saved, 'K07').missed, 1);
  assert.equal(card(saved, 'K01').missed, undefined, 'Nullen werden nicht gespeichert');
  x.e.restore(saved);
  assert.equal(card(x.state(), 'K07').missed, 1);
  const bad = structuredClone(saved);
  card(bad, 'K07').missed = -1;
  assert.equal(x.e.restore(bad).ok, false, 'ungültiger Zähler wird abgewiesen');
  // Done: one number, then all.
  assert.equal(x.cmd({ type: 'cardFlags', label: 'K07' }).ok, true);
  assert.equal(card(x.state(), 'K07').missed, undefined);
  assert.equal(x.cmd({ type: 'cardFlags', label: 'X99' }).ok, false);
  assert.equal(x.cmd({ type: 'clearData', confirmed: true, flags: true }).ok, true);
  assert.equal(card(x.state(), 'K12').quick, undefined);
});
