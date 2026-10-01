import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../server/engine.mjs';

const texts = list => list.filter(i => i[0] === 't').map(i => i[5]);
// Shown text with wrapped lines joined.
const shown = list => texts(list).join(' ');
// Engine with a clock: `at(y, m, d, h, mi)` sets tablet/RTC time including the calendar date.
async function setup() {
  const e = await createEngine();
  let now = 100000;
  const cmd = c => e.command(c, now);
  const x = {
    e,
    cmd,
    wait: ms => (now += ms),
    tick: () => cmd({ type: 'tick' }),
    state: () => e.status(now),
    dial: (o = {}) => e.call({ op: 'dial', now, ...o }),
    tap: uid => {
      const r = cmd({ type: 'scan', uid });
      cmd({ type: 'remove' });
      now += 1000;
      return r;
    },
    clock: (y, m, d, h, mi, s = 0, type = 'clockSync') =>
      cmd({
        type,
        weekday: new Date(y, m - 1, d).getDay(),
        minute: h * 60 + mi,
        queue: 0,
        date: [y, m, d, h, mi, s],
      }),
    reboot: () => e.call({ op: 'rebootClock', now }),
    get now() {
      return now;
    },
  };
  return x;
}

test('Neuer Tag nach Datum: auch nach genau 7 Tagen Pause, leere Tage zählen nicht', async () => {
  const x = await setup();
  x.clock(2026, 9, 21, 9, 0, 0, 'measurementContext');
  x.cmd({ type: 'confirm' });
  x.cmd({ type: 'flowSettings', yellow: 0, batch: 3 });
  x.cmd({ type: 'pause', paused: false });
  x.cmd({ type: 'autoSettings', on: true, start: 20, dayStart: 600 });
  assert.ok(x.e.snapshot().flow.dayDate > 20000);
  x.tap('sim:K01');
  x.wait(15000);
  x.tap('sim:K01');
  // Same weekday one week later: the date differs, so a new day starts.
  x.wait(7 * 86400000);
  x.clock(2026, 9, 28, 10, 30);
  const r = x.tick();
  assert.match(r.message, /automatisch/);
  assert.equal(x.state().day, 2);
  assert.equal(x.state().flow.history.length, 1);
  // Saturday without anyone eating: no new serving day in the report.
  x.wait(5 * 86400000);
  x.clock(2026, 10, 3, 10, 30);
  assert.match(x.tick().message, /automatisch/);
  assert.equal(x.state().day, 2);
  assert.equal(x.state().flow.history.length, 1);
  assert.equal(x.tick().changed, false);
});

test('Neustart mit Karten draußen: 30-Minuten-Schutz gilt ab Neustart', async () => {
  const x = await setup();
  x.clock(2026, 9, 21, 9, 0, 0, 'measurementContext');
  x.cmd({ type: 'confirm' });
  x.cmd({ type: 'flowSettings', yellow: 0, batch: 3 });
  x.cmd({ type: 'pause', paused: false });
  x.cmd({ type: 'autoSettings', on: true, start: 20, dayStart: 600 });
  x.tap('sim:K01');
  x.wait(86400000);
  x.reboot();
  x.clock(2026, 9, 22, 11, 0);
  assert.equal(x.state().dayWaiting, false, 'direkt nach dem Neustart kein neuer Tag');
  x.wait(31 * 60000);
  assert.equal(x.state().dayWaiting, true);
  assert.equal(x.tick().changed, false);
  assert.equal(x.state().rooms.K.occupied, 1);
});

