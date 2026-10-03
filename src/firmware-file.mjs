// Check of a firmware file on the tablet before it is sent to the Dial (the Dial checks the same again):
// ESP image (first byte 0xE9), at most 3 MB, contains the Mensaampel mark "MENSAAMPEL-FIRMWARE-1:<version>".
const mark = new TextEncoder().encode('MENSAAMPEL-FIRMWARE-1:');
export const maxFirmwareSize = 0x300000;
/** @param {Uint8Array} bytes */
export function checkFirmware(bytes) {
  if (!bytes || bytes.length < 1024) return { ok: false, message: 'Datei ist zu klein für eine Firmware.' };
  if (bytes.length > maxFirmwareSize) return { ok: false, message: 'Datei ist zu groß (höchstens 3 MB).' };
  if (bytes[0] !== 0xe9)
    return { ok: false, message: 'Keine Dial-Firmware. Bitte „Mensaampel-Dial-Update.bin“ wählen.' };
  for (let i = 0; i + mark.length <= bytes.length; i++) {
    if (bytes[i] !== mark[0]) continue;
    let k = 1;
    while (k < mark.length && bytes[i + k] === mark[k]) k++;
    if (k < mark.length) continue;
    let end = i + k;
    while (end < bytes.length && end - i - k < 40 && bytes[end] !== 0) end++;
    const version = new TextDecoder().decode(bytes.subarray(i + k, end));
    if (version) return { ok: true, message: 'Mensaampel-Firmware ' + version, version };
  }
  return { ok: false, message: 'Keine Mensaampel-Firmware. Bitte „Mensaampel-Dial-Update.bin“ wählen.' };
}
