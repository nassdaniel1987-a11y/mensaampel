import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { FlowPanel } from './FlowPanel';
import { Help } from './Help';
import { Management } from './Management';
import { Simulation } from './Simulation';
import { Signal } from './Signal';
import { Modal } from './Modal';
import { createDemoController } from './demo-controller.mjs';
import type { State, Command } from './types';
import './style.css';
import './demo.css';
declare global {
  interface Window {
    createMensaBrowserCore: (
      options?: unknown,
    ) => Promise<{ ccall: (name: string, result: string, args: string[], values: string[]) => string }>;
  }
}
async function start() {
  const module = await window.createMensaBrowserCore();
  const call = (q: unknown) => JSON.parse(module.ccall('mensa_call', 'string', ['string'], [JSON.stringify(q)]));
  const engine = {
    call,
    status: (now: number) => call({ op: 'status', now }),
    command: (command: Command, now: number) => call({ op: 'command', command, now }),
    snapshot: () => call({ op: 'snapshot' }),
    restore: (state: unknown, preserveUndo: boolean) => call({ op: 'restore', state, preserveUndo }),
    reset: () => call({ op: 'reset' }),
  };
  const controller = createDemoController(engine);
  function Demo() {
    const [state, setState] = useState<State>(controller.state()),
      [view, setView] = useState('management'),
      [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null),
      [connected, setConnected] = useState(true),
      [reset, setReset] = useState(false),
      [uid, setUid] = useState('sim:K01');
    useEffect(() => {
      let lastSeen = Date.now();
      const timer = setInterval(() => {
        if (controller.online()) {
          controller.tick();
          setState(controller.state());
          lastSeen = Date.now();
        }
        setConnected(Date.now() - lastSeen < 3000);
      }, 200);
      return () => clearInterval(timer);
    }, []);
    const send = async (c: Command) => {
      const r = controller.send(c);
      setState(r.state);
      setNotice({ ok: r.ok, text: r.message });
      return r.ok;
    };
    useEffect(() => {
      if (!notice) return;
      const timer = setTimeout(() => setNotice(null), 6000);
      return () => clearTimeout(timer);
    }, [notice]);
    const navigate = (next: string) => {
      setView(next);
      window.scrollTo(0, 0);
    };
    return (
      <div className={view === 'signal' ? 'demo-shell demo-signal' : 'demo-shell'}>
        <header>
          <span className="brand">Mensaampel</span>
          <nav aria-label="Ansicht">
            <button className={view === 'management' ? 'selected' : ''} onClick={() => navigate('management')}>
              Betreuung
            </button>
            <button className={view === 'simulation' ? 'selected' : ''} onClick={() => navigate('simulation')}>
              Simulation
            </button>
            <button className={view === 'flow' ? 'selected' : ''} onClick={() => navigate('flow')}>
              Einlass & Messungen
            </button>
            <button className={view === 'signal' ? 'selected' : ''} onClick={() => navigate('signal')}>
              Große Ampel
            </button>
            <button className={view === 'help' ? 'selected' : ''} onClick={() => navigate('help')}>
              Hilfe
            </button>
          </nav>
          <button className="quiet demo-reset" onClick={() => setReset(true)}>
            Demo zurücksetzen
          </button>
        </header>
        <div className="demo-note">
          Offline-Vorführung · Keine echten Karten · Testbestand nur bis zum Schließen oder Neuladen
        </div>
        {view === 'signal' ? (
          <>
            <Signal state={state} connected={connected} full />
            <section className="demo-controls" aria-label="Vorführsteuerung">
              <label>
                Karte
                <select value={uid} onChange={e => setUid(e.target.value)}>
                  {state.cards.map(c => (
                    <option key={c.uid} value={c.uid}>
                      {c.label} · {c.out ? 'ausgegeben' : 'verfügbar'}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={!connected || !!state.held} onClick={() => send({ type: 'tap', uid })}>
                Karte scannen
              </button>
              <button className="outline" disabled={!connected} onClick={() => send({ type: 'advance', seconds: 10 })}>
                +10 Sekunden
              </button>
              <button
                className="outline"
                disabled={!connected}
                onClick={() => send({ type: 'pause', paused: !state.paused })}
              >
                {state.paused ? 'Einlass fortsetzen' : 'Einlass pausieren'}
              </button>
              {!state.ready && (
                <button disabled={!connected} onClick={() => send({ type: 'confirm' })}>
                  Bestand bestätigen
                </button>
              )}
            </section>
          </>
        ) : (
          <main>
            {!connected && (
              <div className="banner error" role="alert">
                Simulierte Verbindung unterbrochen. Die Ampel ist rot; nach acht Sekunden endet der Test automatisch.
              </div>
            )}
            {view === 'help' ? (
              <Help />
            ) : view === 'flow' ? (
              <FlowPanel state={state} send={send} busy={false} connected={connected} />
            ) : view === 'management' ? (
              <Management state={state} send={send} busy={false} connected={connected} notice={notice} />
            ) : (
              <Simulation state={state} send={send} busy={false} connected={connected} />
            )}
          </main>
        )}
        {notice && (
          <div className={`toast ${notice.ok ? 'success' : 'failure'}`} role="status">
            <span>{notice.text}</span>
            <button aria-label="Meldung schließen" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}
        {reset && (
          <Modal title="Vorführung neu beginnen?" onClose={() => setReset(false)}>
            <p>
              Alle Testbuchungen dieser Vorführung werden gelöscht. Küche: 48 Plätze, Mensa: 64 Plätze und zunächst
              gesperrt.
            </p>
            <div className="action-row">
              <button className="outline" onClick={() => setReset(false)}>
                Abbrechen
              </button>
              <button
                onClick={() => {
                  void send({ type: 'demoReset' });
                  setConnected(true);
                  setUid('sim:K01');
                  setReset(false);
                  navigate('management');
                }}
              >
                Vorführung zurücksetzen
              </button>
            </div>
          </Modal>
        )}
      </div>
    );
  }
  createRoot(document.getElementById('root')!).render(<Demo />);
}
void start().catch(() => {
  document.getElementById('root')!.innerHTML =
    '<main><h1>Die Vorführung konnte nicht starten</h1><p>Bitte die HTML-Datei in einem aktuellen Browser mit JavaScript und WebAssembly öffnen. Eine reine Dateivorschau führt die Anwendung nicht aus.</p></main>';
});
