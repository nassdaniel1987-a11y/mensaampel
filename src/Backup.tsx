import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
// Download and restore of the complete stock including learned values (PC service and Dial).
// When this browser last downloaded a backup (per device; only for the reminder).
export function lastBackup() {
  try {
    return Number(localStorage.getItem('mensa-letzte-sicherung')) || 0;
  } catch {
    return 0;
  }
}
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
  const last = lastBackup(),
    days = last ? Math.floor((Date.now() - last) / 86400000) : -1;
  return (
    <div className="backup">
      <p className={`backup-age ${days < 0 || days >= 14 ? 'warn' : ''}`} role="status">
        {days < 0
          ? 'Auf diesem Gerät wurde noch keine Sicherung heruntergeladen.'
          : days === 0
            ? 'Letzte Sicherung: heute.'
            : `Letzte Sicherung: vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}.`}
        {(days < 0 || days >= 14) &&
          ' Bitte jetzt sichern – sonst müssten nach einem Defekt alle Karten neu eingelernt werden.'}
      </p>
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
