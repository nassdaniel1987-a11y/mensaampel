import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { healAction } from '../src/self-heal.mjs';

test('Ampel heilt sich selbst: erst nach 30 s ohne Antwort, höchstens alle 5 Minuten', () => {
  const t = { now: 100000, lastSeen: 99000, lastLoop: 99500, lastHeal: null };
  assert.equal(healAction(t), 'none');
  assert.equal(healAction({ ...t, lastSeen: 70000 }), 'none', 'genau 30 s: noch warten');
  assert.equal(healAction({ ...t, lastSeen: 69000 }), 'probe');
  assert.equal(healAction({ ...t, lastSeen: 0, lastHeal: 100000 - 60000 }), 'none', 'eben erst neu geladen');
  assert.equal(healAction({ ...t, lastSeen: 0, lastHeal: 100000 - 301000 }), 'probe');
  assert.equal(healAction({ ...t, lastLoop: 80000 }), 'restart', 'Abfrage-Schleife steht: neu starten');
});

test('Ampel heilt sich nur, wenn das Dial erreichbar ist (sonst bliebe die Fehlerseite des Browsers)', () => {
  const hook = readFileSync('src/useMensa.ts', 'utf8');
  const probe = hook.slice(hook.indexOf("action === 'probe'"));
  assert.match(probe, /fetch\('\/api\/signal'/);
  assert.ok(probe.indexOf('r.ok') < probe.indexOf('location.reload'), 'neu laden erst nach erfolgreicher Prüfung');
});
