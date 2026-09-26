import { useEffect, useRef, useState } from 'react';
import { Check, Hand, WifiOff, Maximize, Bell, BellOff } from 'lucide-react';
import type { State } from './types';
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
    was = useRef<boolean | null>(null);
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
  return (
    <section
      className={`signal ${full ? 'fullscreen-signal' : ''} ${yellow ? 'yellow' : green ? 'green' : 'red'}`}
      aria-label="Ampelanzeige"
    >
      <div className="signal-circle" aria-hidden="true">
        {admitting ? <Check /> : reason === 'offline' ? <WifiOff /> : <Hand />}
      </div>
      <h2>{title}</h2>
      <p>
        {reason === 'batch' && connected && (state?.signal.releaseIn ?? -1) > 0
          ? `Gleich geht's weiter · ${Math.floor(state!.signal.releaseIn! / 60)}:${String(state!.signal.releaseIn! % 60).padStart(2, '0')}`
          : text}
      </p>
      {full && (
        <>
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
          <span className="signal-brand">Mensaampel</span>
        </>
      )}
    </section>
  );
}
