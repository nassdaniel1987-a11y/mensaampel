# Aufbau und Weiterentwicklung

## Gemeinsame Buchungslogik

`core/engine.hpp` ist der hardwareunabhängige C++17-Kern. Er besitzt den vollständigen Karten- und Raumzustand. Zeitstempel werden als Millisekunden übergeben; der Kern greift weder auf Betriebssystem noch Kartenleser oder Dateisystem zu. `core/ports.hpp` beschreibt die späteren Clock-, Reader- und Storage-Adapter.

PC: `core/wasm.cpp` stellt die JSON-Schnittstelle bereit. Emscripten 4.0.15 erzeugt `build/mensa-core.cjs` und `build/mensa-core.wasm`. Node führt dieses WebAssembly aus. Im Browser existiert keine zweite Buchungslogik und kein eigener verbindlicher Bestand.

`server/main.mjs` serialisiert Änderungen im zentralen Dienst. Der Zustand wird mit Prüfsumme in eine temporäre Datei geschrieben, synchronisiert und atomar umbenannt. Bei Schreibfehlern wird der vorherige Zustand einschließlich Rückgängig-Buchung wiederhergestellt. Die Erfolgsantwort kommt erst danach. Der simulierte kurze Scan umfasst Vorhalten und Entfernen in einer Transaktion; echtes Vorhalten und Entfernen sind getrennte Leserereignisse.

`src` enthält React/TypeScript. Betreuung, Simulation und Ampel verwenden dieselbe Statusschnittstelle. Polling erfolgt alle 700 ms, der Verbindungsstatus wird alle 250 ms geprüft. Nach über drei Sekunden ohne erfolgreiche Aktualisierung wird Rot angezeigt. Mehrere Fenster erhalten denselben zentralen Zustand. Eine Browseranzeige kann nur bei laufendem Browser reagieren; ein eingefrorenes Tablet kann softwareseitig kein neues Warnbild zeichnen.

## Lokal entwickeln

Die vorgebaute Version benötigt nur die mitgelieferte Node-Laufzeit. Für Änderungen an der Oberfläche: Node.js 22+, `npm ci`, dann `npm run build` und `npm start`. Die fertige Anwendung nutzt Port 4317. Nach einem Build den Browser neu laden. Für Serveränderungen den Dienst neu starten.

Automatisierte Prüfung: `npm test` oder ohne zusätzliche Installation `runtime/node.exe --test tests/core.test.mjs tests/server.test.mjs`.

C++ neu bauen: Emscripten 4.0.15 installieren/aktivieren, `EMSDK` auf dessen Verzeichnis und `EMSDK_PYTHON` auf die Python-Datei setzen, dann `npm run build:core`. Anschließend Tests und Frontend-Build ausführen. Die für diese Erstellung installierten Werkzeuge liegen neben dem Projekt unter `work/toolchains`; sie müssen nicht mit der fertigen Anwendung weitergegeben werden.

## Gerätevorbereitung

`firmware/platformio.ini` baut inzwischen die Geräteanwendung `mensa-dial` für ESP32-S3, 8 MB Flash, Arduino und C++17. Eine separate Umgebung `dial-core-check` enthält weiterhin den kleinen Serial-Kerntest. Das Ziel `mensa-dial` ist eine vorbereitete Vorabversion, noch ohne Hardwareabnahme.

Buildfolge aus dem Projektordner:

```
npm ci
npm run build:core
npm test
npm run build
node scripts/embed-web.mjs
pio run -d firmware -e mensa-dial
pio run -d firmware -e mensa-dial -t buildfs
```

Versionen: Espressif32-Platform 6.12.0, Arduino-ESP32 2.0.17, M5Dial 1.0.3, M5Unified 0.2.23, M5GFX 0.2.30. Bei langen Windows-Pfaden kann ein kurzer PlatformIO-Core-Pfad über ein temporäres subst-Laufwerk erforderlich sein.

Implementiert sind Leseradapter mit interner/externer I²C-Auswahl, ein gemeinsamer hardwareunabhängiger Anwesenheitsfilter, monotone Gerätezeit, lokaler WPA-WLAN-Zugangspunkt, eingebettete Browseroberfläche, Kennwortanmeldung, Kartenzuordnung, Dial-Anzeige/Taste/Ton sowie persistente Geräteeinstellungen und Bestandsdateien. `reader_latch.hpp` erfordert drei Abwesenheitsmessungen über mindestens 600 ms; Fehler und ausgeschaltete Felder sind keine Abwesenheit. Es gibt keinen zweiten Buchungskern in TypeScript.

Die Firmware speichert kompakte CBOR-Schnappschüsse mit CRC in zwei wechselnden LittleFS-Dateien. Sie bestätigt Änderungen erst nach Speichern und Zurücklesen. Ungültige Datensätze oder eine übrig gebliebene temporäre Datei erzwingen manuellen Abgleich. LittleFS wird niemals automatisch formatiert. Nach jedem Boot muss der Bestand bestätigt werden; zuletzt gebuchte Karten erhalten konservativ die volle Sperrzeit neu. Undodaten werden nicht über einen Geräte-Neustart erhalten.

