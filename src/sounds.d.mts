export const soundEvents: string[];
export const soundSets: { name: string; events: [number, number, number][][] }[];
export function playSoundSet(set: number, volume?: number): boolean;
