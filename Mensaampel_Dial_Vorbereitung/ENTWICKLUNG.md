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
- Schrift: `src/fonts/inter-var.woff2` (Inter Variable, Teilmenge Latin-1 + Latin Extended-A (Türkisch ğ, ş, ı in der Sprachzeile) + Typografie, 66 KB, erzeugt mit `pyftsubset InterVariable.ttf --unicodes="U+0020-007E,U+00A0-00AC,U+00AE-00FF,U+0100-017F,U+2013-2014,U+2018-201E,U+2022,U+2026,U+20AC,U+2190-2193,U+2713" --flavor=woff2`). MIME `font/woff2` in `scripts/embed-web.mjs` und `server/main.mjs`; die Demo bettet sie als data-URL ein (`build-demo.mjs`, esbuild-Loader).
- Ampelseite `src/Signal.tsx`: Symbol in `.signal-disc` mit SVG-Ring `.signal-ring` (Anteil = Restzeit / längste gesehene Restzeit dieses Countdowns), große Restzeit `.signal-time`, Klasse `counting`.

## Version 0.15.0-preview: Ampel-Infos, Betreuerkarte, Testdaten löschen

- `Engine::signal` liefert zusätzlich `groupLeft` (-1 ohne Gruppe/voll), `kitchenFree`, `mensaFree`, `mensaOpen`. Ampelseite (`src/Signal.tsx`): Uhr (Tablet-Zeit), Raum-Chips, „Noch X Kinder“, Sprachzeile aus `src/ampel-texts.mjs` (wechselt alle 4 s; Arabisch `dir=rtl`; Inter hat nur Latein, Arabisch/Kyrillisch kommen aus der Systemschrift). Test `tests/ampel-texts.test.mjs`.
- Betreuermenü (`menuItems`): `volume` → `volumeEdit` (Ring 0–10, Antwort `previewVolume`, Firmware spielt Probe), `newday` → `dayConfirmUntil` (10 s, Taste = `startDay(now,false)`, Drehen/Halten bricht ab), `wifi` → Antwort `action: "wifi"`, Firmware `dialResult()` setzt `showCredentialsUntil`. `relief` (Tippfläche) wirkt in diesen Zuständen wie die Taste; `wantsHold` schließt sie ein.
- `clearData {confirmed, history, events, measurements, learned}`; `Flow::forgetLearned()` (auch von `autoSettings.reset` genutzt). Tablet: Abschnitt „Testdaten löschen“ in `src/FlowPanel.tsx`.

## Version 0.16.0-preview: Lernen, Hinweise, Gesundheit (Plan 16, Teil 1)

Grundsatz: Das Dial speichert nur kompakte Zahlen; Auswertungen (Prognose, Coach, Simulator, ab 0.17) rechnet das Tablet aus `status()`. Alle Daten liegen im Dial, jedes Tablet sieht dasselbe.