test('Neustart am selben Tag: Bestand bleibt bestätigt, Countdown läuft weiter', async () => {
  const x = await setup();
  x.clock(2026, 9, 21, 12, 0, 0, 'measurementContext');
  x.cmd({ type: 'confirm' });
  x.cmd({ type: 'flowSettings', yellow: 0, batch: 3 });
  x.cmd({ type: 'autoSettings', on: true, start: 20, startGroup: 3 });
  x.cmd({ type: 'pause', paused: false });
  for (const k of ['K01', 'K02', 'K03']) x.tap('sim:' + k);
  x.tick();
  const before = x.state().flow;
  assert.equal(before.waiting, true);
  const span = before.releaseAt - x.now;
  assert.ok(span > 10000);
  x.wait(5000);
  x.reboot();
  assert.equal(x.state().ready, false);
  x.wait(3000);
  const r = x.clock(2026, 9, 21, 12, 0, 11);
  assert.match(r.message, /Bestand gültig/);
  const s = x.state();
  assert.equal(s.ready, true);
  const left = s.flow.releaseAt - x.now;
  assert.ok(Math.abs(left - (span - 8000)) <= 2000, `Rest ${left} statt ${span - 8000}`);
  // Next day: no automatic confirmation.
  x.reboot();
  x.clock(2026, 9, 22, 12, 0);
  assert.equal(x.state().ready, false);
  // Explicit restart from the tablet: always check again.
  x.cmd({ type: 'confirm' });
  x.cmd({ type: 'restart' });
  x.clock(2026, 9, 22, 12, 1);
  assert.equal(x.state().ready, false);
});

test('Ring: eine Raste öffnet die Mensa nicht, zwei schon; Touch-Feld ist OK', async () => {
  const x = await setup();
  x.cmd({ type: 'confirm' });
  x.cmd({ type: 'dialTurn', steps: 1 });
  assert.equal(x.state().mensaEdit, -1);
  assert.ok(shown(x.dial()).includes('Mensa: weiter drehen'));
  x.wait(2000);
  x.cmd({ type: 'dialTurn', steps: 1 });
  assert.equal(x.state().mensaEdit, -1, 'zwei einzelne Rasten mit Pause');
  x.wait(300);
  x.cmd({ type: 'dialTurn', steps: 1 });
  assert.equal(x.state().mensaEdit, 2);
  x.wait(200);
  assert.equal(x.cmd({ type: 'dialPress' }).changed, false, 'Druck beim Drehen zählt nicht');
  x.wait(600);
  assert.equal(x.cmd({ type: 'relief' }).ok, true);
  assert.equal(x.state().rooms.M.limit, 2);
  assert.equal(x.state().rooms.M.open, true);
  assert.equal(x.state().flow.relief, false, 'Touch hat nicht entlastet');
});

test('Erinnerung: Pause oder Entlastung länger als eingestellt', async () => {
  const x = await setup();
  x.cmd({ type: 'confirm' });
  x.cmd({ type: 'relief' });
  assert.equal(x.state().reminders, 0);
  x.wait(3 * 60000 + 1000);
  assert.equal(x.state().reminders, 1);
  assert.ok(shown(x.dial()).includes('Noch Entlastung? Taste'));
  x.wait(3 * 60000);
  assert.equal(x.state().reminders, 2);
  x.cmd({ type: 'pause', paused: false });
  assert.equal(x.state().reminders, 0);
  x.cmd({ type: 'settings', cooldown: 10, remind: 0 });
  x.cmd({ type: 'pause', paused: true });
  x.wait(30 * 60000);
  assert.equal(x.state().reminders, 0);
  const snap = x.e.snapshot();
  assert.equal(snap.remind, 0);
});

test('Halten: Fortschrittsring am Dial', async () => {
  const x = await setup();
  const arcs = l => l.filter(i => i[0] === 'a');
  assert.equal(arcs(x.dial({ holdMs: 0 })).length, 0);
  const half = x.dial({ holdMs: 1500 });
  assert.ok(arcs(half).length >= 1);
  assert.ok(shown(half).includes('Halten …'));
  assert.ok(shown(x.dial({ holdMs: 3200 })).includes('Jetzt loslassen'));
  assert.ok(shown(x.dial({ holdMs: 10500 })).includes('Loslassen: Zugang neu'));
  assert.ok(shown(x.dial({ screen: 'reset' })).includes('Nochmal 3 s halten: JA'));
});

test('Alte Stände ohne Datum laden weiter', async () => {
  const x = await setup();
  const snap = x.e.snapshot();
  for (const k of ['date', 'dayDate', 'secondAt', 'releaseWall', 'releaseSpan']) delete snap.flow[k];
  delete snap.remind;
  delete snap.readyDate;
  const e = await createEngine();
  assert.equal(e.restore(snap).ok, true);
  assert.equal(e.snapshot().remind, 3);
});

