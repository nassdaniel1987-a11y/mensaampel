# Mensaampel – Einstieg für KI-Assistenten und Entwickler

Zuerst diese Datei lesen, dann `ENTWICKLUNG.md` (Technik und Verlauf je Version) und bei Gerätefragen `ANLEITUNG-DIAL.md`.

## Was das ist

Einlasssystem für eine Schulmensa (Ganztag). Kinder halten eine RFID-Platzkarte (K01–K48 Küche, M01–M64 Mensa) an ein **M5Stack Dial** (ESP32-S3, rundes 240×240-Display, Drehring, Taste, Touch). Das Dial bucht Platz aus/zurück, steuert Gruppen (Startgruppe, automatische Freigabe nach gelernter Zeit) und zeigt Grün/Gelb/Rot. Ein **Tablet vor der Tür** zeigt die Ampel (`/ampel`), ein zweites Tablet dient der Betreuung (Weboberfläche vom Dial, eigenes WLAN des Dials, kein Internet). Daneben gibt es einen **PC-Dienst** (Windows, Node + WebAssembly) und eine **Offline-Demo** (eine HTML-Datei).

## Aufbau (eine Logik, mehrere Hüllen)

| Teil | Ort | Hinweis |
|---|---|---|
| Buchungs- und Ablaufkern (C++17) | `core/engine.hpp`, `core/flow.hpp` | Einzige Buchungslogik. Läuft in Firmware und als WebAssembly (`core/wasm.cpp` → `build/mensa-core.*`). Nie eine zweite Logik in TypeScript bauen. |
| Dial-Bild | `core/dial.hpp` (Zeichenliste, Farben, Umbruch), `core/dial_raster.hpp` (Zeichner), `core/dial_font.hpp` (generiert) | Browser-Kopie `src/dial-paint.mjs` muss pixelgleich bleiben (Test). |
| Firmware | `firmware/src/main.cpp`, `storage.hpp`, `config.hpp`, `card_reader.hpp`, `ota.hpp` | PlatformIO, Umgebungen `mensa-dial` und `dial-core-check`. Tablet-Oberfläche steckt eingebettet in `web_assets.hpp` (generiert). |
| Tablet-Oberfläche | `src/` (React/TS, Vite) | `useMensa.ts` = Verbindung/Abfrage; `DevicePanel.tsx` = Reiter „Gerät“. |
| PC-Dienst | `server/main.mjs`, `server/engine.mjs` | |
| Etiketten-Tool | `tools/etiketten/` → `Etiketten-Tool.html` | |
| Gehäuse | `hardware/gehaeuse/` | Dial mit orangem Schraubring, RFID2 Unit fest eingebaut. |
| Gerätepaket | `Mensaampel_Dial_Vorbereitung/` | Wird bei Änderungen vom Release-Workflow als ZIP veröffentlicht. |

## Arbeitsweise mit dem Nutzer

- **Sprache: Deutsch.** Antworten einfach und konkret; der Nutzer ist kein Programmierer und testet am echten Gerät.
- Entwicklungszweig: `claude/youthful-sagan-v8j6hx`. Nach fertiger Arbeit **committen und pushen** (ausdrücklicher Wunsch). Keine Pull Requests ohne Aufforderung.
- Version an zwei Stellen gleich halten: `firmware/src/version.hpp` und `src/version.mjs` (Test prüft das). Jede Gerätefreigabe: neue Version, Abschnitt „Neu in …“ in `ANLEITUNG-DIAL.md`, Paket neu.
- Vor dem Push alles grün: siehe „Vollständiger Build“. Nichts als „am Gerät getestet“ bezeichnen, was nur gebaut wurde.

## Vollständiger Build (Linux)

```
npm ci
python3 scripts/build-dial-font.py          # nur nach Schriftänderung
EMSDK=<emsdk 4.0.15> EMSDK_PYTHON=python3 npm run build:core
npm run format && npm run format:check      # prettier + clang-format 19.1.7
npx tsc --noEmit && npm test                 # braucht g++ für die nativen Tests
npx vite build && node scripts/embed-web.mjs
node scripts/build-dial-guide.mjs            # Anleitung, Kurzkarte, Hilfe-Bilder, PDFs (Playwright)
EMSDK=… EMSDK_PYTHON=python3 DEMO_OUT=$PWD/Mensaampel_Tablet_Demo.html node scripts/build-demo.mjs
pio run -d firmware -e mensa-dial && pio run -d firmware -e dial-core-check && pio run -d firmware -e mensa-dial -t buildfs
python3 scripts/package-device-linux.py      # aktualisiert Mensaampel_Dial_Vorbereitung/ (pip: markdown)
```