- **Verweildauer** (`Flow::stay[7][8]` = Wochentag × halbe Stunde 11:00–14:59, je `{Mittel s, Anzahl}`, dazu `stayAvg/stayN`): gelernt in `scan` bei der Rückgabe aus `Card::outAt` (monoton, **nicht gespeichert**, nach `rebootClock`/`correct`/`startDay` = -1). Nur 180–5400 s; Mittelwert kumulativ bis 10, danach 0,9/0,1. `stayUndo` nimmt die letzte gelernte Rückgabe bei `undo` zurück. Gespeichert als **flache Liste** `flow.stay` (112 Zahlen, leer ohne Daten) – als JSON-Baum viel kleiner als verschachtelt. `status()` lässt sie weg (`Flow::snapshot(false)`), nur `stayAvg/stayN` gehen ans Tablet.
- `Engine::nextFreeIn(now)`: kleinste erwartete Restzeit über ausgegebene Karten mit bekanntem `outAt` (`Flow::expectedStay`: Halbstunde ab 5 Rückgaben, sonst global; -1 unter 5 Rückgaben). `signal` liefert `nextFreeIn`, `stayMinutes`. **Gruppenautomatik unverändert.**
- **Tagesbericht** `Flow::Day` hat 15 Werte: `[13]` höchste Zahl gleichzeitig ausgegebener Karten, `[14]` höchste Mensa-Belegung. Alte Zeilen (12/13) laden mit -1. `Flow::newDay()` erzeugt neue Zeilen. `today[1]` (Wochentag) wird gesetzt, sobald die Uhr am Tag erstmals bekannt ist.
- **Mensa-Assistent**: `mensaAssist()` (bestätigt, keine Pause, keine Serie, Küche offen mit ≤ 1 frei, Mensa zu), `mensaSuggestion(&days)` (max. `[14]` der letzten 4 gleichen Wochentage – ohne Wochentag alle –, auf 5 aufgerundet, ≥ 10, ohne Daten 20, ≤ Kapazität). Dial-Pille „Mensa öffnen? Drehen“; erster `dialTurn` bzw. Menü „Mensa freigeben“ starten mit dem Vorschlag. `signal.mensaHint` (-1 = aus), `signal.mensaBasis` (Anzahl Tage).
- **Hinweise**: `Card::missed` (bei `startDay` noch draußen), `Card::quick` (Rückgabe < 60 s), je ≤ 999, nur ≠ 0 in `asJson`/`cardsText` (Speicher). `cardFlags {label}` setzt zurück, `clearData.flags` alle. Tablet: Kasten „Hinweise“ in `src/Management.tsx` (missed ≥ 2, quick ≥ 3).
- **Gesundheit** (Firmware, nur RAM): `device.health {crash, readerFaults, saveFailures (BookStorage::failures), ampelDrops, minBlock}`; Abtastung 1×/s in `step()`. Bewertung im Tablet `src/health.mjs` (feste Grenzen, je ein Satz „was tun“), Karte „Gesundheit heute“ in `src/DevicePanel.tsx`. Test `tests/health.test.mjs`.
- **Ampel**: `src/ampel-texts.mjs` `thanks`, `friendlyLines`, `nextSeatText()`; Punkte `.signal-dots` (aus bei `prefers-reduced-motion`).
- **Speicher** (`tests/native-memory.test.mjs`, nativ 64 bit, ungünstigster Fall: alle Zähler 999, alle Halbstunden gelernt): Status 79,6 KB (0.15: 86,6 KB – `Engine::status` baut den Ablaufteil nicht mehr doppelt, `snapshot(withCards, withFlow)`), Speichern 98,8 KB (+7,7 KB), Buchung 121,7 KB (+10 KB). Der Test bildet jetzt das echte `snapshotText` mit Reservierung nach. Grenze Status auf 100 000 gesenkt.
- Tests: `tests/learn.test.mjs`.

## Version 0.17.0-preview: Prognose, Coach, Simulator (Plan 16, Teil 2)

- Nur Browser: `src/insights.mjs` (reine Funktionen, Test `tests/insights.test.mjs`), Anzeige `src/Insights.tsx` (`ForecastCard` in Betreuung, `Coach` mit Simulator in Einlass & Messungen). Keine Kern- oder Firmwareänderung außer der Version.
- `forecast(history, weekday, mensaCapacity)`: letzte 4 Tage desselben Wochentags mit Ausgaben; Mittel von Essen/Spitze/Zeiten, Mensa nötig wenn an mindestens der Hälfte der Tage benutzt; Mensa-Vorschlag wie `Engine::mensaSuggestion`.
- `coach(flow, rooms)`: Regeln über die letzten 10 Tage (ab 3): Entlastungen ≥ 25 % der Gruppen → `flowSettings batch−1`; keine Entlastung und ≥ 30 % frühere Freigaben bei ≥ 8 Gruppen → `batch+1`; Gruppen ohne Automatik → `autoSettings on`; Mensa an fast allen der letzten 5 Tage → `room M` (gilt nur für den Tag, `startDay` sperrt die Mensa wieder); fehlende Karten an ≥ 3 Tagen → Hinweis ohne Befehl. „Übernehmen“ schickt `action` über `send()` (rid, idempotent).
- `simulate({children, minutes, perChild, stay, seats, batch})`: sekundengenaues, deterministisches Modell; Ankunft `minutes·(i/n)²` (die meisten am Anfang), Gruppenfreigabe `groupStart + batch·perChild` wie die Automatik, Ausgabe seriell `perChild`, Platz nach `stay` frei. Ausdrücklich als Schätzung beschriftet.

## Version 0.17.1-preview: Dauertest im Hintergrund, Prüfung über USB

- **Merksatz: keine langen Arbeiten in einem Web-Handler.** Der Webserver des Dials beantwortet eine Anfrage nach der anderen; solange ein Handler läuft, wartet auch die Ampel (rot nach 3 s) und das Tablet bricht nach 7 s ab (`send()`). Der Speicher-Dauertest lief bis 0.17.0 als 20 Runden in einem Handler (~8,7 s, „Failed to fetch“, `webMaxMs` 8666 am echten Gerät). Jetzt: `memoryTestStart()` setzt nur den Zustand, `memoryTestStep()` in `step()` macht eine Runde je 300 ms unter `Guard`; Ergebnis in `device.memoryTest {running, ok, message}` und per `note()`.
- **USB-Prüfschnittstelle** (`serialPoll`/`serialCommand` in `step()`): Zeilen `@mensa info|health|memorytest|bench|backupcheck`, Antwort `@mensa-reply {json}`. Nur lesen bzw. Dauertest; `backupcheck` baut `backupText()` (gemeinsam mit `/api/backup`) und prüft im Dial, nur mit ≥ 60 KB freiem Block. Skript `scripts/device-check.py` (pyserial, öffnet ohne DTR/RTS, findet VID 303A), Bericht nach `pruefbericht/` (gitignored), Auswertung `evaluate()` mit `--selbsttest` (Test `tests/device-check.test.mjs`). Anleitung für Claude Code am PC: `PRUEFUNG-AM-PC.md`.

