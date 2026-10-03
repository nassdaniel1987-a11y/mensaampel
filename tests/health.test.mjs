import test from 'node:test';
import assert from 'node:assert/strict';
import { healthRows, healthLevel } from '../src/health.mjs';

const good = {
  resetReason: 'Einschalten',
  webMaxMs: 300,
  health: { crash: false, readerFaults: 0, saveFailures: 0, ampelDrops: 0, minBlock: 60000 },
};
test('Gesundheit: ohne Werte nichts, gute Werte grün, Grenzen gelb und rot', () => {
  assert.deepEqual(healthRows({}, undefined), []);
  const ok = healthRows(good, { failures: 1 });
  assert.equal(ok.length, 7);
  assert.equal(healthLevel(ok), 0);
  const watch = healthRows({ ...good, health: { ...good.health, readerFaults: 1, minBlock: 40000 } }, { failures: 3 });
  assert.equal(healthLevel(watch), 1);
  assert.equal(watch.find(r => r.name === 'Arbeitsspeicher').level, 1);
  assert.equal(watch.find(r => r.name === 'Dieses Tablet').level, 1);
  const bad = healthRows(
    {
      ...good,
      resetReason: 'Stromeinbruch',
      health: { ...good.health, crash: true, saveFailures: 3, minBlock: 20000 },
    },
    undefined,
  );
  assert.equal(healthLevel(bad), 2);
  assert.match(bad[0].todo, /Netzteil/);
  for (const r of bad) assert.ok(r.todo.length > 5, `${r.name} hat einen Satz`);
});

test('Gesundheit: WLAN-Trennungen, abgebrochene Antworten, unklar gelesene Karten', () => {
  const h = { ...good.health, wlanDrops: 3, sendAborts: 0, sendMaxMs: 120, unclearReads: 2 };
  const rows = healthRows({ ...good, health: h }, undefined);
  assert.equal(rows.find(r => r.name === 'WLAN-Trennungen').level, 1);
  assert.match(rows.find(r => r.name === 'WLAN-Trennungen').todo, /Intelligentes WLAN/);
  assert.equal(rows.find(r => r.name === 'Antworten abgebrochen').level, 0);
  const reader = rows.find(r => r.name === 'Kartenleser');
  assert.equal(reader.level, 0, 'unklar gelesen ist keine Störung');
  assert.match(reader.value, /2× Karte unklar/);
  assert.equal(
    healthRows(good, undefined).find(r => r.name === 'WLAN-Trennungen'),
    undefined,
    'ältere Firmware',
  );
});

test('Gesundheit: Signalstärke der Tablets', () => {
  const rows = healthRows({ ...good, health: { ...good.health, rssiMin: -78, stations: [{ mac: 'AA', rssi: -60 }] } });
  const r = rows.find(x => x.name === 'Signalstärke');
  assert.equal(r.level, 1);
  assert.match(r.value, /-78 dBm.*-60/);
  assert.equal(
    healthRows(good).find(x => x.name === 'Signalstärke'),
    undefined,
  );
});

test('Gesundheit: Zeit zum Zeichnen eines Dial-Bildes', () => {
  const r = healthRows({ ...good, health: { ...good.health, drawMs: 20, drawMaxMs: 55 } }).find(
    x => x.name === 'Bild zeichnen',
  );
  assert.equal(r.level, 1);
  assert.match(r.value, /20 ms.*55 ms/);
});

test('Gesundheit im Router-Betrieb: Trennungen und Signal betreffen den Router', () => {
  const h = { ...good.health, router: true, wlanDrops: 2, rssiMin: -82, stations: [{ mac: 'Router', rssi: -75 }] };
  const rows = healthRows({ ...good, health: h }, undefined);
  const drops = rows.find(r => r.name === 'WLAN-Trennungen');
  assert.match(drops.value, /Router/);
  assert.match(drops.todo, /Router näher/);
  const signal = rows.find(r => r.name === 'Signalstärke');
  assert.equal(signal.level, 2);
  assert.match(signal.todo, /Router näher/);
});

test('Gesundheit: flüssige Animation aus der längsten Pause zwischen zwei Bildern', () => {
  const row = h => healthRows({ ...good, health: { ...good.health, ...h } }).find(r => r.name === 'Flüssige Animation');
  assert.equal(row({}), undefined, 'ältere Firmware ohne Wert');
  assert.equal(row({ frameGapMaxMs: 45, lockWaitMaxMs: 3 }).level, 0);
  const slow = row({ frameGapMaxMs: 210, lockWaitMaxMs: 160 });
  assert.equal(slow.level, 2);
  assert.match(slow.value, /gewartet 160 ms/);
  assert.match(slow.todo, /Tablet-Anfrage/);
});