CI (`.github/workflows/ci.yml`) prüft Format, Typen, Tests, Kern-Neubau und Firmware. `release.yml` veröffentlicht bei Änderungen an `Mensaampel_Dial_Vorbereitung/` das Release `v<Version>` (ZIP, Demo, PDFs, Etiketten-Tool, Gehäuse, `Mensaampel-Dial-Update.bin`).

## Nicht kaputt machen (bewusste Entscheidungen)

- **Speicher:** nie automatisch formatieren; beschädigter Bestand → Mensch gleicht ab. Regeln und Stromausfalltest siehe `ENTWICKLUNG.md` „Härtung“. Änderungen an `storage.hpp` immer mit `tests/native-storage.test.mjs` prüfen.
- **Arbeitsspeicher (kein PSRAM):** keine großen JSON-Bäume im Dial (Status/Speichern als Text). `tests/native-memory.test.mjs` hat Obergrenzen.
- **Nebenläufigkeit:** gemeinsamer Zustand nur unter `Guard`; Antworten ohne Sperre senden; I²C (Touch/RTC/Leser) nur unter Sperre.
- **Ampel-Sicherheit:** Ampelseite nach 3 s ohne Antwort rot; Betreuungsseite toleriert 8 s.
- **Kartenleser:** beide Typen (intern/extern) bleiben in der Software; im Betrieb wird extern genutzt, weil der interne das WLAN stört.
- **Bestätigung:** nach Neustart/Restore muss ein Mensch den Bestand bestätigen (außer Neustart am selben Tag nach bestätigtem Bestand).
- **Befehle sind idempotent über `rid`.** Neue Tablet-Aktionen über `send()` schicken.
- **Dial-Zeichnen:** `core/dial_raster.hpp` und `src/dial-paint.mjs` nur gemeinsam ändern; Tippfläche des Knopfs in Firmware und `DialDevice.tsx` gleich halten.
- Keine Anforderungen erneut umsetzen, die in `ENTWICKLUNG.md` schon beschrieben sind; vorher dort und in den Tests suchen.

## Stand (01.10.2026)

- Laufender Plan (Plan 14): 0.12.1 Ampel-Verbindungsanzeige (fertig) → Dial-Design A „Große Zahl + Symbol“ (vom Nutzer gewählt) und Klangsets in 0.13.0 (fertig, am Gerät zu prüfen) → modernes Tablet-Design 0.14.0 (vom Nutzer freigegeben, fertig). Plan 14 ist damit abgeschlossen; offen sind die Prüfungen am Gerät.

- Installiert am echten Dial: **0.12.0-preview** (per PC); 0.12.1 soll per Tablet-Update eingespielt werden (erster Test der Update-Funktion). Externe RFID2 Unit, Einstellung „Extern“, WLAN stabil.
- Am Gerät bestätigt: Installation, Speicher, Gerätetest, Einzel-/Serien-Einlernen (10 von 112 Karten zugeordnet), Update-Funktion sichtbar.
- **Offen am Gerät:** Verbindungstest 10 min mit nur einem offenen Tab (Aussetzer sollen 0–2 sein; zuletzt 5 bei zwei offenen Tabs), Speicher-Dauertest-Werte, Update per Tablet einmal ausprobieren, Lesbarkeit der neuen Schrift und flüssiger Countdown-Ring, danach Installationsschritt 8: alle Karten am Stück einlernen, Sicherung, Etiketten drucken, Bestand bestätigen, Probebuchung, ein kompletter Mittag als Probelauf.
- Bekannte Kleinigkeit: Kennwortprüfung beim Anmelden (PBKDF2, ~0,9 s) läuft unter der Sperre.
- Abnahme-Checkliste: `ANLEITUNG-DIAL.md` → „Abnahme am echten Gerät“.