## Version 0.17.2-preview: begrenztes Senden, Ursachen der Ampel-Pausen

- **Erste USB-Prüfung am echten Gerät (0.17.1, 01.10.2026):** Dial gesund (Dauertest ok, größter Block mind. 87 KB, knappster 53 KB, kein Absturz, 0 Speicherfehler, längste Bearbeitung 919 ms). Rote Punkte „Neustart / 0 KB / Dauertest nicht gestartet“ waren ein Skriptfehler: eine Bibliothekszeile („request handler not found“, `log_e` bei jeder Seite aus `onNotFound`) stand ohne Zeilenende vor einer Antwort, danach waren alle Antworten um eins verschoben. Echte Befunde: Ampel-Pausen 5–15 s (zweimal Tablet ganz aus dem WLAN, danach Seitenneuladen), „Kartenleser 2 Störungen“ = unklar gelesene Karten.
- **`sendBounded()`** ersetzt `web.send`/`send_P` (Antworten und Tablet-Dateien): eigene HTTP-Antwort über `client.fd()` mit `send(MSG_DONTWAIT)` und `select` je 100 ms; Abbruch und `client.stop()`, wenn 1,5 s nichts vorangeht. Grund: `WiFiClient::write` wartet bis zu 10 × 1 s (`WIFI_CLIENT_MAX_WRITE_RETRY`, `WIFI_CLIENT_SELECT_TIMEOUT_US`), und der Webserver bedient so lange niemanden. Zähler `sendMaxMs`, `sendAborts`.
- `wlanDrops` über `WiFi.onEvent(ARDUINO_EVENT_WIFI_AP_STADISCONNECTED)` (nur atomarer Zähler im Ereignis-Task).
- `CardReader::fault()`: `ioFaults` (Kommunikation/Hardware, = `health.readerFaults`) und `unclearReads` getrennt, gezählt beim Wechsel gesund → gestört.
- USB-Antworten beginnen mit `\n` und enthalten `"cmd"`; `scripts/device-check.py` sucht `@mensa-reply` überall in der Zeile, leert vor jeder Frage den Puffer, nimmt nur passende `cmd` an, wertet Neustarts/Block nur aus gültigen Messwerten aus und listet Ampel-Pausen mit Ursache (`pauses()`: WLAN verlassen / Dial-Abbruch / Tablet hat nicht gefragt). Selbsttest deckt das ab.

## Version 0.17.3-preview: Tablets bleiben im Dial-WLAN

- **Zweite USB-Prüfung (0.17.2, 02.10.2026, Galaxy Tab S10 Ultra, Ampel + Betreuung in zwei Browsern, am Strom, aktiv):** Dial einwandfrei (Dauertest ok, Block ≥ 101 KB, 112 Karten in der Sicherung, Ampel im Dauertest ohne Pause, 0 abgebrochene Antworten). Aber `wlanDrops` 1→3 in einer Minute: das Tablet meldete sich je 11–15 s ab. Vermutete Ursache: kein DNS und keine Antwort auf die Internetprüfung (Android `generate_204`, iOS `hotspot-detect.html`) – Tablets halten das Netz dann für schlecht.
- **`firmware/src/probes.hpp`** (rein, Test `tests/native-probes.test.mjs`): Antworten für `/generate_204`, `/gen_204` (204), `/hotspot-detect.html`, `/library/test/success.html` (Apple „Success“), `/connecttest.txt`, `/ncsi.txt`, `/success.txt`, `/canonical.html`. In `onNotFound` vor den Tablet-Dateien, ohne Sperre, über `sendBounded`; Zähler `probeAnswers`. **`DNSServer`** beantwortet jeden Namen mit 192.168.4.1 (TTL 60), `processNextRequest()` im Web-Task. Die API bleibt durch `localOrigin()` (Host 192.168.4.1) geschützt. HTTPS-Prüfungen scheitern sofort (Port 443 zu) – unschädlich.
- **WLAN-Protokoll:** `wlanEvent()` aus `WiFi.onEvent` (verbunden/getrennt, Sekunde seit Start, MAC-Ende) in einem Ring von 12 unter `portMUX`; USB `health.wlanEvents`. **Signalstärke:** `stations()` (`esp_wifi_ap_get_sta_list`), `rssiMin` je Sekunde in `step()`; in `device.health` und USB. Prüfskript: Tabelle „WLAN-Ereignisse“, Zeile „Signalstärke“ (≥ −70 ok, < −80 rot), Pausen-Ursache „Signal schwach“ bzw. „Signal gut → Einstellung am Tablet“.

