import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEngine } from '../server/engine.mjs';
import { createApp } from '../server/main.mjs';
import { textWidth, capHeight, supported } from '../src/dial-paint.mjs';
// The text box (cap height plus descenders) lies completely inside the round display.
const fits = (y, size, t) => {
  const half = textWidth(t, size) / 2,
    rows = [y - capHeight(size) / 2 - 1, y + capHeight(size) / 2 + 4];
  return rows.every(r => (half + 1) ** 2 + (r - 120) ** 2 <= 119 * 119);
};
// Monday 12:30, groups of three children, automatic release with a start value of 20 s per child.
async function setup({ auto = true, start = 20 } = {}) {
  const e = await createEngine();
  let now = 100000;
  const cmd = c => e.command(c, now),
    tap = uid => {
      const r = cmd({ type: 'scan', uid });
      cmd({ type: 'remove' });
      return r;
    };
  cmd({ type: 'confirm' });
  cmd({ type: 'measurementContext', weekday: 1, minute: 750, queue: 0 });
  cmd({ type: 'flowSettings', yellow: 0, batch: 3 });
  cmd({ type: 'pause', paused: false });
  if (auto) assert.equal(cmd({ type: 'autoSettings', on: true, start, startGroup: 3 }).ok, true);
  let card = 1;
  const group = () => {
    for (let i = 0; i < 3; i++) assert.equal(tap(`sim:K${String(card++).padStart(2, '0')}`).ok, true);
  };
  return {
    e,
    cmd,
    tap,
    group,
    wait: ms => (now += ms),
    tick: () => cmd({ type: 'tick' }),
    state: () => e.status(now),
    dial: (x = {}) => e.call({ op: 'dial', now, ...x }),
    get now() {
      return now;
    },
  };
}
const texts = list => list.filter(i => i[0] === 't').map(i => i[5]);
// Shown text with wrapped lines joined.
const shown = list => texts(list).join(' ');
test('Automatik: volle Gruppe wird nach gelernter Zeit von selbst freigegeben', async () => {
  const x = await setup();
  x.group();
  assert.equal(x.state().signal.reason, 'batch');
  assert.equal(x.state().flow.auto.releaseIn, 60);
  assert.ok(shown(x.dial()).includes('1:00 nächste Gruppe'));
  x.wait(59000);
  assert.equal(x.tick().changed, false);
  assert.equal(x.state().signal.reason, 'batch');
  x.wait(1000);
  const r = x.tick();
  assert.equal(r.ok, true);
  assert.equal(r.changed, true);
  assert.equal(x.state().signal.reason, 'free');
  assert.match(x.state().events.at(-1).message, /automatisch freigegeben/);
});
test('Automatik aus: Gruppe bleibt rot, bis jemand freigibt', async () => {
  const x = await setup({ auto: false });
  x.group();
  x.wait(3600000);
  assert.equal(x.tick().changed, false);
  assert.equal(x.state().signal.reason, 'batch');
  assert.equal(x.state().flow.auto.releaseIn, -1);
  assert.ok(shown(x.dial()).includes('Gruppe voll'));
  assert.equal(x.cmd({ type: 'pause', paused: false }).ok, true);
  assert.equal(x.state().signal.reason, 'free');
});
test('Taste im Countdown gibt sofort frei und lernt kürzere Zeit', async () => {
  const x = await setup();
  x.group();
  x.wait(30000);
  assert.equal(x.cmd({ type: 'pause', paused: false }).ok, true);
  assert.equal(x.state().signal.reason, 'free');
  const a = x.state().flow.auto;
  assert.equal(a.faster, 1);
  assert.equal(a.perChild, 170);
  assert.equal(a.level, 'global');
});
test('Entlasten nach automatischer Freigabe verlängert, ruhige Gruppen verkürzen leicht', async () => {
  const x = await setup();
  x.group();
  x.wait(60000);
  x.tick();
  assert.equal(x.state().flow.autoReleased, true);
  assert.equal(x.cmd({ type: 'relief' }).ok, true);
  let a = x.state().flow.auto;
  assert.equal(a.slower, 1);
  assert.equal(a.perChild, 240);
  assert.equal(x.state().signal.reason, 'relief');
  x.wait(1000);
  assert.equal(x.tick().changed, false);
  x.cmd({ type: 'pause', paused: false });
  assert.equal(x.state().flow.autoReleased, false);
  x.wait(10000);
  x.group();
  x.wait(72000);
  x.tick();
  x.wait(10000);
  x.group();
  x.wait(72000);
  x.tick();
  a = x.state().flow.auto;
  assert.equal(a.perChild, 233);
});
test('Keine automatische Freigabe bei Pause, Entlastung, unbestätigtem Bestand oder laufender Gruppenmessung', async () => {
  const x = await setup();
  x.group();
  x.cmd({ type: 'pause', paused: true });
  x.wait(120000);
  x.tick();
  assert.equal(x.state().signal.reason, 'paused');
  const y = await setup();
  y.group();
  y.cmd({ type: 'relief' });
  y.wait(120000);
  y.tick();
  assert.equal(y.state().signal.reason, 'relief');
  const z = await setup();
  z.group();
  z.cmd({ type: 'restart' });
  z.wait(120000);
  z.tick();
  assert.equal(z.state().ready, false);
  assert.equal(z.state().flow.waiting, true);
  z.cmd({ type: 'confirm' });
  assert.equal(z.tick().changed, true);
  assert.equal(z.state().flow.auto.releaseIn, 60);
  const m = await setup();
  m.cmd({ type: 'measurementArm', kind: 1 });
  m.group();
  m.wait(120000);
  m.tick();
  assert.equal(m.state().signal.reason, 'batch');
  assert.ok(shown(m.dial()).includes('Tablet: Alle haben Essen'));
  assert.equal(m.cmd({ type: 'measurementFinish' }).ok, true);
  assert.equal(m.tick().changed, true);
  assert.equal(m.state().signal.reason, 'free');
});
test('Gruppenmessungen lernen je Halbstunde und Einstellungen werden geprüft', async () => {
  const x = await setup({ auto: false });
  for (let i = 0; i < 3; i++) {
    x.cmd({ type: 'measurementArm', kind: 1 });
    x.group();
    x.wait(45000);
    assert.equal(x.cmd({ type: 'measurementFinish' }).ok, true);
    x.cmd({ type: 'pause', paused: false });
    x.wait(10000);
  }
  const f = x.state().flow;
  assert.deepEqual(f.autoSlots, [[1, 25, 150, 3, 0]]);
  assert.equal(f.auto.level, 'slot');
  assert.equal(f.auto.perChild, 150);
  assert.equal(x.cmd({ type: 'autoSettings', on: true, start: 500 }).ok, false);
  assert.equal(x.cmd({ type: 'flowSettings', yellow: 0, batch: 0 }).ok, true);
  assert.equal(x.cmd({ type: 'autoSettings', on: true, start: 20 }).ok, false);
  x.cmd({ type: 'flowSettings', yellow: 0, batch: 3 });
  x.cmd({ type: 'autoSettings', on: true, start: 20, startGroup: 3 });
  x.cmd({ type: 'flowSettings', yellow: 0, batch: 0 });
  assert.equal(x.state().flow.autoOn, false);
  x.cmd({ type: 'flowSettings', yellow: 0, batch: 3 });
  assert.equal(x.cmd({ type: 'autoSettings', on: false, start: 20, reset: true }).ok, true);
  assert.equal(x.state().flow.autoGlobalN, 0);
  assert.deepEqual(x.state().flow.autoSlots, []);
});
test('Alte Speicherstände übernehmen Gruppenmessungen, Neustart verwirft Countdown', async () => {
  const x = await setup({ auto: false });
  x.cmd({ type: 'measurementArm', kind: 1 });
  x.group();
  x.wait(30000);
  x.cmd({ type: 'measurementFinish' });
  const snap = x.e.snapshot();
  for (const k of Object.keys(snap.flow)) if (k.startsWith('auto') || k === 'releaseAt') delete snap.flow[k];
  const e = await createEngine();
  assert.equal(e.restore(snap).ok, true);
  assert.equal(e.status(0).flow.autoGlobalN, 1);
  assert.equal(e.status(0).flow.autoGlobal, 100);
  assert.equal(e.status(0).flow.autoOn, false);
  const y = await setup();
  y.group();
  assert.ok(y.state().flow.releaseAt > 0);
  y.cmd({ type: 'restart' });
  assert.equal(y.state().flow.releaseAt, -1);
  const bad = y.e.snapshot();
  bad.flow.autoSlots = [[9, 0, 100, 1]];
  assert.equal((await createEngine()).restore(bad).ok, false);
});
test('Dial-Anzeige: groß, farbig, alles passt in die runde Anzeige', async () => {
  const x = await setup();
  const check = list => {
    for (const i of list.filter(i => i[0] === 't')) {
      assert.ok(supported(i[5], i[3]), `${i[5]}: Zeichen fehlen in Größe ${i[3]}`);
      assert.ok(fits(i[2], i[3], i[5]), `${i[5]} (Größe ${i[3]})`);
    }
    return list;
  };
  let list = check(x.dial());
  assert.deepEqual(list[0], ['g', 0x1d08, 0x0ac5, 1], 'grüner Verlauf');
  assert.ok(
    list.some(i => i[0] === 't' && i[3] === 5 && i[5] === '3'),
    'große Zahl: Startgruppe',
  );
  assert.ok(shown(list).includes('Startgruppe'));
  assert.ok(shown(list).includes('K 48 · M 0'));
  assert.ok(
    list.some(i => i[0] === 't' && i[5] === 'ENTLASTEN' && i[2] === 202),
    'Knopf unten',
  );
  list = check(
    x.dial({ feedback: 'Einlass pausiert. Nur Rückgaben möglich, bitte später erneut versuchen.', feedbackOk: false }),
  );
  assert.ok(shown(list).includes('Einlass pausiert.'), 'erster Satz groß');
  assert.ok(list.some(i => i[0] === 't' && i[3] === 1 && i[5].startsWith('Nur Rückgaben') && i[5].endsWith('…')));
  assert.ok(
    list.some(i => i[0] === 'c' && i[4] === 0xffff),
    'Symbol in weißer Scheibe',
  );
  assert.deepEqual(x.dial({ blocked: true })[0], ['g', 0xea28, 0x90c3, 1]);
  assert.ok(shown(x.dial({ hint: 'Leser prüfen!' })).includes('Leser prüfen!'));
  x.group();
  list = check(x.dial());
  assert.equal(list[0][1], 0xea28);
  const arcs = list.filter(i => i[0] === 'a');
  assert.equal(arcs.length, 2, 'Spur und Fortschritt');
  assert.deepEqual(arcs[0].slice(1, 7), [120, 120, 110, 118, 0, 360]);
  assert.deepEqual(arcs[1].slice(1, 7), [120, 120, 110, 118, 270, 630]);
  assert.ok(shown(list).includes('1:00 nächste Gruppe'));
  x.wait(45000);
  assert.deepEqual(
    x
      .dial()
      .filter(i => i[0] === 'a')
      .map(i => i.slice(5, 7)),
    [
      [0, 360],
      [270, 360],
    ],
  );
  x.cmd({ type: 'relief' });
  check(x.dial());
  assert.ok(!x.dial().some(i => i[0] === 'a'));
  assert.ok(shown(x.dial()).includes('Entlastung'));
  check(
    x.dial({
      screen: 'credentials',
      ssid: 'Mensaampel-1234',
      wifi: 'geheim-lang-und-sicher-2026',
      setupCode: 'AB12CD34EF',
      configured: false,
    }),
  );
  check(x.dial({ screen: 'reset' }));
  check(x.dial({ screen: 'broken' }));
  x.cmd({ type: 'dialTurn', steps: 10 });
  check(x.dial());
  x.cmd({ type: 'restart' });
  check(x.dial());
});
test('PC-Dienst: Zeitgeber gibt Gruppe frei, speichert und meldet am Dial', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mensa-auto-'));
  try {
    const app = await createApp({ dataDir: dir });
    const t = c => app.transact(c);
    t({ type: 'confirm' });
    t({ type: 'flowSettings', yellow: 0, batch: 1 });
    t({ type: 'pause', paused: false });
    t({ type: 'autoSettings', on: true, start: 3, startGroup: 1 });
    assert.equal(app.state().flow.clockValid, true);
    t({ type: 'tap', uid: 'sim:K01' });
    assert.equal(app.state().signal.reason, 'batch');
    assert.ok(app.state().dial.some(i => i[5] === 'K01 ausgegeben.'));
    t({ type: 'advance', seconds: 10 });
    assert.equal(app.state().signal.reason, 'free');
    assert.ok(shown(app.state().dial).includes('Nächste Gruppe automatisch'));
    const again = await createApp({ dataDir: dir });
    assert.equal(again.state().flow.autoOn, true);
    assert.equal(again.state().flow.autoReleased, false);
    again.stop();
    app.stop();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Start group builds the queue; later groups follow at the pace of their own size.
async function sized() {
  const x = await setup({ auto: false });
  x.cmd({ type: 'autoSettings', on: true, start: 20, startGroup: 6, sizeMin: 2, sizeMax: 5, idleMinutes: 5 });
  let card = 1;
  const take = n => {
    for (let i = 0; i < n; i++) assert.equal(x.tap(`sim:K${String(card++).padStart(2, '0')}`).ok, true);
  };
  return { ...x, take };
}
test('Startgruppe zu Beginn, danach normale Gruppen im Takt', async () => {
  const x = await sized();
  let f = x.state().flow;
  assert.equal(f.auto.nextSize, 6);
  assert.equal(f.auto.nextIsStart, true);
  assert.ok(shown(x.dial()).includes('6 Startgruppe'));
  x.take(5);
  assert.equal(x.state().signal.reason, 'free');
  assert.ok(shown(x.dial()).includes('1 noch diese Gruppe'));
  x.take(1);
  assert.equal(x.state().signal.reason, 'batch');
  assert.equal(x.state().flow.auto.releaseIn, 60);
  assert.equal(x.state().signal.releaseIn, 60);
  x.wait(60000);
  x.tick();
  f = x.state().flow;
  assert.equal(f.auto.nextSize, 3);
  assert.equal(f.auto.nextIsStart, false);
  assert.ok(shown(x.dial()).includes('3 nächste Gruppe'));
  x.take(3);
  assert.equal(x.state().signal.reason, 'batch');
  x.wait(60000);
  x.tick();
  assert.equal(x.state().signal.reason, 'free');
  x.wait(300000);
  assert.equal(x.state().flow.auto.nextIsStart, true);
  assert.equal(x.state().flow.auto.nextSize, 6);
  const r = x.state().flow.today;
  assert.equal(r[2], 9);
  assert.equal(r[4], 2);
  assert.equal(r[5], 2);
});
test('Gruppengröße lernt mit Grenzen, Startgruppe getrennt', async () => {
  const x = await sized();
  x.take(6);
  x.wait(20000);
  x.cmd({ type: 'pause', paused: false });
  let f = x.state().flow;
  assert.equal(f.startLearned, 7);
  assert.equal(f.today[6], 1);
  x.take(3);
  x.wait(15000);
  x.cmd({ type: 'pause', paused: false });
  f = x.state().flow;
  assert.equal(f.sizeGlobal, 4);
  assert.equal(f.autoSlots[0][4], 4);
  x.take(4);
  x.wait(15000);
  x.cmd({ type: 'pause', paused: false });
  x.take(5);
  x.wait(15000);
  x.cmd({ type: 'pause', paused: false });
  assert.equal(x.state().flow.auto.normalSize, 5);
  x.take(5);
  x.wait(200000);
  x.tick();
  assert.equal(x.state().flow.autoReleased, true);
  x.cmd({ type: 'relief' });
  f = x.state().flow;
  assert.equal(f.auto.normalSize, 4);
  assert.equal(f.today[7], 1);
  assert.equal(f.today[8], 1);
});
test('Neuer Essenstag: mit Karten draußen erst nach 3 s Halten, fehlende Karten gesperrt, Tagesbericht', async () => {
  const x = await setup();
  x.cmd({ type: 'autoSettings', on: true, start: 20, startGroup: 3, dayStart: 600 });
  x.group();
  x.tap('sim:M01');
  assert.equal(x.state().flow.dayWeekday, 1);
  x.wait(24 * 3600000);
  x.cmd({ type: 'restart' });
  x.cmd({ type: 'measurementContext', weekday: 2, minute: 500, queue: 0 });
  assert.equal(x.tick().changed, false);
  assert.equal(x.state().rooms.K.occupied, 3);
  x.wait(100 * 60000);
  assert.equal(x.tick().changed, false, 'Karten draußen: kein automatischer Tagesstart');
  assert.equal(x.state().dayWaiting, true);
  assert.ok(shown(x.dial()).includes('Neuer Tag? 3 s halten'));
  const r = x.cmd({ type: 'dialHold' });
  assert.equal(r.ok, true);
  assert.match(r.message, /Bestandsprüfung/);
  const s = x.state();
  assert.equal(s.rooms.K.occupied, 0);
  assert.equal(s.ready, true);
  assert.equal(s.day, 2);
  assert.match(s.events.find(e => e.message.startsWith('Nicht zurück')).message, /K01, K02, K03/);
  assert.deepEqual(
    s.cards.filter(c => c.lost).map(c => c.label),
    ['K01', 'K02', 'K03'],
  );
  assert.equal(s.rooms.K.free, 45, 'verlorene Karten zählen nicht als frei');
  assert.equal(s.flow.history.length, 1);
  assert.equal(s.flow.history[0][11], 3);
  assert.equal(s.flow.today[0], 2);
  assert.equal(x.tick().changed, false);
  x.wait(15000);
  assert.match(x.tap('sim:K02').message, /K02 ist wieder da/);
  assert.equal(x.state().rooms.K.free, 46);
  assert.equal(x.state().rooms.K.occupied, 0);
  const e = await createEngine();
  assert.equal(e.restore(x.e.snapshot()).ok, true);
  assert.equal(e.status(0).flow.history.length, 1);
});
test('Dial: Bestand per Halten, Mensa per Drehring, Karten-Hinweis', async () => {
  const x = await setup({ auto: false });
  x.cmd({ type: 'restart' });
  assert.ok(shown(x.dial()).includes('Bestand ok?'));
  assert.equal(x.cmd({ type: 'dialPress' }).ok, false);
  assert.equal(x.cmd({ type: 'dialHold' }).ok, true);
  assert.equal(x.state().ready, true);
  assert.equal(x.cmd({ type: 'dialHold' }).handled, false);
  x.cmd({ type: 'room', room: 'M', capacity: 64, limit: 5, open: true });
  x.tap('sim:M01');
  x.tap('sim:M02');
  assert.equal(x.cmd({ type: 'dialTurn', steps: -10 }).changed, false);
  assert.equal(x.state().mensaEdit, 2);
  assert.ok(shown(x.dial()).includes('2') && shown(x.dial()).includes('MENSA'));
  assert.ok(!texts(x.dial()).some(t => t.startsWith('Küche') || t === 'Plätze frei' || t === 'Pause'));
  assert.equal(x.cmd({ type: 'relief' }).changed, false, 'Druck direkt beim Drehen wird ignoriert');
  assert.equal(x.state().mensaEdit, 2);
  x.cmd({ type: 'dialTurn', steps: 28 });
  x.wait(600);
  assert.equal(x.cmd({ type: 'dialPress' }).ok, true);
  let m = x.state().rooms.M;
  assert.equal(m.limit, 30);
  assert.equal(m.open, true);
  assert.equal(x.state().mensaEdit, -1);
  x.cmd({ type: 'dialTurn', steps: 3 });
  x.wait(16000);
  assert.equal(x.state().mensaEdit, -1);
  assert.equal(x.cmd({ type: 'dialPress' }).ok, true);
  assert.equal(x.state().paused, true);
  x.wait(1200000);
  assert.equal(x.state().cardsMissing, true);
  assert.ok(shown(x.dial()).includes('2 Karten fehlen'));
  assert.deepEqual(x.state().outCards, ['M01', 'M02']);
});
test('PC-Dienst: Sicherung einspielen, Ampel-Überwachung, Speichern nur bei Änderung', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mensa-backup-'));
  try {
    const app = await createApp({ dataDir: dir });
    const t = c => app.transact(c);
    t({ type: 'confirm' });
    t({ type: 'flowSettings', yellow: 0, batch: 3 });
    t({ type: 'autoSettings', on: true, start: 20, startGroup: 4 });
    t({ type: 'pause', paused: false });
    assert.equal(t({ type: 'tap', uid: 'sim:K01' }).ok, true);
    const backup = { format: 'mensa-pc-backup-1', state: app.engine.snapshot() };
    t({ type: 'newDay', confirmed: true });
    assert.equal(app.state().rooms.K.occupied, 0);
    assert.equal(app.restoreBackup({ confirmed: false, backup }).ok, false);
    assert.equal(app.restoreBackup({ confirmed: true, backup: { format: 'x', state: {} } }).ok, false);
    const broken = structuredClone(backup);
    broken.state.cards[0].room = 'X';
    assert.equal(app.restoreBackup({ confirmed: true, backup: broken }).ok, false);
    assert.equal(app.state().day, 2);
    const r = app.restoreBackup({ confirmed: true, backup });
    assert.equal(r.ok, true);
    const s = app.state();
    assert.equal(s.ready, false);
    assert.equal(s.rooms.K.occupied, 1);
    assert.equal(s.flow.startSize, 4);
    assert.equal(s.day, 1);
    const again = await createApp({ dataDir: dir });
    assert.equal(again.state().rooms.K.occupied, 1);
    again.stop();
    assert.equal(t({ type: 'dialTurn', steps: 2 }).changed, false);
    assert.equal(app.state().mensaEdit, 2);
    await new Promise(done => setTimeout(done, 600));
    assert.equal(t({ type: 'dialPress' }).ok, true);
    assert.equal(app.state().rooms.M.limit, 2);
    assert.ok(!shown(app.state().dial).includes('Ampel draußen'));
    await new Promise(done => app.server.listen(0, '127.0.0.1', done));
    const port = app.server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/signal`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).signal.releaseIn, -1);
    app.server.closeAllConnections();
    const realNow = Date.now;
    Date.now = () => realNow() + 11000;
    try {
      assert.ok(shown(app.state().dial).includes('Ampel draußen getrennt!'));
    } finally {
      Date.now = realNow;
    }
    app.server.closeAllConnections();
    app.server.close();
    app.stop();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Tagesstart erst nach 30 Minuten ohne Scan, Uhr stellen ohne Gruppe zu stören, Lautstärke', async () => {
  const x = await setup();
  x.cmd({ type: 'autoSettings', on: true, start: 20, startGroup: 3, dayStart: 600 });
  x.group();
  x.cmd({ type: 'clockSync', weekday: 2, minute: 700 });
  let f = x.state().flow;
  assert.equal(f.issued, 3);
  assert.equal(f.waiting, true);
  assert.ok(f.releaseAt > 0);
  x.wait(60000);
  assert.equal(x.tick().changed, true);
  assert.equal(x.state().day, 1);
  assert.match(x.state().events.at(-1).message, /automatisch freigegeben/);
  x.wait(28 * 60000);
  x.tick();
  assert.equal(x.state().day, 1);
  x.wait(2 * 60000);
  assert.equal(x.tick().changed, false, 'Gruppe noch draußen: Tagesstart wartet');
  assert.equal(x.state().dayWaiting, true);
  assert.match(x.cmd({ type: 'dialHold' }).message, /Essenstag nach Bestandsprüfung/);
  assert.equal(x.state().day, 2);
  assert.equal(x.state().volume, 7);
  assert.equal(x.cmd({ type: 'settings', cooldown: 10, volume: 11 }).ok, false);
  assert.equal(x.cmd({ type: 'settings', cooldown: 10, volume: 3 }).ok, true);
  assert.equal(x.state().volume, 3);
  const snap = x.e.snapshot();
  delete snap.volume;
  const e = await createEngine();
  assert.equal(e.restore(snap).ok, true);
  assert.equal(e.status(0).volume, 7);
});
test('Karten am Stück einlernen: der Reihe nach, überspringen, Doppelte, keine Buchung', async () => {
  const e = await createEngine();
  let now = 1000;
  const cmd = c => e.command(c, now),
    tap = uid => {
      const r = cmd({ type: 'scan', uid });
      cmd({ type: 'remove' });
      now += 1000;
      return r;
    };
  e.call({ op: 'hardware' });
  cmd({ type: 'confirm' });
  assert.equal(cmd({ type: 'seriesStart', room: 'K' }).ok, true);
  let s = e.status(now);
  assert.equal(s.series.label, 'K01');
  assert.equal(s.paused, true);
  const texts = l => l.filter(i => i[0] === 't').map(i => i[5]);
  assert.ok(shown(e.call({ op: 'dial', now })).includes('EINLERNEN'));
  assert.ok(shown(e.call({ op: 'dial', now })).includes('K01'));
  assert.equal(tap('04:AA:01').message, 'K01 gespeichert.');
  assert.equal(e.status(now).series.label, 'K02');
  assert.match(tap('04:AA:01').message, /schon K01/);
  cmd({ type: 'dialPress' });
  assert.equal(e.status(now).series.label, 'K03');
  tap('04:AA:03');
  s = e.status(now);
  assert.equal(s.cards.find(c => c.label === 'K03').uid, '04:AA:03');
  assert.equal(s.cards.find(c => c.label === 'K02').uid, 'sim:K02');
  assert.equal(s.rooms.K.occupied, 0);
  assert.equal(s.series.done, 2);
  cmd({ type: 'dialHold' });
  assert.equal(e.status(now).series.active, false);
  assert.equal(tap('04:AA:01').ok, false);
  cmd({ type: 'pause', paused: false });
  now += 10000;
  assert.equal(tap('04:AA:01').ok, true);
  assert.equal(e.status(now).rooms.K.occupied, 1);
});
test('Betreuerkarte: Menü per Ring und Taste, keine Buchung', async () => {
  const e = await createEngine();
  let now = 1000;
  const cmd = c => e.command(c, now),
    tap = uid => {
      const r = cmd({ type: 'scan', uid });
      cmd({ type: 'remove' });
      now += 1000;
      return r;
    },
    texts = () =>
      e
        .call({ op: 'dial', now })
        .filter(i => i[0] === 't')
        .map(i => i[5]);
  cmd({ type: 'staffLearn' });
  assert.equal(tap('BE:TR:01').ok, true);
  assert.equal(e.status(now).staffCount, 1);
  assert.equal(tap('sim:K01').ok, false);
  cmd({ type: 'staffLearn' });
  assert.equal(tap('sim:K01').ok, false);
  tap('BE:TR:01');
  assert.equal(e.status(now).menuOpen, true);
  assert.ok(texts().includes('BETREUUNG'));
  assert.ok(texts().includes('Bestand ok'));
  assert.equal(cmd({ type: 'relief' }).ok, true, 'Touch-Feld wirkt im Menü wie die Taste');
  assert.equal(e.status(now).ready, true);
  assert.equal(e.status(now).menuOpen, false);
  tap('BE:TR:01');
  assert.ok(texts().includes('Pause'));
  cmd({ type: 'dialPress' });
  assert.equal(e.status(now).paused, true);
  tap('BE:TR:01');
  cmd({ type: 'dialTurn', steps: 1 });
  assert.ok(texts().includes('Mensa freigeben'));
  cmd({ type: 'dialPress' });
  assert.ok(e.status(now).mensaEdit >= 0);
  cmd({ type: 'dialTurn', steps: 12 });
  now += 600;
  cmd({ type: 'dialPress' });
  assert.equal(e.status(now).rooms.M.limit, 12);
  tap('BE:TR:01');
  now += 21000;
  assert.equal(e.status(now).menuOpen, false);
  tap('BE:TR:01');
  tap('BE:TR:01');
  assert.equal(e.status(now).menuOpen, false);
  assert.equal(e.status(now).rooms.K.occupied, 0);
  const snap = e.snapshot();
  assert.deepEqual(snap.staff, ['BE:TR:01']);
  const f = await createEngine();
  assert.equal(f.restore(snap).ok, true);
  assert.equal(f.status(0).staffCount, 1);
  cmd({ type: 'staffClear' });
  assert.equal(e.status(now).staffCount, 0);
});
test('Neue Dial-Bildschirme passen in die runde Anzeige', async () => {
  const e = await createEngine();
  let now = 1000;
  const cmd = c => e.command(c, now);
  const check = () => {
    for (const i of e.call({ op: 'dial', now }).filter(i => i[0] === 't'))
      assert.ok(fits(i[2], i[3], i[5]), `${i[5]} (Größe ${i[3]})`);
  };
  e.call({ op: 'hardware' });
  cmd({ type: 'seriesStart', room: 'M' });
  check();
  cmd({ type: 'dialHold' });
  cmd({ type: 'staffLearn' });
  cmd({ type: 'scan', uid: 'X1' });
  cmd({ type: 'remove' });
  cmd({ type: 'scan', uid: 'X1' });
  cmd({ type: 'remove' });
  check();
  for (let i = 0; i < 4; i++) {
    cmd({ type: 'dialTurn', steps: 1 });
    check();
  }
});
test('Gerätetest (PC-Simulation): Scans buchen nicht, Anzeige zeigt Karte und Eingaben', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mensa-test-'));
  try {
    const app = await createApp({ dataDir: dir });
    const t = c => app.transact(c);
    t({ type: 'confirm' });
    t({ type: 'deviceTest', on: true });
    t({ type: 'tap', uid: 'sim:K01' });
    t({ type: 'tap', uid: 'sim:K01' });
    t({ type: 'dialTurn', steps: 3 });
    t({ type: 'dialPress' });
    const s = app.state();
    assert.equal(s.testMode, true);
    assert.equal(s.rooms.K.occupied, 0);
    const lines = s.dial.filter(i => i[0] === 't').map(i => i[5]);
    assert.ok(lines.includes('GERÄTETEST'));
    assert.ok(lines.includes('Karte: sim:K01'));
    assert.ok(lines.some(l => l.startsWith('Lesungen: 2')));
    assert.ok(lines.includes('Ring: 3  Taste: kurz'));
    t({ type: 'deviceTest', on: false });
    t({ type: 'tap', uid: 'sim:K01' });
    assert.equal(app.state().rooms.K.occupied, 1);
    app.stop();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('PC-Dienst: Ampel getrennt und wieder verbunden wird gemeldet', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mensa-ampel-'));
  const app = await createApp({ dataDir: dir });
  const realNow = Date.now;
  try {
    app.transact({ type: 'confirm' });
    await new Promise(done => app.server.listen(0, '127.0.0.1', done));
    const signal = () => fetch(`http://127.0.0.1:${app.server.address().port}/api/signal`).then(r => r.json());
    await signal();
    const start = realNow();
    Date.now = () => realNow() + 11000;
    await new Promise(done => setTimeout(done, 700));
    assert.equal(app.state().feedback.text, 'Ampel draußen getrennt!');
    await signal();
    await new Promise(done => setTimeout(done, 700));
    assert.equal(app.state().feedback.text, 'Ampel wieder verbunden.');
    assert.ok(!shown(app.state().dial).includes('Ampel draußen'));
    assert.ok(realNow() - start < 5000);
  } finally {
    Date.now = realNow;
    app.server.closeAllConnections();
    app.server.close();
    app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('Betreuerkarte: Lautstärke, Neuer Essenstag mit Rückfrage, WLAN-Daten', async () => {
  const e = await createEngine();
  let now = 1000;
  const cmd = c => e.command(c, now);
  const tap = uid => {
    const r = cmd({ type: 'scan', uid });
    cmd({ type: 'remove' });
    now += 1000;
    return r;
  };
  e.call({ op: 'hardware' });
  cmd({ type: 'confirm' });
  cmd({ type: 'staffLearn' });
  tap('BE:TR:01');
  const open = () => {
    tap('BE:TR:01');
    if (!e.status(now).menuOpen) tap('BE:TR:01');
  };
  const choose = label => {
    const items = ['Pause', 'Mensa freigeben', 'Lautstärke', 'Neuer Essenstag', 'WLAN-Daten', 'Abbrechen'];
    cmd({ type: 'dialTurn', steps: items.indexOf(label) });
    return cmd({ type: 'dialPress' });
  };
  open();
  choose('Lautstärke');
  assert.ok(shown(e.call({ op: 'dial', now })).includes('LAUTSTÄRKE'));
  const fit = l => l.filter(i => i[0] === 't').every(i => supported(i[5], i[3]) && fits(i[2], i[3], i[5]));
  assert.ok(fit(e.call({ op: 'dial', now })), 'Lautstärke passt');
  assert.equal(cmd({ type: 'dialTurn', steps: -3 }).previewVolume, 4);
  assert.match(cmd({ type: 'dialPress' }).message, /Lautstärke 4 gespeichert/);
  assert.equal(e.snapshot().volume, 4);
  open();
  assert.equal(choose('WLAN-Daten').action, 'wifi');
  // New day: question first, turning cancels, pressing confirms.
  tap('sim:K01');
  open();
  choose('Neuer Essenstag');
  assert.ok(shown(e.call({ op: 'dial', now })).includes('NEUER TAG?'));
  assert.ok(fit(e.call({ op: 'dial', now })), 'Rückfrage passt');
  cmd({ type: 'dialTurn', steps: 1 });
  assert.equal(e.status(now).day, 1, 'Drehen bricht ab');
  open();
  choose('Neuer Essenstag');
  assert.match(cmd({ type: 'dialPress' }).message, /Neuer Essenstag/);
  assert.equal(e.status(now).day, 2);
  assert.equal(e.status(now).rooms.K.occupied, 0);
});
test('Testdaten löschen: einzeln wählbar, Karten und Einstellungen bleiben', async () => {
  const x = await setup();
  x.cmd({ type: 'settings', cooldown: 4, volume: 3 });
  x.group();
  x.cmd({ type: 'newDay', confirmed: true });
  const before = x.e.snapshot();
  assert.ok(before.flow.history.length > 0 && before.events.length > 0);
  assert.equal(x.cmd({ type: 'clearData', confirmed: true }).ok, false, 'nichts ausgewählt');
  assert.equal(x.cmd({ type: 'clearData', history: true }).ok, false, 'ohne Bestätigung');
  assert.equal(x.cmd({ type: 'clearData', confirmed: true, history: true }).ok, true);
  let s = x.e.snapshot();
  assert.equal(s.flow.history.length, 0);
  assert.equal(s.day, 1);
  assert.ok(s.events.length > 0, 'Vorgänge bleiben');
  assert.equal(x.cmd({ type: 'clearData', confirmed: true, events: true, measurements: true, learned: true }).ok, true);
  s = x.e.snapshot();
  assert.equal(s.events.length, 1, 'nur die Löschmeldung');
  assert.equal(s.flow.samples.length, 0);
  assert.deepEqual(s.cards, before.cards);
  assert.equal(s.cooldown, 4);
  assert.equal(s.volume, 3);
  const sig = x.e.status(x.now).signal;
  assert.ok('groupLeft' in sig && 'mensaOpen' in sig && 'kitchenFree' in sig);
});
