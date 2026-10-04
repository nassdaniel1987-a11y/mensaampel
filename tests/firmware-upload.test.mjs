import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, uploadInPieces } from '../src/firmware-upload.mjs';
import { readFileSync } from 'node:fs';

// A Dial that writes pieces in order (like firmware/src/ota.hpp chunk()); `drop` decides which calls fail.
function fakeDial(size, drop = () => false) {
  const dial = { written: 0, data: new Uint8Array(size), calls: 0, finished: false };
  dial.post = async (path, body, type, header) => {
    dial.calls++;
    if (drop(dial.calls, path)) throw new Error('WLAN weg');
    if (path === '/api/update/begin') {
      // Like the Dial from 0.24.1: the same file (size and CRC) continues, anything else starts over.
      const { size: s, crc } = JSON.parse(body);
      if (dial.crc && crc === dial.crc && s === size)
        return { ok: true, chunk: 1000, written: dial.written, resumed: true };
      dial.crc = crc;
      dial.written = 0;
      return { ok: true, chunk: 1000, written: 0 };
    }
    if (path.startsWith('/api/update/chunk')) {
      assert.equal(path, '/api/update/chunk', 'Stelle steht im Kopf, nicht in der Adresse');
      const offset = header;
      if (offset === dial.written) {
        dial.data.set(body, offset);
        dial.written += body.length;
      } else if (offset + body.length > dial.written) return { ok: false, written: dial.written };
      return { ok: true, written: dial.written };
    }
    dial.finished = dial.written === size;
    return dial.finished ? { ok: true, version: '9.9.9' } : { ok: false, message: 'Update unvollständig.' };
  };
  return dial;
}
const bytes = n => Uint8Array.from({ length: n }, (_, i) => i % 251);
const fast = () => {
  let t = 0;
  return { wait: async ms => void (t += ms), now: () => t };
};

test('Update in Stücken: alles kommt in der richtigen Reihenfolge an', async () => {
  const file = bytes(4500),
    dial = fakeDial(file.length),
    seen = [];
  const r = await uploadInPieces(file, dial.post, p => seen.push(p), fast());
  assert.equal(r.ok, true);
  assert.equal(r.version, '9.9.9');
  assert.deepEqual(dial.data, file);
  assert.equal(seen.at(-1), 100);
});

test('Update in Stücken: kurze WLAN-Abbrüche werden überbrückt, nichts doppelt geschrieben', async () => {
  const file = bytes(10000),
    // every third call fails, also the first begin and the finish once
    dial = fakeDial(file.length, n => n % 3 === 1);
  const r = await uploadInPieces(file, dial.post, () => {}, fast());
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(dial.data, file);
});

test('Update in Stücken: Dial lange weg → Abbruch mit Meldung, altes Programm bleibt', async () => {
  const file = bytes(5000),
    dial = fakeDial(file.length, (n, path) => path.startsWith('/api/update/chunk') && n > 3);
  const r = await uploadInPieces(file, dial.post, () => {}, fast());
  assert.equal(r.ok, false);
  assert.match(r.message, /Altes Programm bleibt/);
  assert.equal(dial.finished, false);
});

test('Update in Stücken: Ablehnung beim Start wird gemeldet', async () => {
  const r = await uploadInPieces(
    bytes(2000),
    async () => ({ ok: false, message: 'Bitte anmelden.' }),
    () => {},
    fast(),
  );
  assert.deepEqual(r, { ok: false, message: 'Bitte anmelden.' });
});

test('Update in Stücken: Dial liest die Stelle aus dem Kopf X-Update-Offset', () => {
  const main = readFileSync('firmware/src/main.cpp', 'utf8'),
    hook = readFileSync('src/useMensa.ts', 'utf8');
  assert.match(main, /web\.header\("X-Update-Offset"\)/);
  assert.match(main, /"X-Update-Offset"\}/, 'Kopf wird gesammelt');
  assert.match(hook, /'X-Update-Offset'/);
});

test('Update: zweiter Versuch mit derselben Datei macht dort weiter, wo der erste aufgehört hat', async () => {
  const file = bytes(9000);
  let failing = true;
  const dial = fakeDial(file.length, (n, path) => failing && path.startsWith('/api/update/chunk') && n > 4);
  const first = await uploadInPieces(file, dial.post, () => {}, fast());
  assert.equal(first.ok, false);
  assert.match(first.message, /dort weiter/);
  const kept = dial.written;
  assert.ok(kept > 0 && kept < file.length);
  failing = false;
  const seen = [];
  const second = await uploadInPieces(file, dial.post, p => seen.push(p), fast());
  assert.equal(second.ok, true, second.message);
  assert.deepEqual(dial.data, file);
  assert.equal(seen[0], Math.floor((kept * 100) / file.length), 'beginnt beim alten Stand');
});

test('CRC-32 wie im Dial (Prüfwert 123456789)', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});
