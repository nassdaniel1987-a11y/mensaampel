import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
// Download and restore of the complete stock including learned values (PC service and Dial).
export function Backup({
  backup,
  restore,
  disabled,
}: {
  backup: () => Promise<void>;
  restore: (file: File) => Promise<boolean>;
  disabled: boolean;
}) {
  const [file, setFile] = useState<File | null>(null),
    [confirm, setConfirm] = useState(false);
  return (
    <div className="backup">
      <div className="action-row">
        <button className="outline" type="button" disabled={disabled} onClick={() => void backup()}>
          <Download size={18} /> Sicherung herunterladen
        </button>
      </div>
      <label>
        Sicherung einspielen
        <input
          type="file"
          accept="application/json,.json"
          onChange={e => {
            setFile(e.target.files?.[0] || null);
            setConfirm(false);
          }}
        />
      </label>
      {file && (
        <>
          <label className="checkbox">
            <input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} /> Aktuellen Bestand,
            Einstellungen und Lernwerte durch „{file.name}“ ersetzen
          </label>
          <button
            type="button"
            disabled={disabled || !confirm}
            onClick={async () => {
              if (await restore(file)) {
                setFile(null);
                setConfirm(false);
              }
            }}
          >
            <Upload size={18} /> Einspielen
          </button>
        </>
      )}
      <p className="hint">
        Enthält Karten, Belegungen, Einstellungen, Messungen, Lernwerte und Tagesberichte – keine Kennwörter. Nach dem
        Einspielen den Bestand prüfen und bestätigen.
      </p>
    </div>
  );
}
