import { useState } from 'react';
import { Upload } from 'lucide-react';
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
