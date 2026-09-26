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
