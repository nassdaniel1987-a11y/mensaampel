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
- **Dial-Zeichnen:** `core/dial_raster.hpp` und `src/dial-paint.mjs` nur gemeinsam ändern (reine Beschleunigungen im C++ nur ergebnisgleich, Paritäts- und Bench-Test müssen grün bleiben); Tippfläche des Knopfs in Firmware und `DialDevice.tsx` gleich halten.
- **Internetprüfung der Tablets wird beantwortet** (DNS auf 192.168.4.1, `firmware/src/probes.hpp`), damit Tablets im Dial-WLAN bleiben (Befund 0.17.2). Nicht entfernen; die API bleibt über den Host-Check geschützt.
- **Router-Betrieb (0.18.0):** eigenes WLAN des Dials bleibt Standard; die Rettung (30 s ohne Router → eigenes WLAN zusätzlich an) nie entfernen, sonst ist ein falsch eingestelltes Dial nicht mehr erreichbar.
- **Ruhemodus (0.19.0):** ändert die Ampel nie; Wecken per Ring/Taste/Touch löst keine Aktion aus, eine Karte wird normal gebucht.
- **Keine langen Arbeiten in einem Web-Handler:** der Webserver ist seriell, die Ampel wartet sonst (siehe 0.17.1). Längeres in Runden in `step()` erledigen.
- Keine Anforderungen erneut umsetzen, die in `ENTWICKLUNG.md` schon beschrieben sind; vorher dort und in den Tests suchen.

## Stand (01.10.2026)

- Laufender Plan (Plan 14): 0.12.1 Ampel-Verbindungsanzeige (fertig) → Dial-Design A „Große Zahl + Symbol“ (vom Nutzer gewählt) und Klangsets in 0.13.0 (fertig, am Gerät zu prüfen) → modernes Tablet-Design 0.14.0 (vom Nutzer freigegeben, fertig). Plan 14 ist damit abgeschlossen. Plan 15 (0.15.0): Ampel-Infos + Sprachzeile (Übersetzungen von Muttersprachlern prüfen lassen; seit 0.17.5 auch Japanisch und Chinesisch), Betreuerkarte Lautstärke/Neuer Tag/WLAN, Testdaten löschen – fertig, am Gerät zu prüfen. Plan 16 (Lernen, vom Nutzer freigegeben): 0.16.0 Verweildauer + Wartezeit an der Ampel, Mensa-Assistent, Hinweise zu Karten, Tagesbericht mit Spitzen, Gesundheit heute, freundliches Warten – fertig, am Gerät zu prüfen; 0.17.0 Tagesprognose, Wochen-Coach, Simulator nur im Browser (`src/insights.mjs`, `src/Insights.tsx`) – fertig. Plan 16 ist damit abgeschlossen. Grundsatz: Dial speichert nur kompakte Zahlen, das Tablet rechnet; jedes Tablet sieht dieselben Daten. 0.17.1: Speicher-Dauertest im Hintergrund (vorher „Failed to fetch“ am Gerät) und Geräteprüfung über USB – **Claude Code auf dem PC des Nutzers prüft nach `PRUEFUNG-AM-PC.md`** (Dial hängt per USB am PC). Erste USB-Prüfung am Gerät (0.17.1): Dial gesund (Dauertest ok, Block ≥ 53 KB, kein Absturz); Ampel-Pausen 5–15 s, teils Tablet aus dem WLAN → 0.17.2 begrenztes Senden, Ursachen-Zähler, Anleitung „Ampel-Tablet: WLAN stabil halten“; Zweite Prüfung (0.17.2, Galaxy Tab S10 Ultra): Dial einwandfrei, aber Tablet meldet sich ~jede Minute 11–15 s ab → 0.17.3: Dial beantwortet Internetprüfung (DNS + probes.hpp), WLAN-Ereignisliste, Signalstärke, Samsung/iPad-Einstellungen in der Anleitung; Prüfung wiederholen, sonst WLAN-Kanal wechseln. Im Betrieb später iPads. 0.17.4: bis zu 4 Tablets gleichzeitig angemeldet (vorher warf ein zweites Tablet das erste raus; `firmware/src/sessions.hpp`). 0.17.5: Japanisch/Chinesisch in der Sprachzeile. 0.17.6: flüssigere Dial-Animationen (bis 25 Bilder/s bei Bewegung, schnelleres Zeichnen, Messwert „Bild zeichnen“) – am Gerät zu prüfen. 0.17.7: Tablets laden nach einem Dial-Update die Seite einmal selbst neu (`src/version-check.mjs`). 0.18.0 (Plan 23): WLAN wahlweise über einen eigenen Router ohne Internet (`firmware/src/netconfig.hpp`, Anleitung „Router einrichten“, empfohlen GL.iNet GL-SFT1200 Opal, Dial-Adresse 192.168.8.20, Router-DNS = Dial) – nur gebaut, Nutzer hat noch keinen Router. 0.19.0 (Plan 24): Start-Check, Ruhemodus des Dials, Ampel-Hinweis „bitte leise“ ab 85 % Belegung, Übersicht „Wie sicher ist das Gelernte?“ – nur gebaut. Weitere Ideen des Nutzers noch offen: automatische Sicherung im Dial, Ersatzkarte in einem Schritt, Zeitplan/Ruhemodus, Bericht als Datei.

- Installiert am echten Dial: **0.12.0-preview** (per PC); 0.12.1 soll per Tablet-Update eingespielt werden (erster Test der Update-Funktion). Externe RFID2 Unit, Einstellung „Extern“, WLAN stabil.
- Am Gerät bestätigt: Installation, Speicher, Gerätetest, Einzel-/Serien-Einlernen (10 von 112 Karten zugeordnet), Update-Funktion sichtbar.
- **Offen am Gerät:** Verbindungstest 10 min mit nur einem offenen Tab (Aussetzer sollen 0–2 sein; zuletzt 5 bei zwei offenen Tabs), Speicher-Dauertest-Werte, Update per Tablet einmal ausprobieren, Lesbarkeit der neuen Schrift und flüssiger Countdown-Ring, danach Installationsschritt 8: alle Karten am Stück einlernen, Sicherung, Etiketten drucken, Bestand bestätigen, Probebuchung, ein kompletter Mittag als Probelauf.
- Bekannte Kleinigkeit: Kennwortprüfung beim Anmelden (PBKDF2, ~0,9 s) läuft unter der Sperre.
- Abnahme-Checkliste: `ANLEITUNG-DIAL.md` → „Abnahme am echten Gerät“.