test('Eine Version für Firmware, PC-Dienst und Vorführung', async () => {
  const { readFileSync } = await import('node:fs');
  const { VERSION } = await import('../src/version.mjs');
  const hpp = readFileSync('firmware/src/version.hpp', 'utf8');
  assert.equal(/MENSA_VERSION "([^"]+)"/.exec(hpp)[1], VERSION);
  assert.doesNotMatch(readFileSync('firmware/src/main.cpp', 'utf8'), /\d+\.\d+\.\d+-preview/);
});

test('Sperrzeit: Countdown am Dial, eingelernte Karten sofort nutzbar', async () => {
  const x = await setup();
  x.cmd({ type: 'confirm' });
  assert.equal(x.tap('sim:K05').ok, true);
  x.wait(500);
  const r = x.tap('sim:K05');
  assert.equal(r.ok, false);
  assert.match(r.message, /K05: Sperrzeit, noch 2 s/);
  // tap() advances the clock by 1 s after each scan: 0.5 s of the lock are left now.
  assert.ok(shown(x.dial()).includes('K05 gesperrt'));
  assert.ok(
    x.dial().some(i => i[0] === 't' && i[3] === 5 && i[5] === '1'),
    'zählt live herunter',
  );
  x.wait(600);
  assert.ok(!shown(x.dial()).includes('K05 gesperrt'));
  const e = x.e;
  e.call({ op: 'hardware' });
  const now = x.now;
  e.command({ type: 'confirm' }, now);
  e.command({ type: 'seriesStart', room: 'K' }, now);
  e.command({ type: 'scan', uid: '04:01' }, now);
  e.command({ type: 'remove' }, now);
  e.command({ type: 'seriesStop' }, now);
  e.command({ type: 'pause', paused: false }, now);
  assert.equal(e.command({ type: 'scan', uid: '04:01' }, now + 100).ok, true, 'direkt nach dem Einlernen buchbar');
  e.command({ type: 'remove' }, now + 100);
  assert.equal(e.command({ type: 'bind', uid: 'sim:K02', newUid: '04:02' }, now + 200).ok, true);
  assert.equal(e.command({ type: 'scan', uid: '04:02' }, now + 300).ok, true);
});

test('Karte lösen und Nummer löschen', async () => {
  const e = await createEngine();
  e.call({ op: 'hardware' });
  e.command({ type: 'confirm' }, 100);
  e.command({ type: 'bind', uid: 'sim:K01', newUid: '04:AA' }, 100);
  assert.equal(e.command({ type: 'unbind', uid: 'sim:K02' }, 200).ok, false, 'ohne Karte nichts zu lösen');
  e.command({ type: 'scan', uid: '04:AA' }, 5000);
  e.command({ type: 'remove' }, 5000);
  assert.equal(e.command({ type: 'unbind', uid: '04:AA' }, 5100).ok, false, 'ausgegebene Karte nicht lösbar');
  e.command({ type: 'scan', uid: '04:AA' }, 9000);
  e.command({ type: 'remove' }, 9000);
  const r = e.command({ type: 'unbind', uid: '04:AA' }, 9100);
  assert.equal(r.ok, true);
  const k01 = e.status(9100).cards.find(c => c.label === 'K01');
  assert.equal(k01.uid, 'sim:K01');
  assert.equal(e.status(9100).rooms.K.free, 0);
  assert.equal(e.command({ type: 'scan', uid: '04:AA' }, 9200).ok, false, 'gelöste Karte unbekannt');
  e.command({ type: 'remove' }, 9200);
  assert.equal(e.command({ type: 'bind', uid: 'sim:K01', newUid: '04:BB' }, 9300).ok, true, 'neu einlernbar');
  assert.equal(e.command({ type: 'removeSlot', label: 'K01' }, 9400).ok, false, 'erst lösen');
  assert.equal(e.command({ type: 'removeSlot', label: 'K48' }, 9400).ok, true);
  assert.equal(e.status(9400).cards.length, 111);
  assert.equal(e.command({ type: 'removeSlot', label: 'K48' }, 9500).ok, false);
});

