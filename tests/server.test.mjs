import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/main.mjs';
const dir = () => mkdtempSync(join(tmpdir(), 'mensa-test-'));
test('Kurzer Scan bleibt eine Transaktion und zeigt die Buchungsantwort', async () => {
  const a = await createApp({ dataDir: dir() });
  a.transact({ type: 'confirm' });
  const first = a.transact({ type: 'tap', uid: 'sim:K01' });
  assert.equal(first.ok, true);
  assert.equal(first.state.held, '');
  assert.equal(first.state.rooms.K.free, 47);
  assert.equal(a.transact({ type: 'tap', uid: 'sim:K01' }).ok, false);
  assert.equal(a.state().held, '');
  a.transact({ type: 'advance', seconds: 10 });
  assert.equal(a.transact({ type: 'tap', uid: 'sim:K01' }).state.rooms.K.free, 48);
});
test('Dauerhafte Speicherung und Neustart', async () => {
  const dataDir = dir();
  const a = await createApp({ dataDir });
  a.transact({ type: 'confirm' });
  a.transact({ type: 'scan', uid: 'sim:K01' });
  const b = await createApp({ dataDir });
  assert.equal(b.state().rooms.K.occupied, 1);
  assert.equal(b.state().ready, false);
  assert.equal(b.state().held, '');
});
test('Speicherfehler rollt Buchung und Undo zurück', async () => {
  const a = await createApp({ dataDir: dir() });
  a.transact({ type: 'confirm' });
  a.transact({ type: 'scan', uid: 'sim:K01' });
  a.transact({ type: 'remove' });
  const prev = a.engine.snapshot();
  a.transact({ type: 'storageFailure', enabled: true });
  assert.equal(a.transact({ type: 'scan', uid: 'sim:K02' }).ok, false);
  assert.deepEqual(a.engine.snapshot(), prev);
  assert.ok(a.state().storageError);
  a.transact({ type: 'storageFailure', enabled: false });
  assert.equal(a.transact({ type: 'scan', uid: 'sim:K02' }).ok, true);
  assert.equal(a.state().storageError, '');
});
test('Beschädigter Bestand wird nicht still überschrieben', async () => {
  const dataDir = dir(),
    p = join(dataDir, 'bestand.json');
  writeFileSync(p, 'kaputt');
  const a = await createApp({ dataDir });
  assert.equal(a.state().recoveryRequired, true);
  assert.equal(a.transact({ type: 'confirm' }).ok, false);
  assert.equal(readFileSync(p, 'utf8'), 'kaputt');
  assert.equal(a.transact({ type: 'recover', confirmed: true }).ok, true);
  assert.equal(a.state().ready, false);
});
test('HTTP: zentrale Ansichten, Token, Fremdursprung und Unterbrechung', async () => {
  const a = await createApp({ dataDir: dir() });
  await new Promise(r => a.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${a.server.address().port}`;
  try {
    const one = await (await fetch(base + '/api/state')).json();
    const headers = { 'Content-Type': 'application/json', 'X-Mensa-Token': one.token };
    assert.equal((await fetch(base + '/api/command', { method: 'POST', body: '{}' })).status, 403);
    assert.equal((await fetch(base + '/%ZZ')).status, 400);
    assert.equal((await fetch(base + '/api/state', { headers: { Origin: 'https://example.com' } })).status, 403);
    const cmd = async body =>
      (await fetch(base + '/api/command', { method: 'POST', headers, body: JSON.stringify(body) })).json();
    await cmd({ type: 'confirm' });
    await cmd({ type: 'scan', uid: 'sim:K01' });
    const two = await (await fetch(base + '/api/state')).json();
    assert.equal(two.rooms.K.free, 47);
    await cmd({ type: 'disconnect' });
    assert.equal((await fetch(base + '/api/state')).status, 503);
  } finally {
    await new Promise(r => a.server.close(r));
  }
});
test('HTTP: wiederholter Befehl mit derselben Kennung läuft nur einmal', async () => {
  const a = await createApp({ dataDir: dir() });
  await new Promise(r => a.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${a.server.address().port}`;
  try {
    const one = await (await fetch(base + '/api/state')).json();
    const headers = { 'Content-Type': 'application/json', 'X-Mensa-Token': one.token };
    const cmd = async body =>
      (await fetch(base + '/api/command', { method: 'POST', headers, body: JSON.stringify(body) })).json();
    await cmd({ type: 'confirm' });
    const first = await cmd({ type: 'newDay', confirmed: true, rid: 'abc' });
    const again = await cmd({ type: 'newDay', confirmed: true, rid: 'abc' });
    assert.equal(first.ok, true);
    assert.equal(again.message, first.message);
    assert.equal(a.state().day, 2, 'nur ein neuer Tag');
  } finally {
    await new Promise(r => a.server.close(r));
  }
});
