export function mergeCards<S extends { cards?: unknown; cardsRev?: number }>(
  cache: { cards: unknown; rev: number } | null,
  s: S,
): { state: S; cache: { cards: any; rev: number } | null };
export function mergePeaks<S extends { peaks?: string; peaksRev?: number }>(
  cache: { peaks: string; rev: number } | null,
  s: S,
): { state: S; cache: { peaks: string; rev: number } | null };
