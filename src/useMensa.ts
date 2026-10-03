import { useEffect, useRef, useState } from 'react';
import type { State, Command, Info } from './types';
import { mergeCards } from './state-merge.mjs';
import { needsReload } from './version-check.mjs';
import { VERSION } from './version.mjs';
import { uploadInPieces } from './firmware-upload.mjs';
import { healAction } from './self-heal.mjs';
export function useMensa() {
  const [state, setState] = useState<State | null>(null),
    [info, setInfo] = useState<Info | null>(null),
    [authRequired, setAuthRequired] = useState(false),
    [lastSeen, setLastSeen] = useState(0),
    [tick, setTick] = useState(Date.now()),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const token = useRef(sessionStorage.getItem('mensa-device-session') || ''),
    locked = useRef(false),
    epoch = useRef(0),
    infoRef = useRef<Info | null>(null);
  const publicView = location.pathname === '/ampel';
  // The Ampel page offers its local time while the Dial reports no valid clock (e.g. RTC empty after a power loss).
  const needClock = useRef(false);
  // Card list cache (the Dial omits unchanged cards) and connection diagnostics shown under "Gerät".
  const cards = useRef<{ cards: State['cards']; rev: number } | null>(null),
    [diag, setDiag] = useState({ lastMs: 0, failures: 0 });
  const isDevice = () => infoRef.current?.mode === 'device';
  const apply = (s: State) => {
    const m = mergeCards(cards.current, s);
    cards.current = m.cache;
    return m.state as State;
  };
  useEffect(() => {
    let alive = true,
      inFlight = false,
      // Self-healing of the Ampel page (src/self-heal.mjs): last answer and last polling round.
      seenAt = Date.now(),
      loopAt = Date.now();
    const abort = new AbortController();
    // Device: calmer polling, longer patience; one immediate retry after a failed request.
    const read = async (retry = false): Promise<void> => {
      if (inFlight || locked.current) return;
      inFlight = true;
      const generation = epoch.current,
        started = Date.now();
      let failed = false;
      try {
        if (!infoRef.current) {
          const r = await fetch('/api/info', { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(1800)]) });
          if (!r.ok) throw Error();
          const value = await r.json();
          if (!alive) return;
          infoRef.current = value;
          setInfo(value);
        }
        const t = new Date(),
          clock = [t.getFullYear(), t.getMonth() + 1, t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds()];
        const since = isDevice() && cards.current && cards.current.rev > 0 ? '?cards=' + cards.current.rev : '';
        const path = publicView
          ? '/api/signal' + (needClock.current ? '?clock=' + encodeURIComponent(JSON.stringify(clock)) : '')
          : '/api/state' + since;
        const r = await fetch(path, {
          cache: 'no-store',
          headers: { 'X-Mensa-Token': token.current },
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(isDevice() && !publicView ? 5000 : 1800)]),
        });
        if (r.status === 401) {
          if (alive) {
            cards.current = null;
            setAuthRequired(true);
            setState(null);
          }
          return;
        }
        if (!r.ok) {
          failed = true;
          return;
        }
        const s = await r.json();
        // The Dial was updated while this page stayed open: load the new page once (sign-in stays in sessionStorage).
        const serverVersion = s.version ?? s.device?.version;
        let reloadedFor: string | null = null;
        try {
          reloadedFor = sessionStorage.getItem('mensa-reloaded-for');
        } catch {
          /* no storage: reload is still limited by the version check */
        }
        if (alive && !locked.current && needsReload(serverVersion, VERSION, reloadedFor)) {
          try {
            sessionStorage.setItem('mensa-reloaded-for', serverVersion);
          } catch {
            /* see above */
          }
          location.reload();
          return;
        }
        if (alive && generation === epoch.current && !locked.current) {
          if (s.token) token.current = s.token;
          if (publicView) needClock.current = s.clockValid === false;
          setState(publicView ? s : apply(s));
          setDiag(d => ({ ...d, lastMs: Date.now() - started }));
          setAuthRequired(false);
          setLastSeen(Date.now());
          seenAt = Date.now();
          if (!publicView) syncClock(s);
        }
      } catch {
        /* after three seconds, stale public state is red */
        failed = true;
      } finally {
        inFlight = false;
      }
      if (failed && alive && !abort.signal.aborted) {
        setDiag(d => ({ ...d, failures: d.failures + 1 }));
        if (!retry) return read(true);
      }
    };
    // The Dial has no network time: the signed-in supervision view quietly corrects its clock (e.g. after daylight saving time changes).
    let lastSync = 0;
    const syncClock = (s: {
      flow?: { clockValid: boolean; weekday: number; currentMinute: number };
      device?: unknown;
    }) => {
      if (!s.device || !s.flow || Date.now() - lastSync < 60000) return;
      const t = new Date(),
        minute = t.getHours() * 60 + t.getMinutes(),
        f = s.flow;
      if (f.clockValid && f.weekday === t.getDay() && Math.abs(f.currentMinute - minute) <= 2) return;
      lastSync = Date.now();
      void fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mensa-Token': token.current },
        body: JSON.stringify({
          type: 'clockSync',
          weekday: t.getDay(),
          minute,
          date: [t.getFullYear(), t.getMonth() + 1, t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds()],
        }),
      }).catch(() => {});
    };
    let timer: ReturnType<typeof setTimeout> | undefined,
      chain = 0;
    // A restarted loop (self-healing) replaces the old one: a late old round does not start a second chain.
    const loop = async (id = ++chain) => {
      loopAt = Date.now();
      await read();
      if (alive && id === chain) timer = setTimeout(() => loop(id), !publicView && isDevice() ? 1500 : 700);
    };
    void loop();
    // A tab that becomes visible again asks at once instead of waiting for its throttled background timer.
    const visible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    document.addEventListener('visibilitychange', visible);
    const clock = setInterval(() => setTick(Date.now()), 250);
    let probing = false;
    const heal = publicView
      ? setInterval(async () => {
          let lastHeal: number | null = null;
          try {
            lastHeal = Number(sessionStorage.getItem('mensa-healed-at')) || null;
          } catch {
            /* without storage the pause is not kept across a reload */
          }
          const action = healAction({ now: Date.now(), lastSeen: seenAt, lastLoop: loopAt, lastHeal });
          if (action === 'restart') {
            clearTimeout(timer);
            void loop();
          } else if (action === 'probe' && !probing) {
            probing = true;
            try {
              const r = await fetch('/api/signal', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
              if (r.ok && alive) {
                try {
                  sessionStorage.setItem('mensa-healed-at', String(Date.now()));
                } catch {
                  /* see above */
                }
                location.reload();
              }
            } catch {
              /* Dial not reachable: keep showing red, no reload */
            } finally {
              probing = false;
            }
          }
        }, 5000)
      : undefined;
    return () => {
      clearInterval(heal);
      document.removeEventListener('visibilitychange', visible);
      alive = false;
      abort.abort();
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, [publicView]);
  async function send(command: Command) {
    if (locked.current) return false;
    locked.current = true;
    epoch.current++;
    setBusy(true);
    // The command id makes a retry safe: the Dial answers a known id from memory instead of running it again.
    const body = JSON.stringify({ ...command, rid: Math.random().toString(36).slice(2) + Date.now().toString(36) });
    const post = () =>
      fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mensa-Token': token.current },
        body,
        signal: AbortSignal.timeout(7000),
      });
    try {
      let r: Response;
      try {
        r = await post();
      } catch {
        r = await post(); // network hiccup or timeout: once more with the same id
      }
      const result = await r.json();
      if (r.status === 401) {
        cards.current = null;
        setAuthRequired(true);
      }
      if (!r.ok) throw Error(result.message || 'Keine Verbindung.');
      if (result.state) {
        setState({ ...apply(result.state), token: token.current });
        setLastSeen(Date.now());
      }
      setNotice({ ok: result.ok, text: result.message });
      return !!result.ok;
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message });
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function authenticate(password: string) {
    setBusy(true);
    try {
      const i = await (await fetch('/api/info')).json();
      infoRef.current = i;
      setInfo(i);
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, nonce: i.nonce }),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.message);
      token.current = result.token;
      cards.current = null;
      sessionStorage.setItem('mensa-device-session', result.token);
      setAuthRequired(false);
      setNotice(null);
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await fetch('/api/logout', { method: 'POST', headers: { 'X-Mensa-Token': token.current } }).catch(() => {});
    token.current = '';
    cards.current = null;
    sessionStorage.removeItem('mensa-device-session');
    setState(null);
    setAuthRequired(true);
  }
  async function backup() {
    try {
      const r = await fetch('/api/backup', { headers: { 'X-Mensa-Token': token.current } });
      if (!r.ok) throw Error('Bitte erneut anmelden.');
      const data = await r.blob();
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mensa-bestand.json';
      a.click();
      URL.revokeObjectURL(url);
      try {
        localStorage.setItem('mensa-letzte-sicherung', String(Date.now()));
      } catch {
        /* reminder only */
      }
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message });
    }
  }
  // Upload a downloaded backup; the service validates it and requires a fresh stock confirmation.
  async function restore(file: File) {
    if (locked.current) return false;
    locked.current = true;
    epoch.current++;
    setBusy(true);
    try {
      const backup = JSON.parse(await file.text());
      const r = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mensa-Token': token.current },
        body: JSON.stringify({ confirmed: true, backup }),
      });
      const result = await r.json();
      if (r.status === 401) setAuthRequired(true);
      if (result.state) {
        setState({ ...apply(result.state), token: token.current });
        setLastSeen(Date.now());
      }
      setNotice({ ok: !!result.ok, text: result.message || 'Sicherung konnte nicht eingespielt werden.' });
      return !!result.ok;
    } catch {
      setNotice({ ok: false, text: 'Datei ist keine gültige Sicherung.' });
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  // Firmware update over the Dial's WLAN: upload with progress, then wait until the Dial answers with the new version.
  async function updateFirmware(file: File, expected: string, progress: (percent: number) => void) {
    if (locked.current) return false;
    locked.current = true;
    epoch.current++;
    setBusy(true);
    try {
      // In pieces with repetition after WLAN drops (src/firmware-upload.mjs).
      const result = await uploadInPieces(
        new Uint8Array(await file.arrayBuffer()),
        async (path, body, type, offset) => {
          const headers: Record<string, string> = { 'X-Mensa-Token': token.current, 'Content-Type': type };
          if (offset !== undefined) headers['X-Update-Offset'] = String(offset);
          const r = await fetch(path, {
            method: 'POST',
            headers,
            body: body as BodyInit,
            cache: 'no-store',
            signal: AbortSignal.timeout(30000),
          });
          return r.json();
        },
        progress,
      );
      if (!result.ok) {
        setNotice({ ok: false, text: result.message });
        return false;
      }
      setNotice({ ok: true, text: 'Update übertragen. Das Dial startet neu …' });
      // The Dial restarts 1.5 s after its answer; only then ask for the version (also correct for the same version).
      await new Promise(r => setTimeout(r, 6000));
      const until = Date.now() + 120000;
      while (Date.now() < until) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const i = await (await fetch('/api/info', { cache: 'no-store', signal: AbortSignal.timeout(2500) })).json();
          if (i.version === expected) {
            infoRef.current = i;
            setInfo(i);
            cards.current = null;
            setNotice({ ok: true, text: `Update fertig: Version ${i.version}. Bitte neu anmelden.` });
            return true;
          }
        } catch {
          /* Dial still restarting */
        }
      }
      setNotice({
        ok: false,
        text: 'Das Dial meldet sich nicht mit der neuen Version. Tablet mit dem Dial-WLAN verbinden.',
      });
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return {
    updateFirmware,
    state,
    info,
    authRequired,
    authenticate,
    logout,
    backup,
    restore,
    send,
    busy,
    notice,
    setNotice,
    // The Ampel stays red after 3 s (safety rule); the supervision view on the Dial tolerates 8 s.
    connected: !!state && tick - lastSeen < (!publicView && info?.mode === 'device' ? 8000 : 3000),
    lastSeen,
    diag,
  };
}
