// Sound sets of the Dial (same table as core/sounds.hpp; tests/sounds.test.mjs compares). Events: Ausgabe, Rückgabe,
// abgewiesen, Hinweis, Erinnerung, Menü. Notes: [frequency Hz, duration ms, pause ms].
export const soundEvents = ['Ausgabe', 'Rückgabe', 'abgewiesen', 'Hinweis', 'Erinnerung', 'Menü'];
export const soundSets = [
  {
    name: 'Klassisch',
    events: [
      [[1800, 90, 0]],
      [[1800, 90, 0]],
      [[400, 220, 0]],
      [[1800, 90, 0]],
      [
        [1400, 120, 40],
        [1400, 120, 0],
      ],
      [[1800, 90, 0]],
    ],
  },
  {
    name: 'Ping',
    events: [
      [
        [2637, 55, 15],
        [3520, 90, 0],
      ],
      [
        [3520, 55, 15],
        [2637, 90, 0],
      ],
      [
        [1568, 110, 60],
        [1568, 110, 0],
      ],
      [[3136, 60, 0]],
      [
        [2637, 70, 50],
        [3136, 70, 50],
        [2637, 70, 0],
      ],
      [
        [3520, 40, 20],
        [3520, 40, 0],
      ],
    ],
  },
  {
    name: 'Gong',
    events: [
      [
        [2093, 90, 10],
        [2637, 170, 0],
      ],
      [
        [2637, 90, 10],
        [2093, 170, 0],
      ],
      [
        [1760, 140, 30],
        [1319, 220, 0],
      ],
      [[2349, 110, 0]],
      [
        [2093, 110, 30],
        [2637, 110, 30],
        [3136, 160, 0],
      ],
      [[2637, 80, 0]],
    ],
  },
  {
    name: 'Marimba',
    events: [
      [
        [2349, 35, 25],
        [2960, 35, 25],
        [3520, 70, 0],
      ],
      [
        [3520, 35, 25],
        [2960, 35, 25],
        [2349, 70, 0],
      ],
      [
        [1976, 45, 45],
        [1760, 45, 45],
        [1480, 90, 0],
      ],
      [[2960, 45, 0]],
      [
        [2349, 40, 30],
        [3520, 40, 120],
        [2349, 40, 30],
        [3520, 40, 0],
      ],
      [[3136, 35, 0]],
    ],
  },
];
// Plays a set on the tablet like the Dial's buzzer (square wave, quiet): Ausgabe, Rückgabe and abgewiesen in a row.
let context;
export function playSoundSet(set, volume = 7) {
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtx || !soundSets[set]) return false;
  context = context || new AudioCtx();
  let at = context.currentTime + 0.05;
  for (const event of [0, 1, 2]) {
    for (const [freq, ms, gap] of soundSets[set].events[event]) {
      const osc = context.createOscillator(),
        gain = context.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.value = 0.02 * volume;
      osc.connect(gain).connect(context.destination);
      osc.start(at);
      osc.stop(at + ms / 1000);
      at += (ms + gap) / 1000;
    }
    at += 0.5;
  }
  return true;
}