## Version 0.17.4-preview: mehrere Tablets angemeldet

- Am Gerät gemeldet: Die Anmeldung auf einem zweiten Tablet warf das erste raus (nur eine Sitzung `session`/`sessionUntil`). Jetzt `firmware/src/sessions.hpp` (`mensa::Sessions`, 4 Plätze à 8 h): `add` nimmt einen freien/abgelaufenen Platz, sonst den am längsten unbenutzten; `check` vergleicht zeitkonstant mit allen Plätzen und setzt `usedAt`; `remove` beim Abmelden nur das eigene Token; `keepOnly` nach neuem Betreuungskennwort. Test `tests/native-sessions.test.mjs`. Der PC-Dienst hatte das Problem nicht (gemeinsames Token).

## Version 0.17.5-preview: Japanisch und Chinesisch in der Sprachzeile

- `src/ampel-texts.mjs`: `JA` (einfache höfliche Form) und `ZH` (vereinfacht, `lang: 'zh-Hans'`) für `open`, `wait`, `thanks`, `closed`. Schrift aus dem System (Inter enthält kein CJK): `.signal-language` nennt `Hiragino Sans`, `PingFang SC`, `Noto Sans JP/SC` als Ausweich. Von Muttersprachlern prüfen lassen.

## Version 0.17.6-preview: flüssigere Animationen

- Am Gerät gemeldet: Animationen ruckeln. Ursachen: `draw()` höchstens alle 250 ms (4 Bilder/s) und jedes Bild komplett teuer gerechnet.
- **`core/dial_raster.hpp`, ergebnisgleich** (Nachweis: Paritätstest gegen `src/dial-paint.mjs` und `tests/native-raster-bench.test.mjs` gegen die Referenzkopie `tests/native/raster_ref.hpp`): Farbverlauf über eine statische Tabelle `[257][16]` je Farbpaar (statt Kanalrechnung je Pixel) und 32-bit statt 64-bit-Division; Kantenglättung mit exakten Abkürzungen über das Kästchen der 16 Unterpunkte (`box()`, `circleCoverage()`; Ring: radial außerhalb → 0, Vollring/Teilbogen ≤ 180° mit allen Ecken im Keil → 16). Am PC etwa doppelt so schnell; auf dem Dial mehr (64-bit-Division ist dort Software).
- **Bildtakt:** `Engine::animating()` (Countdown läuft oder Taste gehalten) plus Update/frische Rückmeldung → `draw()` alle 40 ms, sonst 250 ms; gemalt wird nur bei Änderung. Messwerte `drawMs`/`drawMaxMs` (atomar, Loop schreibt ohne Sperre) in `device.health` und USB; Prüfskript-Zeile „Bild zeichnen“ (≤ 40 ms ok). Liegt der Wert am Gerät über 40 ms, wäre der nächste Schritt Teilneuzeichnen.

## Version 0.17.7-preview: Tablets laden nach einem Update neu

- Am Gerät bemerkt: Japanisch/Chinesisch fehlten auf der Ampel, obwohl 0.17.5+ eingespielt war – die Seite lief mit dem alten Stand weiter (Web-App wird einmal geladen, dann nur Datenabfragen). Jetzt liefert `/api/signal` (Firmware `publicSignal`, PC-Dienst) `version`, `/api/state` hat `device.version`; `src/useMensa.ts` vergleicht mit `VERSION` und lädt bei Unterschied einmal neu (`src/version-check.mjs` `needsReload`, Schleifenschutz über `sessionStorage` `mensa-reloaded-for`, nicht während `locked`). Test `tests/version-check.test.mjs`; Browserprüfung mit Playwright (abgefangene Antwort mit anderer Version → genau ein Neuladen).

## Version 0.18.0-preview: WLAN über einen eigenen Router (Plan 23)

