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
