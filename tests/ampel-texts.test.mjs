import test from 'node:test';
import assert from 'node:assert/strict';
import { ampelLanguages, ampelTexts, friendlyLines, nextSeatText } from '../src/ampel-texts.mjs';

test('Ampel: jeder Zustand hat in jeder Sprache einen Text', () => {
  for (const [state, texts] of Object.entries(ampelTexts)) {
    assert.ok(texts.DE, `${state} DE`);
    for (const l of ampelLanguages) assert.ok(texts[l.code]?.trim(), `${state} ${l.code}`);
  }
  assert.equal(ampelLanguages.find(l => l.code === 'AR').dir, 'rtl');
});

test('Ampel: freundliches Warten und Hinweis auf den nächsten Platz', () => {
  assert.ok(friendlyLines.length >= 3);
  assert.equal(nextSeatText(-1), '');
  assert.equal(nextSeatText(undefined), '');
  assert.equal(nextSeatText(0), 'Gleich wird ein Platz frei');
  assert.equal(nextSeatText(61), 'Nächster Platz frei in ca. 2 Min.');
  assert.equal(nextSeatText(300), 'Nächster Platz frei in ca. 5 Min.');
});
