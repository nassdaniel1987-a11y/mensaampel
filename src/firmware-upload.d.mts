export function uploadInPieces(
  bytes: Uint8Array,
  post: (path: string, body: Uint8Array | string, type: string, offset?: number) => Promise<any>,
  progress: (percent: number) => void,
  options?: { wait?: (ms: number) => Promise<void>; now?: () => number; patienceMs?: number },
): Promise<{ ok: boolean; message: string; version?: string }>;
export function crc32(bytes: Uint8Array): number;
