export const healAfterMs: number;
export const healPauseMs: number;
export const loopStuckMs: number;
export function healAction(t: {
  now: number;
  lastSeen: number;
  lastLoop: number;
  lastHeal: number | null;
}): 'none' | 'restart' | 'probe';
