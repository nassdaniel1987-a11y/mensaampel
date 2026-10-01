import test from 'node:test';
import assert from 'node:assert/strict';
import { ampelLanguages, ampelTexts } from '../src/ampel-texts.mjs';

test('Ampel: jeder Zustand hat in jeder Sprache einen Text', () => {
  for (const [state, texts] of Object.entries(ampelTexts)) {
    assert.ok(texts.DE, `${state} DE`);
    for (const l of ampelLanguages) assert.ok(texts[l.code]?.trim(), `${state} ${l.code}`);
  }
  assert.equal(ampelLanguages.find(l => l.code === 'AR').dir, 'rtl');
});
