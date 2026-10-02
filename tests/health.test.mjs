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
