import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { checkFirmware } from '../src/firmware-file.mjs';

const image = (version = '9.9.9', at = 5000) => {
  const b = new Uint8Array(20000);
  b[0] = 0xe9;
  b.set(new TextEncoder().encode('MENSAAMPEL-FIRMWARE-1:' + version + '\0'), at);
  return b;
};
test('Firmware-Datei: nur Mensaampel-Firmware wird angenommen', () => {
  assert.deepEqual(checkFirmware(image()), { ok: true, message: 'Mensaampel-Firmware 9.9.9', version: '9.9.9' });
  const photo = image();
  photo[0] = 0xff;
  assert.equal(checkFirmware(photo).ok, false, 'falscher Dateianfang');
  const other = new Uint8Array(20000);
  other[0] = 0xe9;
  assert.equal(checkFirmware(other).ok, false, 'ESP-Programm ohne Kennmarke');
  const decoy = image('', 100);
  decoy.set(new TextEncoder().encode('MENSAAMPEL-FIRMWARE-1#'), 3000);
  assert.equal(checkFirmware(decoy).ok, false, 'Marke ohne Version und Suchmuster zählen nicht');
  assert.equal(checkFirmware(new Uint8Array(0x300001).fill(0xe9)).ok, false, 'zu groß');
  assert.equal(checkFirmware(new Uint8Array(10)).ok, false, 'zu klein');
});
test(
  'Firmware-Datei: gebaute Firmware trägt ihre Version',
  { skip: !existsSync('firmware/.pio/build/mensa-dial/firmware.bin') },
  async () => {
    const { VERSION } = await import('../src/version.mjs');
    const r = checkFirmware(new Uint8Array(readFileSync('firmware/.pio/build/mensa-dial/firmware.bin')));
    assert.equal(r.ok, true, r.message);
    assert.equal(r.version, VERSION);
  },
);
