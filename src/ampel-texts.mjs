// Short multilingual lines on the Ampel page (one sentence per state). Kept simple on purpose; please have native
// speakers confirm them before use. A correction is one line here. dir: text direction (Arabic: right to left).
export const ampelLanguages = [
  { code: 'EN', name: 'English', dir: 'ltr' },
  { code: 'TR', name: 'Türkçe', dir: 'ltr' },
  { code: 'AR', name: 'العربية', dir: 'rtl' },
  { code: 'UK', name: 'Українська', dir: 'ltr' },
];
export const ampelTexts = {
  // Green or amber: children may come in.
  open: { DE: 'Komm herein', EN: 'Come in', TR: 'İçeri gelebilirsin', AR: 'يمكنك الدخول الآن', UK: 'Можна заходити' },
  // Red: full, pause, waiting for the next group.
  wait: { DE: 'Bitte warten', EN: 'Please wait', TR: 'Lütfen bekle', AR: 'من فضلك انتظر', UK: 'Будь ласка, зачекай' },
  // Not ready, no connection, fault.
  closed: { DE: 'Noch geschlossen', EN: 'Not open yet', TR: 'Henüz açık değil', AR: 'مغلق حاليًا', UK: 'Ще зачинено' },
};
