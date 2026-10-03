// Firmware upload in pieces (0.19.1): /api/update/begin, then /api/update/chunk?offset=N piece by piece, then
// /api/update/finish. A piece that fails (tablet briefly out of the WLAN, Dial busy) is sent again; the Dial answers
// with how much it has written, so the upload continues there instead of starting over. Before 0.19.1 one long
// upload broke off at the first WLAN drop.
/**
 * @param {Uint8Array} bytes
 * @param {(path: string, body: Uint8Array | string, type: string, offset?: number) => Promise<any>} post resolves with
 *   the JSON answer, rejects on a network error
 * @param {(percent: number) => void} progress
 * @param {{ wait?: (ms: number) => Promise<void>, now?: () => number, patienceMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, message: string, version?: string }>}
 */
export async function uploadInPieces(bytes, post, progress, options = {}) {
  const wait = options.wait ?? (ms => new Promise(r => setTimeout(r, ms))),
    now = options.now ?? (() => Date.now()),
    patience = options.patienceMs ?? 90000;
  // Every step is repeated on network errors until it has made no progress for `patience` ms.
  async function retry(step) {
    const until = now() + patience;
    let last;
    for (;;) {
      try {
        return await step();
      } catch (e) {
        last = e;
      }
      if (now() > until) throw last;
      await wait(2000);
    }
  }
  let begin;
  try {
    begin = await retry(() => post('/api/update/begin', JSON.stringify({ size: bytes.length }), 'application/json'));
  } catch {
    return { ok: false, message: 'Dial nicht erreichbar. Altes Programm bleibt.' };
  }
  if (!begin?.ok) return { ok: false, message: begin?.message || 'Update konnte nicht starten.' };
  const piece = Math.max(1024, Number(begin.chunk) || 15796);
  let offset = 0,
    stuckSince = now();
  progress(0);
  while (offset < bytes.length) {
    let answer;
    try {
      answer = await post(
        '/api/update/chunk',
        bytes.subarray(offset, Math.min(bytes.length, offset + piece)),
        'application/octet-stream',
        offset,
      );
    } catch {
      answer = null;
    }
    if (answer?.restart) return { ok: false, message: answer.message || 'Update abgebrochen. Altes Programm bleibt.' };
    if (answer && typeof answer.written === 'number' && answer.written > offset) {
      offset = Math.min(bytes.length, answer.written);
      stuckSince = now();
      progress(Math.floor((offset * 100) / bytes.length));
      continue;
    }
    if (answer && typeof answer.written === 'number') offset = answer.written;
    if (now() - stuckSince > patience)
      return { ok: false, message: 'Übertragung unterbrochen (WLAN). Altes Programm bleibt. Bitte nochmal.' };
    await wait(answer ? 300 : 2000);
  }
  let done;
  try {
    done = await retry(() => post('/api/update/finish', '', 'text/plain'));
  } catch {
    return { ok: false, message: 'Dial antwortet nicht. Altes Programm bleibt.' };
  }
  if (!done?.ok) return { ok: false, message: done?.message || 'Update abgebrochen. Altes Programm bleibt.' };
  progress(100);
  return { ok: true, message: done.message || '', version: done.version };
}