- `DeviceConfig` (`firmware/src/config.hpp`): `wifiMode` `"ap"` (Standard, eigenes WLAN wie bisher) oder `"router"`, dazu `router` (SSID, Kennwort, feste Adresse des Dials, Router-Adresse, Netzmaske; GL.iNet-Vorgabe 192.168.8.20/192.168.8.1). Felder beim Laden optional; unbrauchbare Router-Daten → eigenes WLAN, nie „Konfiguration defekt“. Gesetzt über `deviceSettings` (leeres Router-Kennwort = behalten); jede WLAN-Änderung startet neu.
- Reine Logik in `firmware/src/netconfig.hpp` (nativ getestet, `tests/native-netconfig.test.mjs`): Prüfung der Router-Daten (Adressformat, Netzmaske, gleiches Netz, nicht Router-/Netz-/Rundrufadresse, nicht 192.168.4.x), erlaubte Hosts (`hostAllowed`: 192.168.4.1 und im Router-Betrieb die Dial-Adresse, je mit/ohne `:80`), `rescueNeeded`.
- Router-Betrieb: `WIFI_STA` mit fester Adresse, Schlafmodus aus, automatisches Wiederverbinden; zusätzlich `WiFi.reconnect()` jede Minute ohne Router (die Bibliothek gibt z. B. nach falschem Kennwort auf). Nichts blockiert in `setup()`.
- **Rettung:** 30 s ohne Router (beim Start oder später) → `WIFI_AP_STA`, eigenes WLAN wie im AP-Betrieb (192.168.4.1) bis zum nächsten Neustart. DNS-Antworten zeigen dann auf 192.168.4.1, sobald der Router wieder da ist wieder auf die Dial-Adresse. Der DNS gehört dem Web-Task (`dnsWanted`, dort neu gestartet).
- Internetprüfung: Im Router wird das Dial als DNS-Server eingetragen (Rebind-Schutz aus); das Dial antwortet auf jeden Namen mit seiner Adresse, `probes.hpp` beantwortet die Prüf-URLs wie im AP-Betrieb.
- `localOrigin()` nutzt `hostAllowed` mit der beim Start festgelegten Router-Adresse (`routerHost`, ändert sich nur mit Neustart → keine geteilten Strings zwischen Tasks).
- Gesundheit: `health.router`; `wlanDrops` zählt im Router-Betrieb Trennungen vom Router (Ereignisse STA_CONNECTED/STA_DISCONNECTED, nur nach bestehender Verbindung), `stations` enthält `{mac: "Router", rssi: WiFi.RSSI()}`, `rssiMin` auch daraus. Status/USB zusätzlich `wifiMode`, `routerConnected`, `rescue`. `scripts/device-check.py` ordnet Pausen ohne Router-Verbindung dem Router zu und meldet Rettungs-WLAN.
- Dial: WLAN-Daten zeigen Router-Name/-Kennwort und `DialExtras::url` (Router-Adresse); Hinweise „Verbinde mit Router ...“ bzw. „Router fehlt: eigenes WLAN an“; Gerätetest-Zeile „Router: ok/fehlt“.
- Tablet: Gerät → WLAN und Zugang mit „WLAN-Art“ und Router-Feldern. Anleitung „Router einrichten“ (GL.iNet Opal Schritt für Schritt, Kurzfassung FRITZ!Box).
- Nur gebaut und mit Logiktests geprüft; am echten Router noch nicht getestet.

## Version 0.19.0-preview: Start-Check, Ruhemodus, Ruhe-Hinweis, Lern-Sicherheit (Plan 24)

- **Start-Check:** Bildschirm `"check"` im Kern (`DialExtras::checks`, Name + 0 ok/1 wartet/2 Fehler, Symbole aus vorhandenen Zeichenbefehlen – kein neuer Rasterbefehl). Firmware zeigt ihn 4 s nach dem Start (`checkUntil`), bei Fehler mindestens 6 s länger; Taste oder Karte beenden ihn (die Taste wirkt dabei normal, damit „3 s halten = Bestand bestätigen“ gleich nach dem Start geht).
- **Ruhemodus:** `Engine::rest` (Minuten, 0 = aus, Standard 20, im Snapshot, alte Bestände 20; gesetzt über `settings.rest`). `Engine::resting(now, lastInput)` nur bei bestätigtem Bestand, keiner Karte draußen, ohne Menü/Serie/Einstellung/Countdown/Entlastung. Firmware `restStep()`: `lastInput` bei Karte, Ring, Taste, Touch; im Ruhemodus Helligkeit 0, kein Zeichnen, keine Erinnerungstöne. Wecken: Karte bucht normal; Ring verwirft die Schritte, Taste wird bis zum Loslassen ignoriert (`ignoreButton`), Touch löst keine Entlastung aus. Kein Ruhemodus bei Einlernen, Gerätetest, Update, WLAN-/Reset-Anzeige oder Start-Check. Status: `device.resting`, `device.rest`. Die Ampel ändert sich bewusst nicht.
- **Ruhe-Hinweis:** `signal.busy` = belegte / freigegebene Plätze der offenen Räume in Prozent (-1 ohne offenen Raum). Tablet: `wantsQuiet(admitting, busy)` ab 85 % (`src/ampel-texts.mjs`), Zeile unter dem Titel und jede zweite Sprachrunde `quiet`.
- **Wie sicher ist das Gelernte:** `confidence(flow)` in `src/insights.mjs` (Zeitfenster 3/7 Gruppen, Tage 2/4, Verweildauer 5/30, Gruppen gesamt 5/20); Karte `Confidence` in `src/Insights.tsx` unter dem Wochen-Coach, Stufe immer als Text und Farbe.
- Tests: `tests/rest.test.mjs` (Ruhemodus, alte Bestände, busy, Start-Check-Bildschirm), `insights`, `ampel-texts`.

