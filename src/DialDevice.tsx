import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, RotateCcw, RotateCw } from 'lucide-react';
import { paintDial, dialSize as size } from './dial-paint.mjs';
import type { State } from './types';
// Pixel-exact rendering of the Dial screen from the core's draw list (see dial-paint.mjs).
const touch = { x: 30, y: 131, w: 180, h: 38 };
let audio: AudioContext | null = null;
function beep(ok: boolean, volume: number) {
  if (volume <= 0) return;
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.type = 'square';
    o.frequency.value = ok ? 1800 : 400;
    g.gain.value = (0.06 * volume) / 10;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + (ok ? 0.09 : 0.22));
  } catch {
    /* no sound available */
  }
}
const readMute = () => {
  try {
    return localStorage.getItem('mensa-dial-mute') === '1';
  } catch {
    return false;
  }
};
export function DialDevice({
  state: s,
  onTouch,
  onPress,
  onHold,
  onTurn,
  onCard,
  disabled,
}: {
  state: State;
  onTouch: () => void;
  onPress: () => void;
  onHold: () => void;
  onTurn: (steps: number) => void;
  onCard: (uid: string) => void;
  disabled: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    ring = useRef<HTMLDivElement>(null),
    turn = useRef(onTurn),
    lastFeedback = useRef(s.feedback?.at ?? 0),
    [muted, setMuted] = useState(readMute),
    [over, setOver] = useState(false);
  turn.current = disabled ? () => {} : onTurn;
  // Mouse wheel over the Dial = rotary ring; non-passive so the page does not scroll at the same time.
  useEffect(() => {
    const el = ring.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY) turn.current(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx && s.dial) ctx.putImageData(new ImageData(paintDial(s.dial), size, size), 0, 0);
  }, [s.dial]);
  useEffect(() => {
    const at = s.feedback?.at ?? 0;
    if (at > lastFeedback.current && !muted) beep(!!s.feedback?.ok, s.volume ?? 7);
    lastFeedback.current = Math.max(lastFeedback.current, at);
  }, [s.feedback, muted]);
  function click(e: React.MouseEvent<HTMLCanvasElement>) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect(),
      x = ((e.clientX - r.left) * size) / r.width,
      y = ((e.clientY - r.top) * size) / r.height;
    if (
      !disabled &&
      !s.flow?.relief &&
      (s.mensaEdit ?? -1) < 0 &&
      x >= touch.x &&
      x <= touch.x + touch.w &&
      y >= touch.y &&
      y <= touch.y + touch.h
    )
      onTouch();
  }
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try {
      localStorage.setItem('mensa-dial-mute', next ? '1' : '0');
    } catch {
      /* per-viewer convenience only */
    }
  };
  return (
    <div className="dial-device">
      <div
        ref={ring}
        className={`dial-ring ${over ? 'card-over' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Dial-Taste drücken"
        title="Ring anklicken = Taste drücken"
        onClick={() => {
          if (!disabled) onPress();
        }}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault();
            onPress();
          }
        }}
        onDragOver={e => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={e => {
          e.preventDefault();
          setOver(false);
          const uid = e.dataTransfer.getData('text/plain');
          if (uid && !disabled) onCard(uid);
        }}
      >
        <canvas
          ref={canvas}
          width={size}
          height={size}
          onClick={click}
          aria-label={(s.dial || [])
            .filter(i => i[0] === 't')
            .map(i => i[5])
            .join(' · ')}
        />
      </div>
      <div className="dial-controls">
        <button className="quiet" disabled={disabled} onClick={() => onTurn(-1)} aria-label="Ring nach links drehen">
          <RotateCcw size={18} />
        </button>
        <button className="outline" disabled={disabled} onClick={onPress}>
          Taste drücken
        </button>
        <button className="outline" disabled={disabled} onClick={onHold}>
          Taste 3 s halten
        </button>
        <button className="quiet" disabled={disabled} onClick={() => onTurn(1)} aria-label="Ring nach rechts drehen">
          <RotateCw size={18} />
        </button>
        <button className="quiet" onClick={toggleMute} aria-pressed={muted}>
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          {muted ? 'Ton aus' : 'Ton an'}
        </button>
      </div>
      <p className="hint">
        Wie am Gerät: orange Fläche antippen = Ausgabe entlasten · Taste = Pause, weiter oder nächste Gruppe freigeben ·
        3 s halten = Bestand bestätigen (sonst WLAN-Daten) · Ring drehen (Mausrad) = Mensaplätze, Taste = OK · Karte auf
        das Dial ziehen = vorhalten.
      </p>
    </div>
  );
}
