// The Dial sends its 112 cards only when they changed (cardsRev); the tablet keeps the last list and fills it in.
export function mergeCards(cache, s) {
  if (!s || typeof s !== 'object') return { state: s, cache };
  if (Array.isArray(s.cards)) return { state: s, cache: { cards: s.cards, rev: s.cardsRev ?? 0 } };
  if (cache && s.cardsRev !== undefined && cache.rev === s.cardsRev)
    return { state: { ...s, cards: cache.cards }, cache };
  // Cards left out but no matching copy: ask for the full list next time.
  return { state: cache ? { ...s, cards: cache.cards } : s, cache: cache ? { ...cache, rev: -1 } : null };
}
// Half-hour peaks of the last 60 days (0.23): the Dial sends them only when they changed (peaksRev, once a day).
export function mergePeaks(cache, s) {
  if (!s || typeof s !== 'object') return { state: s, cache };
  if (typeof s.peaks === 'string') return { state: s, cache: { peaks: s.peaks, rev: s.peaksRev ?? 0 } };
  if (cache && s.peaksRev !== undefined && cache.rev === s.peaksRev)
    return { state: { ...s, peaks: cache.peaks }, cache };
  return { state: { ...s, peaks: cache ? cache.peaks : '' }, cache: cache ? { ...cache, rev: -1 } : null };
}
