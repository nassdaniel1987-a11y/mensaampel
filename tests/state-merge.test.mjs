import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCards, mergePeaks } from '../src/state-merge.mjs';

test('Kartenliste: Dial lässt unveränderte Karten weg, Tablet setzt sie ein', () => {
  const cards = [{ label: 'K1' }];
  let m = mergeCards(null, { cardsRev: 4, cards });
  assert.deepEqual(m.cache, { cards, rev: 4 });
  m = mergeCards(m.cache, { cardsRev: 4, ready: 1 });
  assert.equal(m.state.cards, cards);
  assert.equal(m.cache.rev, 4);
  // Unbekannter Stand ohne Karten: alte Liste zeigen, beim nächsten Mal volle Liste anfordern.
  m = mergeCards(m.cache, { cardsRev: 5 });
  assert.equal(m.state.cards, cards);
  assert.equal(m.cache.rev, -1);
  assert.equal(mergeCards(null, { cardsRev: 5 }).cache, null);
  const fresh = [{ label: 'K2' }];
  assert.equal(mergeCards(m.cache, { cardsRev: 6, cards: fresh }).state.cards, fresh);
  assert.deepEqual(mergeCards(null, { cards: fresh }).cache, { cards: fresh, rev: 0 });
});

test('Spitzenwerte (0.23): nur bei Änderung gesendet, Tablet setzt sie ein', () => {
  let m = mergePeaks(null, { peaksRev: 9, peaks: '1,2' });
  assert.deepEqual(m.cache, { peaks: '1,2', rev: 9 });
  m = mergePeaks(m.cache, { peaksRev: 9 });
  assert.equal(m.state.peaks, '1,2');
  m = mergePeaks(m.cache, { peaksRev: 10 });
  assert.equal(m.state.peaks, '1,2');
  assert.equal(m.cache.rev, -1);
  assert.equal(mergePeaks(null, { peaksRev: 3 }).state.peaks, '');
});
