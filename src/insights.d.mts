import type { Command } from './types';
export const weekdays: string[];
export type Forecast = {
  days: number;
  weekday: number;
  meals: number;
  peak: number;
  mensaDays: number;
  mensaSeats: number;
  mensaNeeded: boolean;
  start: string;
  end: string;
  minutes: number;
};
export function forecast(history: number[][], weekday: number, mensaCapacity?: number): Forecast | null;
export type Tip = { id: string; title: string; reason: string; action?: Command };
export function coach(
  flow: { history: number[][]; batch: number; yellow: number; autoOn: boolean; autoStart: number },
  rooms: { M: { capacity: number; limit: number; open: boolean } },
): Tip[];
export type Simulation = {
  children: number;
  admitted: number;
  groups: number;
  doorAvg: number;
  doorMax: number;
  serveryAvg: number;
  serveryMax: number;
  queueMax: number;
  minutes: number;
  complete: boolean;
};
export function simulate(p: {
  children: number;
  minutes: number;
  perChild: number;
  stay: number;
  seats: number;
  batch: number;
}): Simulation;
export function waitText(seconds: number): string;
export const confidenceLevels: string[];
export type ConfidenceLevel = 0 | 1 | 2 | 3;
export function slotLevel(n: number): ConfidenceLevel;
export function stayLevel(n: number): ConfidenceLevel;
export function daysLevel(n: number): ConfidenceLevel;
export function groupLevel(n: number): ConfidenceLevel;
export type Confidence = {
  halfHours: number[];
  rows: {
    weekday: number;
    days: number;
    cells: { slot: number; n: number; level: ConfidenceLevel }[];
    level: ConfidenceLevel;
    text: string;
  }[];
  groups: { n: number; level: ConfidenceLevel };
  stay: { n: number; level: ConfidenceLevel };
};
export function confidence(flow: {
  autoSlots?: number[][];
  autoGlobalN?: number;
  stayN?: number;
  history: number[][];
}): Confidence;
export type DiaryLine = {
  day: number;
  weekday: number;
  kind: number;
  key: number;
  before: number;
  after: number;
  count: number;
};
export function parseDiary(text: string | undefined): DiaryLine[];
export function diaryLines(lines: DiaryLine[]): { day: number; title: string; lines: string[] }[];
