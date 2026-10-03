export type RoomId = 'K' | 'M';
export type Card = {
  uid: string;
  label: string;
  room: RoomId;
  out: boolean;
  lost: boolean;
  last: number;
  remainingMs: number;
  missed?: number;
  quick?: number;
};
export type Room = { capacity: number; limit: number; open: boolean; occupied: number; free: number };
export type Device = {
  version: string;
  configured: boolean;
  reader: 'internal' | 'external' | 'auto';
  readerActive?: 'internal' | 'external';
  readerHealthy: boolean;
  readerError: string;
  ssid: string;
  channel?: number;
  wifiMode?: 'ap' | 'router';
  routerSsid?: string;
  routerIp?: string;
  routerGateway?: string;
  routerMask?: string;
  routerConnected?: boolean;
  rescue?: boolean;
  resting?: boolean;
  captureTarget: string;
  capturedUid: string;
  captureUntil: number;
  feedback: string;
  feedbackOk: boolean;
  feedbackAgo?: number;
  ampelAgo?: number;
  needsReview: boolean;
  freeHeap: number;
  minimumHeap: number;
  maxAllocHeap?: number;
  resetReason?: string;
  webRequests?: number;
  webMaxMs?: number;
  lastCrumb?: string;
  memoryTest?: { running: boolean; ok: boolean; message: string };
  health?: {
    crash: boolean;
    readerFaults: number;
    saveFailures: number;
    ampelDrops: number;
    minBlock: number;
    unclearReads?: number;
    wlanDrops?: number;
    sendAborts?: number;
    sendMaxMs?: number;
    probeAnswers?: number;
    drawMs?: number;
    drawMaxMs?: number;
    rssiMin?: number;
    router?: boolean;
    stations?: { mac: string; rssi: number }[];
  };
  clients: number;
  uptime: number;
};
export type Info = { mode: 'pc' | 'device'; configured?: boolean; nonce?: string; version?: string };
export type State = {
  cardsRev?: number;
  volume?: number;
  sound?: number;
  remind?: number;
  rest?: number;
  dayWaiting?: boolean;
  reminders?: number;
  lostCards?: string[];
  clockValid?: boolean;
  ready: boolean;
  paused: boolean;
  manualPaused?: boolean;
  cooldown: number;
  held: string;
  undo: unknown;
  day: number;
  rooms: Record<RoomId, Room>;
  cards: Card[];
  events: { at: number; message: string }[];
  signal: {
    green: boolean;
    reason: string;
    free: number;
    releaseIn?: number;
    groupLeft?: number;
    kitchenFree?: number;
    mensaFree?: number;
    mensaOpen?: boolean;
    nextFreeIn?: number;
    stayMinutes?: number;
    mensaHint?: number;
    busy?: number;
    mensaBasis?: number;
  };
  outCards?: string[];
  cardsMissing?: boolean;
  mensaEdit?: number;
  series?: { active: boolean; room: string; label: string; done: number; total: number };
  staffCount?: number;
  staffLearning?: boolean;
  menuOpen?: boolean;
  testMode?: boolean;
  now: number;
  storageError: string;
  recoveryRequired: boolean;
  sim: { offset: number; offline: boolean; forceWriteFailure: boolean };
  token: string;
  device?: Device;
  dial?: DialItem[];
  feedback?: { text: string; ok: boolean; at: number };
  flow?: FlowState;
};
// Draw list of the Dial main screen from the shared core: circle, round rectangle or text (middle_center, RGB565 colours).
export type DialItem =
  | ['f', number]
  | ['a', number, number, number, number, number, number, number]
  | ['c', number, number, number, number]
  | ['r', number, number, number, number, number, number]
  | ['t', number, number, number, number, string];
export type Command = { type: string; [key: string]: unknown };
export type Send = (command: Command) => Promise<boolean>;
export type AutoState = {
  on: boolean;
  start: number;
  perChild: number;
  level: 'start' | 'global' | 'slot';
  observations: number;
  releaseIn: number;
  faster: number;
  slower: number;
  nextSize: number;
  nextIsStart: boolean;
  startTarget: number;
  normalSize: number;
  sizeLow: number;
  sizeHigh: number;
};
export type DayReport = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export type FlowState = {
  startSize: number;
  sizeMin: number;
  sizeMax: number;
  idleMinutes: number;
  dayStart: number;
  startLearned: number;
  sizeGlobal: number;
  groupIsStart: boolean;
  stayAvg?: number;
  stayN?: number;
  today: DayReport;
  history: DayReport[];
  autoOn: boolean;
  autoStart: number;
  autoGlobal: number;
  autoGlobalN: number;
  autoSlots: [number, number, number, number, number][];
  releaseAt: number;
  autoReleased: boolean;
  autoFaster: number;
  autoSlower: number;
  auto: AutoState;
  trialBuffer: number;
  trialDelay: number;
  trialDue: boolean;
  trialRemaining: number;
  trialReviewed: boolean;
  trialCount: number;
  trialLevel: number;
  reviews: [number, number, number, number, number, number, number, number, number][];
  relief: boolean;
  reliefAt: number;
  yellow: number;
  batch: number;
  issued: number;
  waiting: boolean;
  queue: number;
  weekday: number;
  clockValid: boolean;
  currentMinute: number;
  armed: boolean;
  kind: number;
  started: number;
  elapsedSeconds: number;
  measuringUid: string;
  measureSize: number;
  samples: [number, number, number, number, number, number][];
  estimate: {
    level: 'insufficient' | 'general' | 'matched';
    count: number;
    seconds: number;
    min: number;
    max: number;
    checkDue: boolean;
  };
};
