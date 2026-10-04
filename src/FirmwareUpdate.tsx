import { useEffect, useState } from 'react';
import { CloudDownload, Upload, Wifi } from 'lucide-react';
import { checkFirmware } from './firmware-file.mjs';

// Firmware update over the Dial's WLAN (no internet needed): the file is loaded onto the tablet beforehand.
export function FirmwareUpdate({
  version,
  disabled,
  updateFirmware,
}: {
  version: string;
  disabled: boolean;
  updateFirmware: (file: File, expected: string, progress: (percent: number) => void) => Promise<boolean>;
}) {
  const [file, setFile] = useState<{ file: File; version: string } | null>(null),
    [message, setMessage] = useState(''),
    [percent, setPercent] = useState(-1);
  return (
    <section className="device-section">
      <h2>
        <Upload /> Firmware-Update
      </h2>
      <p>
        Ohne PC: „Mensaampel-Dial-Update.bin“ vorher mit Internet auf dieses Tablet laden, dann hier auswählen. Karten
        und Bestand bleiben erhalten. Der Einlass ist etwa eine Minute unterbrochen.
      </p>
      <p className="hint">
        Während des Updates: Tablet nah am Dial, Bildschirm an lassen und auf dieser Seite bleiben. Bricht es ab,
        einfach nochmal starten – es geht dort weiter, wo es aufgehört hat.
      </p>
      <p className="hint">Installiert: Version {version}</p>
      <input
        type="file"
        accept=".bin,application/octet-stream"
        disabled={disabled || percent >= 0}
        onChange={async e => {
          const f = e.currentTarget.files?.[0];
          setFile(null);
          setMessage('');
          if (!f) return;
          const check = checkFirmware(new Uint8Array(await f.arrayBuffer()));
          setMessage(check.message);
          if (check.ok && check.version) setFile({ file: f, version: check.version });
        }}
      />
      {message && <p className={file ? 'hint' : 'banner error'}>{message}</p>}
      {file && (
        <button
          disabled={disabled || percent >= 0}
          onClick={async () => {
            if (
              !confirm(
                `Version ${version} durch ${file.version} ersetzen? Der Einlass ist etwa eine Minute unterbrochen. ` +
                  'Dial dabei nicht ausschalten.',
              )
            )
              return;
            setPercent(0);
            const ok = await updateFirmware(file.file, file.version, setPercent);
            setPercent(-1);
            if (ok) setFile(null);
          }}
        >
          <Upload size={18} /> Update auf {file.version} starten
        </button>
      )}
      {percent >= 0 && (
        <p className="hint" role="status">
          Übertragen: {percent} % {percent >= 100 && '· Dial prüft und startet neu …'}
        </p>
      )}
    </section>
  );
}