## Version 0.19.1-preview: Update in Stücken, USB-Update-Fehler, flüssigeres Zeichnen

- **Befund am Gerät:** Updates auf 0.18/0.19 brachen während der Übertragung ab (Dial 0.17.7). Ursache sehr wahrscheinlich: ein einziger Upload von ~1,7 MB dauert rund eine Minute, das Galaxy Tab verlässt das Dial-WLAN etwa jede Minute kurz (Befund 0.17.2), Android schließt dabei offene Verbindungen. Die Größe der Firmware (1,69 MB von 3 MB) ist nicht die Ursache.
- **Update in Stücken:** `POST /api/update/begin` (Größe, prüft Platz, `Update.begin`, 15 796-Byte-Puffer = 11 × `HTTP_RAW_BUFLEN`, sonst wartet der WebServer am Ende jedes Stücks 5 s auf einen vollen Leseblock), `POST /api/update/chunk` mit Kopf `X-Update-Offset` (Rohdaten, `web.raw()`; URL-Argumente liest der WebServer bei Rohdaten nicht, erst vollständig gesammelt, dann geschrieben; Entscheidung `mensa::ota::chunk()` in `ota.hpp`: Write/Skip/Reject, nativ getestet), `POST /api/update/finish` (Marke, `Update.end(true)`, Rückfall-Vormerkung, Neustart). Antwort enthält immer `written`; das Tablet (`src/firmware-upload.mjs`, getestet mit simulierten WLAN-Abbrüchen) macht dort weiter und gibt erst nach 90 s ohne Fortschritt auf. Abbruch im Dial erst nach 120 s ohne Daten. Altes `/api/update` bleibt.
- Während eines Updates keine schnellen Bilder (`drawFast` aus).
- **USB-Helfer:** Modus „Update“ schreibt jetzt `0xe000 boot_app0.bin` mit, sonst startete ein Dial nach Tablet-Updates (aktiver Bereich app1) weiter das alte Programm.
- **Zeichnen:** zwei Streifenpuffer à 24 Zeilen (gleicher Speicher wie vorher einer à 48), `pushImageDMA` überlappt mit dem Malen des nächsten Streifens; unveränderte Streifen (FNV-Prüfsumme) werden nicht gesendet; 33 ms Bildabstand, wenn ein Bild < 24 ms braucht. Rasterer unverändert (Pixelgleichheit bleibt). Neue Messwerte `frameGapMaxMs` (längste Pause zwischen zwei Bildern bei Bewegung) und `lockWaitMaxMs` (Warten auf die Sperre vor einem Bild) in Gesundheit und USB-Bericht – zeigen, ob Tablet-Anfragen unter der Sperre die Animation aufhalten.

## Version 0.20.0-preview: Ausreißer-Schutz, Lern-Tagebuch, Selbstheilung der Ampel

- **Ausreißer-Schutz** (`Flow::tame` in `core/flow.hpp`): `learn()` begrenzt eine Beobachtung auf das 1,6-Fache bzw. 1/1,6 des gelernten Werts (Zeitfenster ab 3 Beobachtungen, sonst Gesamtwert ab 3), `learnStay()` auf das Doppelte bzw. die Hälfte des Durchschnitts (ab 5 Rückgaben). Die bisherigen Grenzen (autoMin/autoMax, stayShort/stayLong) bleiben davor.
- **Lern-Tagebuch** `Flow::diary`: höchstens 40 Zeilen `[Tag, Wochentag, Art, Schlüssel, vorher, nachher, Anzahl]`, je Tag und Wert zusammengefasst (`diaryNote`). Arten: 0 Zeitfenster-Tempo (vorher -1 = neu), 1 Gesamttempo, 2 Gruppengröße, 3 Startgruppe, 4 Verweildauer, 5 Gruppe gebremst, 6 Karte gebremst, 7 zurückgesetzt. Schlüssel = Wochentag × 48 + Halbstunde. Gespeichert und im Status als **ein Text** `"d,w,k,key,b,a,n;..."` (als JSON-Liste überschritt der Speichertest die Grenze knapp; ein Text ist ein einziger JSON-Wert). Laden prüft Format und Bereiche, ältere Bestände ohne Tagebuch laden leer. „Testdaten löschen → Gelerntes“ leert das Tagebuch, „Gelerntes zurücksetzen“ in den Automatik-Einstellungen schreibt eine Zeile „zurückgesetzt“. Sätze schreibt das Tablet (`parseDiary`, `diaryLines` in `src/insights.mjs`, Karte `Diary` in `src/Insights.tsx`).
- **Selbstheilung der Ampel** (`src/self-heal.mjs`, Wächter in `useMensa.ts`, nur Ampelseite): alle 5 s; Abfrage-Schleife ohne Runde seit 10 s → Neustart der Schleife (Kettennummer verhindert eine zweite Kette); 30 s ohne Antwort → eigene Prüfanfrage an `/api/signal`, nur bei Erfolg `location.reload()`, höchstens alle 5 min (`sessionStorage` `mensa-healed-at`). Dial nicht erreichbar → kein Neuladen.
- `docs/STITCH-PROMPTS.md`: Prompts für Designentwürfe in Google Stitch (Ampelseite, Betreuungsseite, Dial mit den Grenzen des Rasterers).
- Tests: `tests/diary.test.mjs`, `tests/self-heal.test.mjs`; Speichertest mit vollem Tagebuch.

