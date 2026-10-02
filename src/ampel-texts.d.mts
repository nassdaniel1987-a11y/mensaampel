export const ampelLanguages: { code: string; name: string; dir: 'ltr' | 'rtl'; lang?: string }[];
export const ampelTexts: Record<'open' | 'wait' | 'thanks' | 'closed', Record<string, string>>;
export const friendlyLines: string[];
export function nextSeatText(seconds: number | undefined): string;
