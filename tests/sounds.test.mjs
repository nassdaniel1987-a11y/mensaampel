import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../server/engine.mjs';
import { soundSets, soundEvents } from '../src/sounds.mjs';

test('Klangsets: Tablet und Dial spielen dieselben Töne, Auswahl wird gespeichert', async () => {
  const e = await createEngine();
  assert.deepEqual(e.call({ op: 'sounds' }), soundSets);
  for (const set of soundSets) {
    assert.equal(set.events.length, soundEvents.length);
    for (const notes of set.events) for (const [freq, ms] of notes) assert.ok(freq >= 300 && freq <= 5000 && ms > 0);
  }
  assert.equal(e.snapshot().sound, 1, 'Standard: Ping');
  assert.equal(e.command({ type: 'settings', cooldown: 3, sound: 2 }, 100).ok, true);
  assert.equal(e.snapshot().sound, 2);
  assert.equal(e.command({ type: 'settings', cooldown: 3, sound: 9 }, 100).ok, false);
  const old = e.snapshot();
  delete old.sound;
  e.call({ op: 'restore', state: old });
  assert.equal(e.snapshot().sound, 1, 'alte Stände bekommen Ping');
});
