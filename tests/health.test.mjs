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
