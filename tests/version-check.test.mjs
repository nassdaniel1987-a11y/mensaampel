import test from 'node:test';
import assert from 'node:assert/strict';
import { needsReload } from '../src/version-check.mjs';

test('Tablet lädt nach einem Dial-Update einmal neu', () => {
  assert.equal(needsReload('0.17.7', '0.17.7', null), false, 'gleiche Version');
  assert.equal(needsReload(undefined, '0.17.7', null), false, 'Dial ohne Versionsangabe');
  assert.equal(needsReload('', '0.17.7', null), false);
  assert.equal(needsReload('0.17.8', '0.17.7', null), true, 'neue Version auf dem Dial');
  assert.equal(needsReload('0.17.8', '0.17.7', '0.17.8'), false, 'für diese Version schon neu geladen');
  assert.equal(needsReload('0.17.9', '0.17.7', '0.17.8'), true, 'noch eine neuere Version');
});