test('Abgewiesener Scan bleibt nie gebucht, auch mit Sicherungskopie des Aufrufers', async () => {
  const e = await createEngine();
  e.command({ type: 'confirm' }, 100);
  e.command({ type: 'room', room: 'K', capacity: 48, limit: 1, open: true }, 100);
  e.command({ type: 'scan', uid: 'sim:K01' }, 200);
  e.command({ type: 'remove' }, 200);
  for (const backup of [false, true]) {
    const r = JSON.parse(
      JSON.stringify(e.call({ op: 'command', backup, now: 300, command: { type: 'scan', uid: 'sim:K02' } })),
    );
    assert.equal(r.ok, false);
    assert.equal(e.status(300).rooms.K.occupied, 1, 'kein zweiter Platz belegt');
    assert.equal(e.status(300).held, 'sim:K02', 'aufliegende Karte bleibt gemerkt');
    e.command({ type: 'remove' }, 300);
  }
});

test('Eingespielter Bestand wird nie automatisch bestätigt', async () => {
  const x = await setup();
  x.clock(2026, 9, 21, 9, 0);
  x.cmd({ type: 'confirm' });
  const saved = x.e.snapshot();
  x.e.call({ op: 'restore', state: saved });
  x.reboot();
  x.e.call({ op: 'requireConfirmation' });
  x.clock(2026, 9, 21, 9, 1);
  assert.equal(x.state().ready, false);
});

test('Betreuerkarte nicht als Kinderkarte; Nummer löschen beim Einlernen springt weiter', async () => {
  const e = await createEngine();
  e.call({ op: 'hardware' });
  e.command({ type: 'staffLearn' }, 100);
  e.command({ type: 'scan', uid: '04:ST' }, 100);
  e.command({ type: 'remove' }, 100);
  assert.equal(e.command({ type: 'bind', uid: 'sim:K01', newUid: '04:ST' }, 200).ok, false);
  assert.equal(e.command({ type: 'enroll', uid: '04:ST', label: 'K99', room: 'K' }, 200).ok, false);
  e.command({ type: 'seriesStart', room: 'K' }, 300);
  assert.equal(e.status(300).series.label, 'K01');
  assert.equal(e.command({ type: 'removeSlot', label: 'K01' }, 300).ok, true);
  assert.equal(e.status(300).series.label, 'K02');
  e.command({ type: 'scan', uid: '04:01' }, 400);
  assert.equal(e.status(400).cards.find(c => c.label === 'K02').uid, '04:01');
});

test('Rückgängig stellt Gruppenzähler zurück; Sperr-Countdown verdeckt keine neue Rückmeldung', async () => {
  const e = await createEngine();
  e.command({ type: 'confirm' }, 100);
  e.command({ type: 'flowSettings', yellow: 0, batch: 2 }, 100);
  e.command({ type: 'pause', paused: false }, 100);
  e.command({ type: 'scan', uid: 'sim:K01' }, 200);
  e.command({ type: 'remove' }, 200);
  e.command({ type: 'scan', uid: 'sim:K02' }, 300);
  e.command({ type: 'remove' }, 300);
  assert.equal(e.status(300).flow.waiting, true);
  assert.equal(e.command({ type: 'undo' }, 400).ok, true);
  const f = e.status(400).flow;
  assert.equal(f.waiting, false);
  assert.equal(f.issued, 1);
  assert.equal(f.today[2], 1);
  // K01 is locked; then another child's scan shows its own feedback instead of the countdown.
  e.command({ type: 'scan', uid: 'sim:K01' }, 500);
  e.command({ type: 'remove' }, 500);
  assert.ok(shown(e.call({ op: 'dial', now: 600 })).includes('K01 gesperrt'));
  e.command({ type: 'scan', uid: 'sim:K03' }, 600);
  assert.ok(!shown(e.call({ op: 'dial', now: 700, feedback: 'K03 ausgegeben.' })).includes('K01 gesperrt'));
});
