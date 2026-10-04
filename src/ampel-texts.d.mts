export const ampelLanguages: { code: string; name: string; dir: 'ltr' | 'rtl'; lang?: string }[];
export const ampelTexts: Record<'open' | 'wait' | 'thanks' | 'quiet' | 'closed', Record<string, string>>;
export const friendlyLines: string[];
export function nextSeatText(seconds: number | undefined): string;
export const quietFrom: number;
export function wantsQuiet(admitting: boolean, busy: number | undefined): boolean;
