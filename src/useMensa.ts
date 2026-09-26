import { useEffect, useRef, useState } from 'react';
import type { State, Command, Info } from './types';
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
  useEffect(() => {
    let alive = true,
      inFlight = false;
    const abort = new AbortController();
    const read = async () => {
      if (inFlight || locked.current) return;
      inFlight = true;
      const generation = epoch.current;
      try {
        if (!infoRef.current) {
          const r = await fetch('/api/info', { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(1800)]) });
          if (!r.ok) throw Error();
          const value = await r.json();
          if (!alive) return;
          infoRef.current = value;
          setInfo(value);
        }
        const r = await fetch(publicView ? '/api/signal' : '/api/state', {
          cache: 'no-store',
          headers: { 'X-Mensa-Token': token.current },
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(1800)]),
        });
        if (r.status === 401) {
          if (alive) {
            setAuthRequired(true);
            setState(null);
          }
          return;
        }
        if (!r.ok) return;
        const s = await r.json();
        if (alive && generation === epoch.current && !locked.current) {
          if (s.token) token.current = s.token;
          setState(s);
          setAuthRequired(false);
          setLastSeen(Date.now());
          if (!publicView) syncClock(s);
        }
      } catch {
        /* after three seconds, stale public state is red */
      } finally {
        inFlight = false;
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
    void read();
    const poll = setInterval(read, 700),
      clock = setInterval(() => setTick(Date.now()), 250);
    return () => {
      alive = false;
      abort.abort();
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [publicView]);
  async function send(command: Command) {
    if (locked.current) return false;
    locked.current = true;
    epoch.current++;
    setBusy(true);
    try {
      const r = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Mensa-Token': token.current },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(7000),
      });
      const result = await r.json();
      if (r.status === 401) setAuthRequired(true);
      if (!r.ok) throw Error(result.message || 'Keine Verbindung.');
      if (result.state) {
        setState({ ...result.state, token: token.current });
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
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message });
    }
  }
  // Upload a downloaded backup; the service validates it and requires a fresh stock confirmation.
  async function restore(file: File) {
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
        setState({ ...result.state, token: token.current });
        setLastSeen(Date.now());
      }
      setNotice({ ok: !!result.ok, text: result.message || 'Sicherung konnte nicht eingespielt werden.' });
      return !!result.ok;
    } catch {
      setNotice({ ok: false, text: 'Datei ist keine gültige Sicherung.' });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return {
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
    connected: !!state && tick - lastSeen < 3000,
    lastSeen,
  };
}