Zugriff: `/api/info` und `/api/signal` sind öffentlich, `/api/state`, `/api/command` und `/api/backup` benötigen ein Sitzungstoken. Betreuungssitzung: acht Stunden, eine aktive Anmeldung. Kennwort: PBKDF2-HMAC-SHA256 mit Salt, 10.000 Iterationen; fünf Fehlversuche lösen eine 30-sekündige Wartezeit aus. Es handelt sich um ein lokales HTTP-Webinterface im geschützten Geräte-WLAN, nicht um einen Internetdienst. Ein neuer Einrichtungscode lässt sich nur mit Bestätigung an der Gerätetaste erzeugen.

Der Windows-Übertragungshelfer ist `scripts/installer.ps1`. `scripts/flash_tool.py` verpackt das unveränderte esptool 4.9.0 mit PyInstaller 6.16.0. Für einen Neubau diese Versionen samt pyserial installieren und `python -m PyInstaller --onefile --name mensa-flash --collect-all esptool scripts/flash_tool.py` verwenden. Das Paketskript `scripts/package-device.py` verwendet die dokumentierten lokalen Buildordner unter `work`, erzeugt ein vollständiges Erstinstallationsimage und prüft Hashes und ZIP. Es überträgt nichts auf Hardware. Ein Update liest vor dem Schreiben die Partitionstabelle aus und lehnt Abweichungen ab. Die Erstinstallation erfordert ausdrücklich bestätigtes Löschen.

Am Gerät noch zu prüfen: reale UID-Erkennung, Feldentfernung und Funkfehler; I²C bei beiden Leserarten; Dauerlast mit WLAN; Heap-Spitzen mit 112 Karten und Tablet; LittleFS einschließlich Stromausfall; Display und Taste; Erstinstallation und Update. Ein erfolgreicher Build belegt ausschließlich die Übersetzbarkeit.

### RFID und WLAN: offener Hardwareprüfpunkt