## Version 0.21.0-preview: Design nach Google Stitch

- Grundlage: `docs/DESIGN-NOTIZEN.md` (Entwürfe des Nutzers aus Stitch; Prompts in `docs/STITCH-PROMPTS.md`). Nichts aus dem Internet geladen; Erfundenes der Entwürfe weggelassen.
- **Dial (`core/dial.hpp`, `core/engine.hpp`):** neue Töne (Grün `#15803d→#052e16` usw., Bernstein jetzt mit weißer Schrift, neu Türkis für Rückgaben), Hilfen `band`, `gauge` (Ring 105–114 px, Lücke oben 312°…588° für den Tastenhinweis, runde Enden als Kreise), `segments`, `mix`. Hauptbildschirm: Ring = freie Plätze / freigegebene Plätze bzw. Countdown; kleine Symbole über der großen Zahl entfallen; Unterzeile „Küche n · Mensa m“. Rückmeldung nach Art (`DialExtras::feedbackKind`: 1 ausgegeben, 2 zurück; Firmware aus dem Klang-Ereignis, PC-Dienst/Demo aus der Meldung): Doppelring + Haken + Nummer groß + „Guten Appetit!“, türkis „K12 zurück, danke!“, abgelehnt rot mit Ring in 6 Stücken und Kreuz; sonstige Meldungen wie bisher. Menü mit Strichring, blauem Zeiger und blauer Auswahl-Pille. Start-Check mit vier Vierteln in Zustandsfarbe und „OK/wartet/Fehler“. Halten: eigener Bildschirm, Ring 102–114 px. Rasterer unverändert (Pixelgleichheit Dial ↔ Browser bleibt).
- **Tablet:** neue Farbschicht am Ende von `src/style.css` (Tokens, Pillen-Knöpfe ohne Rahmen, Kopfzeile mit Verbindungs-Pille und Pillen-Reitern; Reiter „Betreuung“ heißt jetzt „Betrieb“). `Management.tsx`: `StatusHero`, `RoomCard` (Plus/Minus über den Befehl `room`, nie unter die Belegung), Meldungen als `notice-card`, `SeatGrid` statt Seitentabelle, Tagesaktionen. `DevicePanel.tsx`: `Overview` (Gesundheit als Karten, Geräte-Details), Einrichtungs-Überschrift nur noch vor der Einrichtung. Ampel nur farblich angeglichen.

## Version 0.23.0-preview: Tagesverlauf (Zeitleiste, Vorhersage, Automatik erklärt, Wärmebild)

**Entwurf:** Claude-Design-Seite „Mensaampel – Dashboard-Seiten“ mit den vom Nutzer gewählten Ideen 1, 5, 6 und 7.

**Kern (`core/flow.hpp`).** Drei kompakte Texte, weil das Dial kein PSRAM hat:
- `curve`: höchste Zahl gleichzeitig ausgegebener Karten je 10 Minuten von 10:00 bis 15:59.
  - 36 Werte, -1 = noch keine Buchung in diesem Abschnitt.
  - Abschnitte zwischen zwei Buchungen behalten den Stand von damals (`trace()` bei jeder Buchung).
- `dayEvents`: Ereignisse des Tages, die letzten 40, als „Minute, Art, a, b; …“.
  - Arten: `GroupOpen`, `GroupFull`, `AutoRelease`, `EarlyRelease`, `HandRelease`, `ReliefStart`, `ReliefEnd`, `HandPause`, `OutlierTamed`.
  - Eine Rücknahme der Buchung nimmt `GroupOpen`/`GroupFull` wieder heraus.
