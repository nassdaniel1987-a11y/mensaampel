import { useEffect, useRef, useState } from 'react';
import { Check, Hand, WifiOff, Maximize, Bell, BellOff, Volume1, Hourglass, Clock } from 'lucide-react';
import type { State } from './types';
import { ampelLanguages, ampelTexts, friendlyLines, nextSeatText, wantsQuiet } from './ampel-texts.mjs';
// Two-tone chime when the entrance opens again; browsers only allow it after one tap on "Ton an".
let chimeAudio: AudioContext | null = null;
function chime() {
  try {
    chimeAudio ??= new AudioContext();
    const t = chimeAudio.currentTime;
    [
      [660, 0],
      [880, 0.35],
    ].forEach(([f, d]) => {
      const o = chimeAudio!.createOscillator(),
        g = chimeAudio!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.9);
      o.connect(g).connect(chimeAudio!.destination);
      o.start(t + d);
      o.stop(t + d + 1);
    });
  } catch {
    /* no sound available */
  }
}
const readChime = () => {
  try {
    return localStorage.getItem('mensa-ampel-ton') === '1';
  } catch {
    return false;
  }
};
export function Signal({
  state,
  connected,
  full = false,
}: {
  state: State | null;
  connected: boolean;
  full?: boolean;
}) {
  const [sound, setSound] = useState(() => full && readChime()),
    // After a reload the browser keeps sound blocked until someone taps the page once.
    [locked, setLocked] = useState(() => full && readChime()),
    was = useRef<boolean | null>(null),
    // Longest wait seen in this countdown: the ring shows the share still to go.
    span = useRef(0),
    // Clock and the rotating language line (full-screen Ampel only).
    [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!full) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [full]);
  useEffect(() => {
    if (!locked) return;
    const unlock = () => {
      try {
        chimeAudio ??= new AudioContext();
        void chimeAudio.resume().then(() => setLocked(chimeAudio?.state !== 'running'));
      } catch {
        setLocked(false);
      }
    };
    document.addEventListener('pointerdown', unlock);
    return () => document.removeEventListener('pointerdown', unlock);
  }, [locked]);
  const reason = !connected ? 'offline' : state?.storageError ? 'storage' : state?.signal.reason;
  const green = reason === 'free',
    yellow = reason === 'low',
    admitting = green || yellow;
  const title = green
    ? 'Komm herein'
    : yellow
      ? 'Wenige Plätze'
      : reason === 'full'
        ? 'Einlass zu'
        : reason === 'paused' || reason === 'batch' || reason === 'relief'
          ? 'Einlass zu'
          : reason === 'confirm'
            ? 'Noch geschlossen'
            : 'Bitte zur Betreuung';
  const text = admitting
    ? 'Bitte einzeln bei der Kartenausgabe melden.'
    : reason === 'full' || reason === 'paused' || reason === 'batch' || reason === 'relief'
      ? 'Bitte später wiederkommen.'
      : reason === 'confirm'
        ? 'Wir bereiten alles vor.'
        : 'Die Anzeige hat gerade keine Verbindung oder ist nicht bereit.';
  const releaseIn = reason === 'batch' && connected ? (state?.signal.releaseIn ?? -1) : -1;
  if (releaseIn <= 0) span.current = 0;
  else if (releaseIn > span.current) span.current = releaseIn;
  const share = releaseIn > 0 && span.current > 0 ? releaseIn / span.current : 0;
  const time = releaseIn > 0 ? `${Math.floor(releaseIn / 60)}:${String(releaseIn % 60).padStart(2, '0')}` : '';
  const sig = connected ? state?.signal : undefined,
    groupLeft = admitting ? (sig?.groupLeft ?? -1) : -1,
    count = !admitting
      ? ''
      : groupLeft > 0
        ? `Noch ${groupLeft} ${groupLeft === 1 ? 'Kind' : 'Kinder'} in dieser Gruppe`
        : sig && sig.free > 0
          ? `${sig.free} ${sig.free === 1 ? 'Platz' : 'Plätze'} frei`
          : '';
  const mood = admitting
      ? 'open'
      : reason === 'offline' || reason === 'storage' || reason === 'confirm' || reason === 'device'
        ? 'closed'
        : 'wait',
    turn = Math.floor(now.getTime() / 4000),
    language = ampelLanguages[turn % ampelLanguages.length],
    quiet = wantsQuiet(admitting, sig?.busy),
    // While waiting, every second round says thank you; when the Mensa is almost full, every second round asks for
    // quiet.
    second = Math.floor(turn / ampelLanguages.length) % 2 === 1,
    languageKey = mood === 'wait' && second ? 'thanks' : quiet && second ? 'quiet' : mood,
    nextSeat = reason === 'full' && sig ? nextSeatText(sig.nextFreeIn ?? -1) : '',
    friendly = friendlyLines[Math.floor(now.getTime() / 6000) % friendlyLines.length];
  useEffect(() => {
    if (was.current === false && admitting && sound) chime();
    was.current = admitting;
  }, [admitting, sound]);
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    try {
      localStorage.setItem('mensa-ampel-ton', next ? '1' : '0');
    } catch {
      /* per-device convenience only */
    }
    if (next) chime();
  };
  if (full) {
    // Full-screen Ampel (design 0.22, Claude Design "Ampelseite für Kinder"): glowing orb with symbol, mini traffic
    // light, glass pills; state by colour, symbol and word.
    const tone = admitting ? (yellow ? 'yellow' : 'green') : mood === 'closed' ? 'grey' : 'red';
    const heading = time
      ? "Gleich geht's weiter"
      : green
        ? 'Komm herein!'
        : yellow
          ? 'Nur noch wenige Plätze'
          : mood === 'wait'
            ? 'Bitte warten'
            : reason === 'confirm'
              ? 'Noch geschlossen'
              : reason === 'offline'
                ? 'Keine Verbindung'
                : title;
    const pill = time ? 'Ihr seid die Nächsten!' : admitting ? count : mood === 'wait' ? nextSeat : '';
    const sentence = time
      ? 'Wenn der Ring leer ist, darf die nächste Gruppe rein.'
      : green
        ? quiet && count
          ? `${count} · bitte einzeln melden.`
          : text
        : yellow
          ? 'Du darfst noch rein. Bitte einzeln bei der Kartenausgabe melden.'
          : mood === 'wait'
            ? ''
            : reason === 'confirm'
              ? 'Wir bereiten alles vor. Gleich geht es los.'
              : text;
    const Icon = time ? Hourglass : green ? Check : mood === 'wait' ? Hand : reason === 'offline' ? WifiOff : Clock;
    const ring = 2 * Math.PI * 166;
    return (
      <section className={`ampel22 ${tone}`} aria-label="Ampelanzeige">
        <div className="ampel22-top">
          <span className="glass-pill ampel22-clock">
            <span className="mini-light" aria-hidden="true">
              <i className={tone === 'red' ? 'on' : ''} />
              <i className={tone === 'yellow' ? 'on' : ''} />
              <i className={tone === 'green' ? 'on' : ''} />
            </span>
            {now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {sig && (
            <span className="ampel22-chips">
              <span className="glass-pill">
                Küche{sig.kitchenFree !== undefined ? ` · ${sig.kitchenFree} frei` : ''}
              </span>
              <span className="glass-pill">
                {sig.mensaOpen ? `Mensa · ${sig.mensaFree ?? 0} frei` : 'Mensa geschlossen'}
              </span>
            </span>
          )}
        </div>
        <div className="ampel22-main">
          <div className={`ampel22-orb ${time ? 'counting' : ''}`} aria-hidden="true">
            {time && share > 0 && (
              <svg viewBox="0 0 360 360">
                <circle cx="180" cy="180" r="166" className="track" />
                <circle
                  cx="180"
                  cy="180"
                  r="166"
                  className="progress"
                  strokeDasharray={ring}
                  strokeDashoffset={ring * (1 - share)}
                />
              </svg>
            )}
            <div className="ampel22-core">
              {yellow ? (
                <svg viewBox="0 0 24 24" className="exclaim">
                  <path d="M12 5v9" />
                  <path d="M12 19h.01" />
                </svg>
              ) : (
                <Icon />
              )}
              {time && <strong>{time}</strong>}
            </div>
          </div>
          <div className="ampel22-text">
            <h1>{heading}</h1>
            {quiet ? (
              <p className="ampel22-quiet">
                <span>
                  <Volume1 aria-hidden="true" />
                </span>
                <span>
                  <strong>Bitte leise reingehen</strong>
                  <small>Die Mensa ist fast voll.</small>
                </span>
              </p>
            ) : (
              pill && <p className="ampel22-pill">{pill}</p>
            )}
            {mood === 'wait' && !time ? (
              <p className="ampel22-wait">
                <span className="dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {friendly}
              </p>
            ) : (
              sentence && <p className="ampel22-sentence">{sentence}</p>
            )}
          </div>
        </div>
        <div className="ampel22-bar">
          <p className="ampel22-language" dir={language.dir} lang={language.lang ?? language.code.toLowerCase()}>
            <span>{language.code}</span> {ampelTexts[languageKey][language.code]}
          </p>
          <p className="ampel22-note">
            {admitting ? 'Deinen Platz bekommst du mit einer Platzkarte.' : 'Bitte den Eingang freihalten.'}
          </p>
          <span className="ampel22-buttons">
            <button
              aria-label="Vollbild"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void document.documentElement.requestFullscreen?.().catch(() => {});
              }}
            >
              <Maximize size={18} />
            </button>
            <button onClick={toggleSound} aria-pressed={sound} aria-label={sound ? 'Ton aus' : 'Ton an'}>
              {sound ? <Bell size={18} /> : <BellOff size={18} />}
            </button>
          </span>
        </div>
        {sound && locked && (
          <p className="signal-tap">Ton ist an: einmal auf den Bildschirm tippen, damit er klingt.</p>
        )}
      </section>
    );
  }
  return (
    <section
      className={`signal ${full ? 'fullscreen-signal' : ''} ${yellow ? 'yellow' : green ? 'green' : 'red'} ${time ? 'counting' : ''}`}
      aria-label="Ampelanzeige"
    >
      <div className="signal-disc" aria-hidden="true">
        <div className="signal-circle">{admitting ? <Check /> : reason === 'offline' ? <WifiOff /> : <Hand />}</div>
        {full && share > 0 && (
          <svg className="signal-ring" viewBox="0 0 100 100">
            <circle className="track" cx="50" cy="50" r="46" />
            <circle
              className="progress"
              cx="50"
              cy="50"
              r="46"
              strokeDasharray={2 * Math.PI * 46}
              strokeDashoffset={2 * Math.PI * 46 * (1 - share)}
            />
          </svg>
        )}
      </div>
      {full && (
        <div className="signal-top">
          <span className="signal-clock">
            {now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {sig && (
            <span className="signal-chips">
              <span className="chip">Küche {sig.kitchenFree !== undefined ? `· ${sig.kitchenFree} frei` : ''}</span>
              <span className={`chip ${sig.mensaOpen ? '' : 'off'}`}>
                Mensa {sig.mensaOpen ? `offen · ${sig.mensaFree ?? 0} frei` : 'geschlossen'}
              </span>
            </span>
          )}
        </div>
      )}
      <h2>{time && full ? "Gleich geht's weiter" : title}</h2>
      {full && count && <p className="signal-count">{count}</p>}
      {full && nextSeat && <p className="signal-count">{nextSeat}</p>}
      {quiet && (
        <p className="signal-quiet">
          <Volume1 aria-hidden="true" /> {ampelTexts.quiet.DE}
        </p>
      )}
      {time && full && <p className="signal-time">{time}</p>}
      {full && mood === 'wait' && (
        <p className="signal-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </p>
      )}
      <p>
        {time && !full
          ? `Gleich geht's weiter · ${time}`
          : time
            ? 'Ihr seid die Nächsten!'
            : full && mood === 'wait'
              ? friendly
              : nextSeat
                ? `${text} ${nextSeat}${nextSeat.endsWith('.') ? '' : '.'}`
                : text}
      </p>
      {full && (
        <>
          <p className="signal-language" dir={language.dir} lang={language.lang ?? language.code.toLowerCase()}>
            <span>{language.code}</span> {ampelTexts[languageKey][language.code]}
          </p>
          <p className="signal-note">
            {admitting ? 'Deinen Platz bekommst du mit einer Platzkarte.' : 'Bitte den Eingang freihalten.'}
          </p>
          <button
            className="fullscreen-button"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen?.().catch(() => {});
            }}
          >
            <Maximize size={18} /> Vollbild
          </button>
          <button className="fullscreen-button sound-button" onClick={toggleSound} aria-pressed={sound}>
            {sound ? <Bell size={18} /> : <BellOff size={18} />} {sound ? 'Ton an' : 'Ton aus'}
          </button>
          {sound && locked && (
            <p className="signal-tap">Ton ist an: einmal auf den Bildschirm tippen, damit er klingt.</p>
          )}
          <span className="signal-brand">Mensaampel</span>
        </>
      )}
    </section>
  );
}
