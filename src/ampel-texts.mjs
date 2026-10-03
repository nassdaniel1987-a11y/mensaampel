// Short multilingual lines on the Ampel page (one sentence per state). Kept simple on purpose; please have native
// speakers confirm them before use (JA: simple polite form; ZH: Simplified Chinese). A correction is one line here. dir: text direction (Arabic: right to left).
export const ampelLanguages = [
  { code: 'EN', name: 'English', dir: 'ltr' },
  { code: 'TR', name: 'Türkçe', dir: 'ltr' },
  { code: 'AR', name: 'العربية', dir: 'rtl' },
  { code: 'UK', name: 'Українська', dir: 'ltr' },
  { code: 'JA', name: '日本語', dir: 'ltr' },
  { code: 'ZH', name: '中文', dir: 'ltr', lang: 'zh-Hans' },
];
export const ampelTexts = {
  // Green or amber: children may come in.
  open: {
    DE: 'Komm herein',
    EN: 'Come in',
    TR: 'İçeri gelebilirsin',
    AR: 'يمكنك الدخول الآن',
    UK: 'Можна заходити',
    JA: 'どうぞ、入ってください',
    ZH: '请进',
  },
  // Red: full, pause, waiting for the next group.
  wait: {
    DE: 'Bitte warten',
    EN: 'Please wait',
    TR: 'Lütfen bekle',
    AR: 'من فضلك انتظر',
    UK: 'Будь ласка, зачекай',
    JA: '少し待ってください',
    ZH: '请稍等',
  },
  // Red, alternating with "wait": a friendly line for the waiting children.
  thanks: {
    DE: 'Danke fürs Warten!',
    EN: 'Thanks for waiting!',
    TR: 'Beklediğin için teşekkürler!',
    AR: 'شكرًا على انتظارك!',
    UK: 'Дякуємо, що чекаєш!',
    JA: '待ってくれてありがとう！',
    ZH: '谢谢你的耐心等待！',
  },
  // Green or amber while the Mensa is almost full (alternates with "open").
  quiet: {
    DE: 'Die Mensa ist fast voll – bitte leise reingehen',
    EN: 'The canteen is almost full – please come in quietly',
    TR: 'Yemekhane neredeyse dolu – lütfen sessizce gir',
    AR: 'المطعم ممتلئ تقريبًا – من فضلك ادخل بهدوء',
    UK: 'Їдальня майже повна – заходь, будь ласка, тихо',
    JA: '食堂はほぼ満席です。静かに入ってください',
    ZH: '食堂快满了，请安静地进去',
  },
  // Not ready, no connection, fault.
  closed: {
    DE: 'Noch geschlossen',
    EN: 'Not open yet',
    TR: 'Henüz açık değil',
    AR: 'مغلق حاليًا',
    UK: 'Ще зачинено',
    JA: 'まだ開いていません',
    ZH: '还没有开放',
  },
};
// German lines for the waiting children, changing every few seconds (full-screen Ampel, red).
export const friendlyLines = [
  'Danke fürs Warten!',
  'Gleich bist du dran!',
  'Schön, dass du da bist!',
  'Guten Appetit gleich!',
];
/** Waiting hint from the learned stay: seconds until the next seat is probably free (-1: unknown). */
export function nextSeatText(seconds) {
  if (!(seconds >= 0)) return '';
  if (seconds < 60) return 'Gleich wird ein Platz frei';
  return `Nächster Platz frei in ca. ${Math.ceil(seconds / 60)} Min.`;
}
// The Mensa counts as almost full from this share of the released seats in use (signal.busy, percent).
export const quietFrom = 85;
/** Ask for quiet: children may come in and the released seats are almost all in use. */
export function wantsQuiet(admitting, busy) {
  return Boolean(admitting) && typeof busy === 'number' && busy >= quietFrom;
}