M5Stack dokumentiert WLAN mit 2,4 GHz und einen separaten WS1850S-Kartenleser mit 13,56 MHz. Im Herstellerforum gibt es jedoch Ersthandberichte über WLAN-Verbindungsprobleme bei aktiviertem RFID und den Vorschlag, das RFID-Feld zeitweise auszuschalten. Für Dial v1.1 ist damit weder ein generelles Verbot gleichzeitigen Betriebs noch eine zuverlässige Abhilfe nachgewiesen. Das aktuelle Herstellerbeispiel für v1.1 enthält Netzwerk und NFC zusammen. Quellen: [Datenblatt](https://docs.m5stack.com/en/core/M5Dial%20V1.1), [Erfahrungsbericht](https://community.m5stack.com/topic/6628/m5dial-wifi-not-work-when-rfid-is-enabled), [Herstellerbeispiel](https://docs.m5stack.com/en/homeassistant/devices/dial).

Vor Freigabe der Geräteversion: Access-Point-Betrieb mit dauerhaft verbundenem Tablet und vielen Scans gleichzeitig testen. Keine pauschale WLAN/RFID-Umschaltung einbauen. Falls ein getaktetes RFID-Feld erforderlich ist, darf eine absichtliche Lesepause kein Entfernen-Ereignis erzeugen. Eine bereits erkannte Karte bleibt logisch vorgehalten, bis ihr tatsächliches Fehlen bei aktivem Leser bestätigt wurde. WLAN-Abschalten darf keine normale Betriebsstrategie der Tabletampel sein. Bei unzureichender Zuverlässigkeit muss die Geräteanbindung angepasst werden; der Buchungskern bleibt verwendbar.

## Prüfung am 24.09.2026

23 automatisierte Tests bestehen (einschließlich Hardware-Kartenzuordnung, Neustart-Sperre und Leser-Anwesenheitsfilter): Ausgabe/Rückgabe, getrennte Räume, exakte Sperrzeitgrenze, gehaltene Karten, ausbleibende verzögerte Buchung, volle Räume, Teilfreigabe, Pause, Rückgabe bei Raumsperre, Verlust, unbekannte Karten, Einlernen, Korrektur, Rückgängig, Kapazitätsvalidierung, Ereignislimit, Speicherung, echter Neustart, beschädigte Dateien, Schreibfehler, gemeinsame HTTP-Zustände, Zugriffsschutz und ungültige URLs.

Frontend-Produktionsbuild und Typprüfung bestehen. ESP32-S3-Build erfolgreich: 1260329 Bytes Flash, 50100 Bytes statischer RAM; dynamischer Speicherbedarf ist damit noch nicht auf Hardware nachgewiesen.

Die visuelle Umsetzung übernimmt aus dem Entwurf die ruhige blaugrüne Farbgebung, große Raumzahlen, getrennte Ampelspalte und Kartentabelle. Funktional ergänzt wurden Startbestätigung, Einstellungen, echte Kartenpagination und Simulation. Browserprüfungen umfassen Ausgabe/Rückgabe, Sperrzeit, synchronisierte Einlasspause und Rotanzeige bei Verbindungsunterbrechung.

Die Geräteoberfläche wurde zusätzlich mit einer lokalen API-Testvorschau geprüft: Anmeldung, Leserwechsel, Einlernen und Zuordnen, Desktop und 390-Pixel-Ansicht. Diese Vorschau emuliert weder Funk noch Flash oder ESP32-Zeitverhalten. Der USB-Helfer wurde ohne Gerät gestartet, seine Portabfrage sowie Paketprüfung funktionieren. Die native Windows-Dialogbedienung und die reale Übertragung wurden noch nicht am Gerät geprüft.

## Erweiterung 0.3.0: Einlass und Messungen

`core/flow.hpp` enthält die gemeinsame Gruppensteuerung und begrenzte Messhistorie. Snapshot-Schema 1 erhält das optionale Feld `flow`; ältere Bestände ohne dieses Feld werden mit Gruppenlimit 0 und Gelbgrenze 5 übernommen. Aktive Messungen werden beim realen oder simulierten Neustart verworfen. Fertige Messwerte bleiben gespeichert. Die 120 Datensätze enthalten ausschließlich Zahlen, nach Abschluss keine Kartenkennung. Statistische Hinweise verwenden dieselbe Schlangenklasse, Gruppengröße, Wochentag und Startzeit im selben 15-Minuten-Intervall; mindestens drei Werte. Keine automatische Wiederöffnung oder Anpassung der Gruppengröße.

`FlowPanel.tsx` ist in PC, Gerät und Offline-Demo identisch eingebunden. Die Geräte-Uhrzeit für Messungen wird ausdrücklich vom Tablet übernommen und mit der monotonen Zeit fortgeschrieben; nach Boot oder Tageswechsel neu abgleichen. Gruppen- und Messzustand gehören zur atomaren Buchungstransaktion. Undo öffnet einen bereits geschlossenen Gruppeneinlass nicht automatisch.

32 automatisierte Tests bestanden, darunter Messbeginn, Messabschluss, Gruppenlimit, Gelb, Neustart, alte Snapshots, korrupte Werte, 120-Datensatz-Limit und Speicherfehler-Rollback. Browserprüfung: gelbe Ampel, Zweiergruppe mit automatischem Rot, Abschluss der Gruppenmessung, Tabellenwert und responsive Ansicht. Reale Hardwareprüfung bleibt offen.

## Erweiterung 0.4.0-preview

Entlastung als eigener persistierter Stoppgrund, Touchfläche am Dial, explizites Fortsetzen über vorhandene Pausebedienung. Protokollierte Dauer im begrenzten Ereignisprotokoll; nach Neustart Dauer unbekannt. Rückgaben bleiben möglich. Gruppenrestzahl am Dial durch verfügbare Plätze begrenzt.

Zweistufige Empfehlungen: mindestens drei gleiche Gruppengröße/Schlange über alle Zeiten, danach mindestens drei gleiche Wochentag/15-Minuten-Fenster bevorzugt. Gruppe bindet Schlangensituation beim ersten Einlass. Keine automatische Öffnung. Großampel mit kräftiger Vollfläche, dunkler Schrift und Symbolen.

36 automatisierte Tests bestanden, TypeScript und Produktionsbuild erfolgreich. Neue Tests für Entlastung/Rückgaben/Neustart, Speicherrollback, breite/exakte Empfehlungen und alte Speicherstände. Echte Dial-Touchbedienung und Funkbetrieb bleiben am Gerät zu prüfen.

## Version 0.5.0-preview: Erprobung nur im Dial-Paket

Festgelegter Prüfvorschlag nach längster passender Gruppenzeit plus Puffer, mindestens Puffer nach letztem Einlassscan. Bewertungen einmal pro Gruppe, getrennte begrenzte Historie (120), CSV-Export. Keine automatische Öffnung oder Parameteranpassung. Rückmeldungen beeinflussen Messmittelwerte nicht. Gemeinsamer Kern lokal getestet; Demo-HTML und PC-Auslieferung nicht neu erstellt.

## Erweiterung 0.6.0-preview: Automatik und Dial-Simulation

**Automatik** (`core/flow.hpp`): neue Snapshot-Felder `autoOn`, `autoStart`, `autoGlobal`, `autoGlobalN`, `autoSlots` (`[Wochentag, Halbstunde, Zehntelsekunden pro Kind, Anzahl]`, max. 336), `releaseAt`, `autoReleased`, `autoComplaint`, `autoFaster`, `autoSlower`; ältere Stände ohne diese Felder laden weiter und übernehmen ihre Gruppenmessungen. Neue Befehle `autoSettings` (`on`, `start` in Sekunden, optional `reset`) und `tick`. `tick` plant die Freigabe beziehungsweise gibt frei und meldet `changed`; Server, Demo und Firmware speichern nur bei Änderung. `Engine::autoDue(now)` verhindert unnötige Flash-Schreibvorgänge am Gerät. Lernregeln siehe `EINLASS-UND-MESSUNGEN.md`.

**Dial-Anzeige** (`core/dial.hpp`, `Engine::dialScreen`): Der Hauptbildschirm entsteht als Zeichenliste (Kreis, abgerundetes Rechteck, Text mit RGB565-Farben) im gemeinsamen Kern. Seit 0.11 zeichnet ein eigener, kantengeglätteter Rasterer (`core/dial_raster.hpp`, nur Ganzzahlrechnung, 4×4 Abtastungen pro Randpixel) die Liste in Streifen; `src/dial-paint.mjs` ist eine exakte JS-Kopie davon, `tests/dial-raster.test.mjs` vergleicht beide Bild für Bild (nativ mit g++). Schrift: Inter in vier Größen als 4-Bit-Alpha-Glyphen (`core/dial_font.hpp`, `src/dial-font.mjs`, erzeugt mit `python3 scripts/build-dial-font.py`, danach `npm run format`). Texte sind UTF-8 mit Umlauten; Umbruch und Kürzung („…“) nach echter Pixelbreite. WASM-Operation `dial` mit `blocked`, `hint`, `feedback`, `feedbackOk`. PC-Server und Demo liefern `dial` und `feedback` im Status und lösen `tick` alle 500 ms bzw. 200 ms aus.

**Firmware:** RTC (`M5.Rtc`) wird über `measurementContext` mit Feld `date` gestellt und liefert danach Wochentag/Uhrzeit, wenn keine gültige Zeit vorliegt. Build: 1312557 Bytes Flash (41,7 %), 50324 Bytes statischer RAM. Partitionstabelle unverändert, Update behält LittleFS.

**Installationshelfer:** Espressif-Ports (USB-VID 0x303A) werden markiert und vorausgewählt; fehlt `mensa-flash.exe` oder stimmt seine Prüfsumme nicht, erscheint ein Hinweis auf Virenschutz/IT statt „Datei beschädigt“.

**Werkzeuge in dieser Umgebung:** Emscripten 4.0.15 über emsdk (`EMSDK`, `EMSDK_PYTHON=python3`), PlatformIO per pip. `scripts/build-demo.mjs` schreibt nach `DEMO_OUT` (Standard `../outputs/…`).

48 automatisierte Tests bestehen (neu `tests/auto.test.mjs`: Freigabe nach gelernter Zeit, Taste im Countdown, Entlasten, Sperrgründe, Halbstundenwerte, alte Stände, Dial-Anzeige, PC-Zeitgeber). Browserprüfung der Dial-Simulation mit Touchfläche, Taste und Countdown. Nicht geprüft: echtes Dial, Touch-Treffgenauigkeit, RTC-Gangreserve, Installationshelfer unter Windows.

## Erweiterung 0.7.0-preview: Startgruppe, Dial-Bedienung, Tagesbericht

**Kern:** neue Flow-Felder `startSize`, `sizeMin`, `sizeMax`, `idleMinutes`, `dayStart`, `startLearned`, `sizeGlobal`, `groupTarget`, `groupIsStart`, `lastGroupStart`, `lastEntry`, `lastScan`, `dayWeekday`, `today` und `history` (je 12 Zahlen, max. 60 Tage); `autoSlots` haben einen 5. Wert (gelernte Gruppengröße), 4-stellige Einträge aus 0.6 laden weiter. `waiting` bezieht sich auf `groupTarget`. Takt: `releaseAt = groupAt + normalSize × perChild`. `tick` startet zusätzlich den automatischen Essenstag (`Engine::startDay`, `ready` bleibt unverändert). Neue Befehle `dialPress`, `dialHold`, `dialTurn` (Mensa-Einstellmodus flüchtig, `changed:false`). `signal(now)` liefert `releaseIn`, `status` liefert `outCards`, `cardsMissing`, `mensaEdit`.

**PC-Server:** speichert nur bei `changed !== false`; `/api/backup` und `/api/restore` (bis 500 KB); Ampel-Überwachung über Abrufe von `/api/signal`. **Firmware:** Drehgeber aktiv (4 Zählimpulse je Raste, am Gerät prüfen), 3 s Halten → `dialHold`, sonst WLAN-Anzeige; `/api/restore` bis 64 KB; Hinweis „Ampel draussen getrennt!“. Build 1332245 Bytes Flash (42,4 %). **Start:** `scripts/start.ps1` nutzt ohne `runtime/node.exe` ein installiertes Node.js ≥ 22. `.gitignore` enthält `build/` und `dist/` nicht mehr, da beide eingecheckt sind.

53 automatisierte Tests bestehen (neu: Startgruppe/Takt, Größenlernen, automatischer Essenstag, Dial-Halten/Drehring, fehlende Karten, Sicherung einspielen, Ampel-Überwachung). Nicht geprüft: echtes Dial (Drehrichtung und Rasten, Touch, RTC), Installationshelfer und Startdatei unter Windows.

## Erweiterung 0.8.0-preview: Lesbares Dial, bebilderte Anleitung, Absicherung

**Dial-Anzeige:** neue Zeichenbefehle `["f",Farbe]` (Vollfläche) und `["a",cx,cy,r0,r1,Grad0,Grad1,Farbe]` (Bogen, Firmware `fillArc`, 0° = rechts, im Uhrzeigersinn). Hintergrund in Signalfarbe, Titel Größe 3, Hauptzeile und Räume Größe 2, Hinweise im schwarzen Feld, schwarzer Countdown-Ring (`Flow::releaseFrom`, `releaseShare`). Sonderbildschirme WLAN/Reset/defekt über `DialExtras.screen`. Die Firmware zeichnet nur noch die Liste, in einen Sprite (240×240, 16 Bit), wenn ausreichend Heap frei ist, und nur bei Änderung. Test prüft alle Texte aller Bildschirme gegen die runde Anzeige.

**Anleitung:** `scripts/build-dial-guide.mjs` spielt die Situationen mit dem echten Kern durch und erzeugt `src/dial-screens.json` (Hilfe-Reiter `src/Help.tsx`), `docs/dial/*.png`, `BEDIENUNG-DIAL.html`, `DIAL-KURZKARTE.html` und mit Playwright die PDFs. Zeichnen gemeinsam in `src/dial-paint.mjs` (Schrift `src/dial-font.mjs`). Nach Änderungen an Texten oder Layout: Skript erneut ausführen, danach Frontend bauen und `embed-web.mjs`.

**Absicherung:** `dayDue` erst 30 Minuten nach dem letzten Scan; Befehl `clockSync` stellt nur die Uhr (Firmware zusätzlich RTC), die angemeldete Betreuung auf dem Gerät gleicht ab 2 Minuten Abweichung still ab. `volume` 0–10 im Befehl `settings` (Firmware `setVolume(volume*25)`). Große Ampel: optionaler Gong beim Wechsel auf Grün.

**CI:** `.github/workflows/ci.yml` (TypeScript, Tests, Vite, Kern-Neubau mit Emscripten 4.0.15 und erneute Tests, PlatformIO für beide Umgebungen). `release.yml` packt `Mensaampel_Dial_Vorbereitung/` selbst zur ZIP und veröffentlicht sie mit Demo und PDFs; die ZIP liegt nicht mehr im Repo. Build: 42,9 % Flash. 54 automatisierte Tests.

## Erweiterung 0.9.0-preview: Inbetriebnahme und Alltag

**Leser:** `reader` kennt zusätzlich `auto` (neuer Standard). `CardReader` prüft Port A beim Start und alle 5 s (bei Störung jede Sekunde), solange keine Karte aufliegt, und wechselt über `redetect()`; `main.cpp` löst dann `remove` aus und meldet `reader.change`. `device.readerActive` zeigt den aktiven Leser.

**Kern:** flüchtige Zustände `seriesRoom/seriesLabel` (Befehle `seriesStart`, `seriesStop`; Scans verknüpfen statt buchen), Betreuermenü `menuSel/menuUntil` (Scan einer Karte aus `staff` öffnet/schließt, `dialTurn`/`dialPress`/`dialHold` bedienen es), `staffLearning` (`staffLearn`, `staffClear`). `staff` wird gespeichert. `wantsHold(now)` sagt der Firmware, wann 3 s Halten an den Kern geht. Tagesbericht mit 13. Wert (Zehntelsekunden pro Kind am Tagesende); 12er-Zeilen laden weiter. `DialExtras.screen="test"` mit `lines`.

**Gerätetest:** Firmware- bzw. Serverbefehl `deviceTest {on}`; Scans, Drehring, Taste und Touch werden nur angezeigt. **Etiketten:** Quellen in `tools/etiketten/` (Bogenmaße `layout.mjs`, Motive `motive.mjs`, Etikett als SVG in mm `render.mjs`, Oberfläche `app.mjs`); `node scripts/build-label-tool.mjs` baut daraus die Offline-Datei `Etiketten-Tool.html`, Tests in `tests/label-tool.test.mjs`. **Diagramme:** `src/Charts.tsx` (SVG, Farbwerte geprüft mit dem Palette-Validator, Tabelle als barrierefreie Ansicht).


## Erweiterung 0.10.0-preview: Robuster Alltag

**Version** an einer Stelle je Welt: `firmware/src/version.hpp` (`MENSA_VERSION`) und `src/version.mjs` (PC-Dienst, Demo, Anleitung); ein Test prüft, dass beide gleich sind. Das Paketskript liest die Version aus `version.hpp`.

**Uhr und Datum:** `clockSync`/`measurementContext` nehmen optional `date: [Jahr, Monat, Tag, Stunde, Minute, Sekunde]`. `Flow` speichert daraus `date` (Tage seit 1970) und `secondAt`; `wall(now)` liefert Wandzeit-Sekunden. `dayDate` ersetzt beim Tagesvergleich den Wochentag (ohne Datum weiter über `dayWeekday`). Firmware und PC-Dienst stellen die Uhr jetzt auch bei laufender Gruppe (`clockSync` statt `measurementContext`). Die Ampel-Seite schickt `?clock=[…]` an `/api/signal`, solange die Antwort `clockValid: false` meldet; die Firmware übernimmt das nur ohne gültige RTC.

**Tagesstart:** `dayBase` (Uhr gültig, anderer Tag, Startminute erreicht, 30 min ohne Scan) → `dayDue` nur ohne ausgegebene Karten, sonst `dayWaiting` (Dial: „Neuer Tag? Taste 3 s halten“, `wantsHold` → `dialHold` startet den Tag von Hand). `startDay` sperrt ausgegebene Karten als `lost`; ein Scan einer verlorenen, nicht ausgegebenen Karte gibt sie frei. Automatische Starts ohne einen einzigen Einlass schließen keinen Tagesbericht ab. Nach `rebootClock`/`restart` gilt `lastScan = now`, wenn Karten draußen sind.

**Neustart:** `readyDate` (gespeichert) merkt den Bestätigungstag; `rebootClock` setzt `resumeDate`, und der erste Uhrabgleich mit demselben Datum bestätigt wieder. `restart` (ausdrücklich) verwirft das. Ein laufender Countdown wird als `releaseWall`/`releaseSpan` gespeichert und nach dem Uhrabgleich mit der Restzeit fortgesetzt.

**Bedienung:** `dialTurn` öffnet die Mensa-Einstellung erst ab |2| Rasten innerhalb 1,5 s (`turnAcc`, Hinweis „Mensa: weiter drehen“); `dialPress` bis 500 ms nach einer Drehung wird ignoriert. `relief` in Menü, Serie oder Mensa-Einstellung wirkt wie `dialPress`. `DialExtras.holdMs` zeichnet den Halte-Fortschrittsring. Zurücksetzen braucht ein zweites 3-s-Halten; ein kurzer Druck schließt die WLAN-Anzeige. `needsAttention`/`attentionAt` (im Wrapper `command()` gepflegt) und `remind` (Minuten, 0 = aus, Befehl `settings`) ergeben `reminders(now)`; die Firmware piept bei jedem neuen Wert.

**Gerät:** `DeviceConfig.channel` (1/6/11, `deviceSettings.channel`). Ampel-Warnung auch, wenn sich 60 s nach der Bestätigung noch nie eine Ampel gemeldet hat.

## Inbetriebnahme am echten Dial (0.10.1–0.10.5): Erkenntnisse

Diese Punkte wurden am echten M5Stack Dial gefunden und behoben. Nicht rückgängig machen:

- **Kein PSRAM, ~320 KB RAM:** Große JSON-Bäume (nlohmann) zerstückeln den Heap und führten zu Neustarts beim Anmelden und Speichern. Deshalb: Kartenliste als Text (`Engine::cardsText`, `snapshot(false)`), Speichern als JSON-Text (Format v2, CBOR v1 wird noch gelesen) mit Byte-Vergleich statt Zurücklesen in einen Baum, `cardState()` statt `snapshot()` für Einzelabfragen. Spitzen misst `tests/native/memory.cpp` (`tests/native-memory.test.mjs`) mit vollem Bestand.
- **Interner RFID-Leser des Dial stört das WLAN** (Verbindungsabbrüche). Mit der externen RFID2 Unit (Port A, Einstellung „Extern“) ist das WLAN stabil. Die externe Unit ist im Gehäuse fest verbaut; die Software behält trotzdem beide Lesertypen (keine Software-Festlegung, Wunsch des Nutzers).
- **LittleFS-Partition heißt `littlefs`** (`partitions.csv`): `LittleFS.begin(false, "/littlefs", 10, "littlefs")`, sonst „Gerätespeicher nicht lesbar“.
- **Safari öffnet leere Vorab-Verbindungen;** der Arduino-WebServer wartete bis zu 5 s darauf. `MensaWebServer` verwirft leere Verbindungen (>30 ms wenn ein anderer Client wartet, sonst >1,5 s).
- **Webserver als eigene FreeRTOS-Aufgabe** (`webTask`, Core 1, 20 KB Stack) mit rekursivem Mutex `stateLock`/`Guard`. Alles, was Engine, Konfiguration oder gemeinsame Felder anfasst, läuft unter `Guard` (Web-Handler über `guarded()`, im Loop `step()` und `buildScreen()`, ebenso `M5Dial.update()` wegen des gemeinsamen I²C-Busses und `ESP.restart()`). Antworten werden unter der Sperre gebaut (`replyBody` → `pending`) und **ohne** Sperre gesendet (`sendPending`).
- **Tablet-Abfrage im Gerätemodus:** alle 1,5 s, Zeitlimit 5 s, ein sofortiger Wiederholversuch, „Verbindung unterbrochen“ erst nach 8 s (Ampelseite bleibt bei 3 s → Rot). Karten nur bei Änderung (`/api/state?cards=<rev>`, `cardsRev`, `src/state-merge.mjs`); `dataRev` startet nach jedem Boot zufällig. Diagnose unter Gerät: letzte Antwortzeit, Aussetzer, `webMaxMs`.
- **Windows-Installer:** `Start-Process … -PassThru` liefert ohne `$null=$process.Handle` keinen ExitCode (`scripts/installer.ps1`).
- **Sperrzeit** Standard 3 s mit Live-Countdown am Dial (`lockLabel/lockUntil`); eingelernte Karten sind sofort nutzbar. Bereits eingerichtete Geräte behalten ihren gespeicherten Wert.
- **Karten lösen/löschen:** `unbind {uid}` (Nummer bleibt, `sim:<Nummer>`, gesperrt), `removeSlot {label}` (nur Nummer ohne Karte, nicht ausgegeben).

## Härtung (nach 0.10.5)

- **Speicher stromausfallsicher** (`firmware/src/storage.hpp`, Regeln im Kopfkommentar von `load`): Der neueste gültige Slot ist immer der zuletzt gemeldete Stand; ein übriges `book.tmp` wird verworfen (kein Abgleich nötig). Ein beschädigter Slot verlangt immer einen Menschen. Der manuelle Abgleich schreibt zuerst `/reconcile.flag`, legt die alten Dateien als `review*` (ältere als `reviewold*`) ab, speichert und löscht die Marke zuletzt – eine Unterbrechung führt immer zurück zum Abgleich, nie zu leerem Bestand, und er ist beliebig oft wiederholbar. Speicher-Wächter nach tatsächlicher Textgröße. **Test:** `tests/native/storage.cpp` mit simuliertem Flash (`tests/native/shim/LittleFS.h`) schneidet den Strom nach jedem einzelnen Schreibschritt (Buchung, Abgleich, Erststart; mit und ohne ersetzendes `rename`).
- **Kern:** `command(cmd, now, const Engine *saved)` – der Aufrufer (Firmware `transact`) macht die einzige Sicherungskopie; ein abgewiesener Scan wird vollständig zurückgerollt (nur `held` bleibt). `requireConfirmation()` nach Restore. `undo` stellt Gruppenzähler zurück (`Flow::undoAdmission/undoReturn`). Betreuerkarten lassen sich nicht als Kinderkarte binden.
- **Befehls-Kennung `rid`:** das Tablet schickt jede Aktion mit Zufallskennung und wiederholt nach Netzfehler einmal mit derselben; Dial (`recentCommands`) und PC-Dienst (`recent`) antworten auf eine bekannte Kennung aus dem Gedächtnis, statt erneut auszuführen.
- Gerätetest schaltet die Ampel rot (`signalBlocked()`); `bad_alloc` in Handlern/Loop führt zu einer Meldung statt Absturz.

## Version 0.11.0-preview: Neues Dial-Aussehen

- **Rasterer:** `core/dial_raster.hpp` zeichnet die Zeichenliste kantengeglättet (Ganzzahl, 4×4 Abtastung an Kanten) in einen statischen 240×48-Streifenpuffer (`strip` in `main.cpp`, `pushImage` als `swap565`). `src/dial-paint.mjs` ist eine **exakte** JS-Kopie; `tests/dial-raster.test.mjs` vergleicht beide per Hash für alle Anleitungsbildschirme. Wer eins ändert, muss das andere identisch ändern.
- **Schrift:** Inter (OFL, `vendor/fonts/`), Größen 1–4 = 15/20/27/52 px, 4-Bit-Alpha. Erzeugen: `python3 scripts/build-dial-font.py`, danach `npm run format` (clang-format formatiert `core/dial_font.hpp`). Größen 3 und 4 enthalten nur Großbuchstaben/Ziffern. Texte sind UTF-8 mit Umlauten; Umbruch/Kürzung nach Pixelbreite (`dial::wrap`, `fit`, `span`).
- **Layout** (`Engine::dialBase`): Tastenhinweis oben (y=28), Status (y=58, Größe 3), Hauptzeile (89), Bestand „K · M“ (113), Knopf-Pille (30,131,180,38) – **Tippfläche** in Firmware (`touch.y 131..169`) und `src/DialDevice.tsx` passend –, Info-Pille (30,175,180,36). Farben in `core/dial.hpp` (`green 0x1407`, `yellow 0xFE62`, `red 0xD924`, …).
- Nach Layout-/Textänderungen: `npm run build:core`, `node scripts/build-dial-guide.mjs`, Frontend bauen, `node scripts/embed-web.mjs`.

## Version 0.12.0-preview: Update über das Dial-WLAN

- `POST /api/update` (Multipart, Upload-Handler `receiveUpdate`) schreibt mit `Update.h` in den freien App-Slot (`partitions.csv`: app0/app1 je 3 MB). Geprüft: angemeldet, erstes Byte `0xE9`, Kennmarke `MENSAAMPEL-FIRMWARE-1:<Version>` (`firmwareMark` in `main.cpp`, Suche über Blockgrenzen in `firmware/src/ota.hpp`; das Suchmuster steht absichtlich mit `#` im Code, damit es sich nicht selbst findet), Image-Prüfsumme (`Update.end`). Upload ohne Zustandssperre; `ota.active` blockiert den Einlass, hängt der Upload 30 s, wird er verworfen.
- **Rückfall:** NVS-Namensraum `ota` (`pending`, `tries`, `prev`). `otaBootCheck()` am Anfang von `setup()`: nach drei Starts ohne „gesund“ (60 s, Webserver läuft → `otaHealthy`) zurück auf den vorherigen Slot.
- Tablet: `src/FirmwareUpdate.tsx` (nur Gerätemodus, Reiter Gerät unten), Dateiprüfung `src/firmware-file.mjs`, Upload per XHR mit Fortschritt (`useMensa.updateFirmware`). Release-Asset `Mensaampel-Dial-Update.bin` (= `firmware.bin`).
- Die erste Installation einer Version mit Update-Funktion braucht den PC; danach geht jedes Update per Tablet.

## Version 0.13.0-preview: Dial-Design „Große Zahl + Symbol“, Klangsets

- Rasterer-Erweiterungen (C++ und JS, Paritätstest): `["g",c1,c2,kind]` Verlauf mit 4×4-Dither (vertikal/radial), `["l",x0,y0,x1,y1,w,c]` Linie mit runden Enden, optionales Alpha (9. Wert) bei `"a"`, Schriftgröße 5 (Inter Display Bold 84 px, nur Ziffern und `:`/`/`).
- `core/dial.hpp`: Töne `toneGreen/Red/Amber/Dark` (Mitte/Rand), Symbole `iconCheck/Cross/Pause/Alert`. Layout in `Engine::dialBase` (Kopfkommentar): Tastenhinweis 26, Symbol ~47, große Zahl 104, Beschriftung 148, Infozeile/Hinweis-Pille 172, Knopf 188–216 (**Tippfläche** Firmware `touch.x 44..196, y 182..222`, `src/DialDevice.tsx`). Große Zahl: Rest der laufenden Gruppe, sonst freie Plätze; Countdown als Zeit; Rückmeldung als Vollbild-Moment (Symbol in weißer Scheibe, erster Satz groß).
- Entwurf B („Leuchtring“) wurde verworfen; die Entwurfsbilder entstanden mit demselben Zeichner.
- **Klänge:** `core/sounds.hpp` (Tabelle Set × Ereignis × Noten; Ereignisse Ausgabe, Rückgabe, abgewiesen, Hinweis, Erinnerung, Menü). Der Dial-Lautsprecher ist ein Summer (`spk_cfg.buzzer = true`, 1 Bit) – Wellenform nicht formbar, daher Melodien im Bereich 1,5–3,5 kHz. Firmware spielt Note für Note nicht blockierend (`play`/`playTick` in `step`), `note(text, ok, event)`. Einstellung `sound` (0–3, Standard 1) im Kern gespeichert, Befehl `settings.sound`; `soundTest {set}` spielt Ausgabe/Rückgabe/Abweisung vor. Tablet: `src/sounds.mjs` (gleiche Tabelle, WebAudio-Rechteck für PC/Demo), Test `tests/sounds.test.mjs` vergleicht mit dem Kern (WASM-Operation `sounds`).

## Version 0.14.0-preview: Tablet-Design

- `src/style.css`: Abschnitt „Design 0.14“ am Dateiende überschreibt die Grundregeln (Tokens `--surface`, `--accent-soft`, `--radius`, `--shadow`; Karten, Knöpfe, Eingaben, Kopfzeile mit Unschärfe, Navigation als Pillen). Neue Regeln dort ergänzen statt in den alten Blöcken (dort gibt es noch ältere `!important`-Regeln der Ampelseite).
- Schrift: `src/fonts/inter-var.woff2` (Inter Variable, Teilmenge Latin-1 + Typografie, 58 KB, erzeugt mit `pyftsubset … --flavor=woff2`). MIME `font/woff2` in `scripts/embed-web.mjs` und `server/main.mjs`; die Demo bettet sie als data-URL ein (`build-demo.mjs`, esbuild-Loader).
- Ampelseite `src/Signal.tsx`: Symbol in `.signal-disc` mit SVG-Ring `.signal-ring` (Anteil = Restzeit / längste gesehene Restzeit dieses Countdowns), große Restzeit `.signal-time`, Klasse `counting`.
