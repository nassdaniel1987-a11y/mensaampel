import type { Device } from './types';
export type HealthRow = { name: string; level: 0 | 1 | 2; value: string; todo: string };
export function healthRows(device: Partial<Device> | undefined, diag: { failures: number } | undefined): HealthRow[];
export function healthLevel(rows: HealthRow[]): 0 | 1 | 2;
