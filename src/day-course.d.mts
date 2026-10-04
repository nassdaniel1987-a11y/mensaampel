import type { State } from './types';
export const curveFrom: number;
export const curveStep: number;
export const peakStep: number;
export const eventKinds: Record<
  'open' | 'full' | 'auto' | 'early' | 'hand' | 'reliefStart' | 'reliefEnd' | 'pause' | 'outlier',
  number
>;
export function clock(m: number): string;
export function parseCurve(text: string | undefined): number[];
export function parseDayEvents(text: string | undefined): { minute: number; kind: number; a: number; b: number }[];
export function parsePeaks(text: string | undefined): { day: number; values: number[] }[];
export type Block = {
  label: string;
  state: 'done' | 'now' | 'plan';
  start: number;
  end: number;
  size: number;
  sub: string;
};
export type Fact = { title: string; sub: string };
export function groups(flow: State['flow'], nowMinute: number): (Block & { isStart: boolean; children: number })[];
export function timeline(state: State): null | {
  from: number;
  to: number;
  now: number;
  ticks: number[];
  blocks: Block[];
  next: Fact | null;
  compare: (Fact & { faster: boolean }) | null;
  finish: Fact | null;
};
export function dayCurves(state: State): {
  days: number;
  forecast: { minute: number; mean: number; low: number; high: number }[];
  actual: { minute: number; value: number }[];
  note: { tone: 'ok' | 'warn'; text: string } | null;
  from: number;
  to: number;
  max: number;
};
export type Decision = {
  minute: number;
  time: string;
  kind: 'auto' | 'hand' | 'learn' | 'relief' | 'plan';
  title: string;
  why: string;
};
export function decisions(state: State): Decision[];
export const heatRanges: { days: number; label: string }[];
export type HeatSpot = { weekday: string; from: string; to: string; value: number };
export function heatmap(
  state: State,
  lastDays?: number,
): {
  days: number;
  slots: string[];
  rows: {
    weekday: number;
    label: string;
    cells: { value: number | null; level: number; days: number; title: string }[];
  }[];
  busiest: HeatSpot | null;
  calmest: HeatSpot | null;
};
