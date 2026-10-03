// Self-healing of the Ampel page (0.20): the tablet at the door is never touched. If the page has had no answer for
// 30 s although the Dial is reachable again (checked with a separate request), it reloads itself – at most once every
// 5 minutes (time kept in sessionStorage across the reload). If the Dial is off or out of reach, nothing is reloaded:
// a reload without the Dial would leave only the browser's error page, and the red "no connection" display stays.
// A polling loop that stopped (no round for 10 s) is restarted without a reload.
export const healAfterMs = 30000;
export const healPauseMs = 300000;
export const loopStuckMs = 10000;
/**
 * @param {{ now: number, lastSeen: number, lastLoop: number, lastHeal: number | null }} t
 * @returns {'none' | 'restart' | 'probe'}
 */
export function healAction({ now, lastSeen, lastLoop, lastHeal }) {
  if (now - lastLoop > loopStuckMs) return 'restart';
  if (now - lastSeen > healAfterMs && (lastHeal === null || now - lastHeal > healPauseMs)) return 'probe';
  return 'none';
}
