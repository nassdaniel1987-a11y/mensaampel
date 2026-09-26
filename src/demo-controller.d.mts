import type { State, Command } from './types';
export function createDemoController(
  engine: unknown,
  clock?: () => number,
): {
  state: () => State;
  send: (c: Command) => { ok: boolean; message: string; state: State };
  tick: () => boolean;
  online: () => boolean;
};