type NetState = {
  ok?: boolean;
  phase: string;
  busy: boolean;
  message: string;
  latest: string;
  current: string;
  network: string;
  saved: string;
  progress: number;
  router: boolean;
  networks: { ssid: string; rssi: number; strength: string; open: boolean }[];
};
const working = ['scanning', 'connecting', 'checking', 'downloading'];
// Online update (0.25): the Dial searches the WLANs around it, joins the phone hotspot chosen here and fetches the
// newest version from GitHub itself. The tablet only starts it and shows the progress.
export function OnlineUpdate({
  version,
  disabled,
  netCall,
  outCards,
}: {
  version: string;
  disabled: boolean;
  netCall: (path: string, body?: unknown) => Promise<any>;
  outCards: number;
}) {
  const [net, setNet] = useState<NetState | null>(null),
    [chosen, setChosen] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState('');
  const refresh = async () => {
    try {
      const n = await netCall('/api/net');
      if (n?.ok) setNet(n);
    } catch {
      /* the Dial is changing its radio channel: the next round asks again */
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const running = !!net && (net.busy || working.includes(net.phase));
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void refresh(), 1500);
    return () => clearInterval(t);
  }, [running]);
  const start = async (path: string, body?: unknown) => {
    setError('');
    try {
      const r = await netCall(path, body ?? {});
      if (!r?.ok) setError(r?.message || 'Hat nicht geklappt.');
    } catch {
      setError('Dial nicht erreichbar. Gleich nochmal versuchen.');
    }
    setTimeout(() => void refresh(), 600);
  };
  const locked = disabled || running || outCards > 0 || !!net?.router;
  const tone = net?.phase === 'error' ? 'banner error' : net?.phase === 'available' ? 'banner' : 'hint';
  return (
    <section className="device-section online-update">
      <h2>
        <CloudDownload /> Online-Update (Handy-Hotspot)
      </h2>
      <p>
        Handy-Hotspot einschalten, dann sucht das Dial selbst nach einer neuen Version und lädt sie aus dem Internet.
        Kein Datei-Hochladen über das Tablet. Nur außerhalb des Mittags: Die Tablets sind dabei ein paar Sekunden
        getrennt.
      </p>
      <p className="hint">Installiert: Version {version}</p>
      {net?.router && <p className="banner error">Im Router-Betrieb nicht möglich (eigenes WLAN des Dials nötig).</p>}
      {outCards > 0 && <p className="hint">Erst wenn keine Karte mehr draußen ist ({outCards} noch draußen).</p>}
      <div className="action-row">
        {net?.saved && (
          <button disabled={locked} onClick={() => void start('/api/net/check', { ssid: net.saved })}>
            <CloudDownload size={18} /> Über „{net.saved}“ nach Update suchen
          </button>
        )}
        <button className="outline" disabled={locked} onClick={() => void start('/api/net/scan')}>
          <Wifi size={18} /> WLAN suchen
        </button>
        {net?.saved && (
          <button className="quiet" disabled={locked} onClick={() => void start('/api/net/forget')}>
            Hotspot vergessen
          </button>
        )}
      </div>
      {net && net.networks.length > 0 && !running && (
        <ul className="wlan-list" aria-label="Gefundene WLANs (stärkste zuerst)">
          {net.networks.map(w => (
            <li key={w.ssid}>
              <button
                className={chosen === w.ssid ? 'selected' : 'outline'}
                disabled={locked}
                onClick={() => {
                  setChosen(w.ssid);
                  setPassword('');
                }}
              >
                <Wifi size={18} /> {w.ssid} <small>· {w.strength}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {net && !running && (net.networks.length > 0 || net.message === 'Kein WLAN gefunden.') && (
        <label className="wlan-manual">
          Anderes WLAN: Name eingeben
          <input
            value={net.networks.some(w => w.ssid === chosen) ? '' : chosen}
            maxLength={32}
            placeholder="z. B. Name des Handy-Hotspots"
            onChange={e => {
              setChosen(e.currentTarget.value);
              setPassword('');
            }}
            disabled={locked}
          />
        </label>
      )}
      {chosen && !running && (
        <form
          className="wlan-login"
          onSubmit={e => {
            e.preventDefault();
            void start('/api/net/check', { ssid: chosen, password, remember: true });
          }}
        >
          <label>
            Passwort für „{chosen}“
            <input
              type="password"
              autoComplete="off"
              value={password}
              onChange={e => setPassword(e.currentTarget.value)}
              disabled={locked}
            />
          </label>
          <button type="submit" disabled={locked}>
            Verbinden und nach Update suchen
          </button>
          <p className="hint">Das Dial merkt sich den Hotspot. Beim nächsten Mal reicht ein Tipp.</p>
        </form>
      )}
      {net?.message && (
        <p className={tone} role="status">
          {net.message}
          {net.phase === 'downloading' && ` ${net.progress} %`}
        </p>
      )}
      {net?.phase === 'available' && !running && (
        <button
          disabled={locked}
          onClick={() => {
            if (
              confirm(
                `Version ${version} durch ${net.latest} ersetzen? Das Dial lädt die Datei selbst und startet neu. ` +
                  'Der Einlass ist etwa eine Minute unterbrochen. Dial dabei nicht ausschalten.',
              )
            )
              void start('/api/net/install', { ssid: net.network });
          }}
        >
          <CloudDownload size={18} /> Version {net.latest} installieren
        </button>
      )}
      {net?.phase === 'done' && (
        <p className="hint">Nach dem Neustart lädt diese Seite von selbst neu. Danach bitte wieder anmelden.</p>
      )}
      {error && <p className="banner error">{error}</p>}
    </section>
  );
}