- `peaks`: je abgeschlossenem Essenstag die höchste Belegung pro halbe Stunde ab 10:00.
  - 12 Werte als `signed char`, die letzten 60 Tage wie die Tagesberichte.
  - `closeDay()` bildet sie aus `curve`, danach werden `curve` und `dayEvents` geleert.

**Speichern, Status und Sicherung.**
- `peaks` liegt oben im Snapshot neben den Karten. Die Firmware hängt es als Text an (`storage.hpp` `snapshotText`, `backupText`).
- Im Status kommt `peaks` nur mit, wenn sich `peaksRev` geändert hat (`/api/state?peaks=<rev>`, einmal am Tag), wie bei `cardsRev`. Das Tablet setzt den Rest ein (`mergePeaks` in `src/state-merge.mjs`).
- Ältere Stände ohne die Felder laden weiter. „Testdaten löschen → Tagesberichte“ leert alle drei Texte.

**Speichertest** (`tests/native/memory.cpp`, schlimmster Fall mit vollen Texten): Speichern ca. 107 KB, Buchung ca. 133 KB; beide liegen unter den bisherigen Grenzen.

**Tablet.**
- `src/day-course.mjs` (+ `.d.mts`) rechnet alles im Browser:
  - `groups`, `timeline`: Plan aus `auto.releaseIn`, gelernter Gruppendauer und Prognose der Essen;
  - `dayCurves`: Vorhersage = Mittel, Minimum und Maximum der letzten 4 gleichen Wochentage;
  - `decisions`: Sätze;
  - `heatmap`.
- `src/DayCourse.tsx` enthält die Bausteine `Timeline` (Betrieb), `ForecastChart` und `Decisions` (Einlass & Messungen) sowie `Statistics` (neuer Reiter „Statistik“, `#statistik`, auch in der Demo).
- Gestaltung: Schicht „0.23“ am Ende von `src/style.css`.

**Tests:** `tests/day-course.test.mjs` (Kern), `tests/day-course-view.test.mjs` (Ansichten mit simulierten Dienstagen), `tests/state-merge.test.mjs`.

## Version 0.22.1-preview: Ring-Zeichnen schneller

- Befund: Der Bench-Test `tests/native-raster-bench.test.mjs` schlug seit dem 0.21-Design fehl. Die Pixel waren gleich, aber das Zeichnen war nur noch 1,17-mal statt mindestens 1,5-mal schneller als die Referenz. Ursache: Der Rand-Ring (`gauge`, 276°) hatte als Teil über 180° keine Abkürzung, deshalb lief jedes Pixel im Ring durch 16 Einzeltests.
- `core/dial_raster.hpp` `arc()`: exakte Abkürzungen auch für Teile über 180°. Die Außenseite ist der offene konvexe Keil `k0 > 0 && k1 > 0`.
  - **Voll (16):** Das Kästchen liegt ganz zwischen den Radien und alle vier Ecken haben `k0 ≤ 0` (oder alle `k1 ≤ 0`).
  - **Leer (0), für jeden Teilring:** Alle Ecken liegen außerhalb des Teils und das Kästchen berührt keines der runden Enden.
  - Ergebnisgleich: `src/dial-paint.mjs` bleibt unverändert. Der Test vergleicht jetzt zusätzlich zufällige Ringe aller Winkel mit der Referenz.
- PC-Messung je Bild (Vorschau-Bildschirme): Referenz 1654 µs, vorher 1390 µs, jetzt 687 µs.

## Version 0.22.0-preview: Ampelseite nach Claude Design

- Entwurf: Claude-Design-Seite „Mensaampel – Ampelseite für Kinder“ (sechs Zustände, moderne Fassung vom Nutzer gewählt).
- `src/Signal.tsx`: Vollbild-Zweig neu (`.ampel22`): Leuchtkugel (Ringe als radialer Verlauf; beim Countdown SVG-Ring `share`, Zeit in der Kugel), Mini-Ampel in der Uhrzeit-Pille, Glas-Pillen für Küche/Mensa, Überschrift/Pille/Satz je Zustand, Wartepunkte, Ruhe-Pille, Glasleiste mit Sprachzeile, Hinweis und Symbol-Knöpfen (Vollbild, Ton). Die kleine eingebettete Ampel (nicht Vollbild) bleibt unverändert. Logik (Zustände, Sprachwechsel, Ton, Countdown-Anteil) unverändert.
- Schrift Plus Jakarta Sans (variabel, Latin + Latin-Ext, OFL) lokal in `src/fonts/jakarta-*.woff2`, Lizenz `licenses/PlusJakartaSans.txt`; andere Schriften (Arabisch, Kyrillisch, Japanisch, Chinesisch) fallen auf Inter bzw. Systemschriften zurück.

