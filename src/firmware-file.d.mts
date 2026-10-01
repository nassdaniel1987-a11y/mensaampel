export const maxFirmwareSize: number;
export function checkFirmware(bytes: Uint8Array): { ok: boolean; message: string; version?: string };
