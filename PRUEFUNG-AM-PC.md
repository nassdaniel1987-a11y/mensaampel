# Geräteprüfung über USB – Anleitung für den Nutzer und für Claude Code am PC

Ab Firmware **0.17.1**. Das Dial hängt per **USB-Datenkabel** am Windows-PC; der PC bleibt im Internet (Claude Code braucht das). Ampel- und Betreuungs-Tablet laufen dabei ganz normal über das WLAN des Dials. Das Prüfskript beobachtet das Dial über das Kabel, startet den Speicher-Dauertest und schreibt einen Bericht. Es **bucht nichts und ändert keine Einstellungen**.

## Für den Nutzer (vorher)

1. Dial per USB-Datenkabel an den PC (dasselbe Kabel wie bei der Installation).
2. **Beide** Tablets mit dem Dial-WLAN verbinden (im Router-Betrieb mit dem Router-WLAN, Adresse des Dials z. B. http://192.168.8.20): Ampel-Tablet mit `/ampel`, Betreuungs-Tablet angemeldet (je nur **ein** Browserfenster). Vorher am Ampel-Tablet „Ampel-Tablet: WLAN stabil halten“ aus `ANLEITUNG-DIAL.md` einstellen.
3. Claude Code am PC im Ordner des Projekts starten und schreiben: *„Bitte die Geräteprüfung nach PRUEFUNG-AM-PC.md machen.“*
4. Während der Prüfung (10 Minuten) gern normal weiterarbeiten oder Karten scannen – nur das Dial nicht ausstecken.

## Für Claude Code am PC

1. **Code aktualisieren:** `git fetch`, `git checkout claude/youthful-sagan-v8j6hx`, `git pull`. Zuerst `AGENTS.md` lesen.
2. **Python mit pyserial:** `python -m pip install pyserial`. Ohne eigenes Python geht das Python von PlatformIO: `%USERPROFILE%\.platformio\penv\Scripts\python.exe` (hat pyserial schon).
3. **Kein anderes Programm am Anschluss:** `pio device monitor`, Arduino-Monitor o. Ä. schließen (der Anschluss kann nur einmal geöffnet werden).
4. **Starten:** `python scripts/device-check.py` (Anschluss wird automatisch gefunden, sonst `--port COM5`; kürzer: `--minuten 3`). Meldet der Bericht „Firmware-Version“ zu alt: dem Nutzer sagen, er soll zuerst das Update einspielen (Tablet: Gerät → Firmware-Update mit `Mensaampel-Dial-Update.bin` aus dem Release, oder `Mensaampel_Dial_Vorbereitung\Dial-Installieren.cmd` → „Update“). **Nicht selbst flashen.**
5. **Bericht:** liegt in `pruefbericht\<Datum-Uhrzeit>\bericht.md` (und `.json`). Dem Nutzer in einfachen Worten erklären, was in Ordnung ist, was nicht und was zu tun ist. Den Ordner nicht ins Git einchecken (steht in `.gitignore`); der Nutzer lädt `bericht.md` und `bericht.json` im Chat beim Entwickler hoch.

### Regeln

- Kein Flashen, kein Formatieren, kein Löschen, keine Änderungen am Bestand oder an Einstellungen ohne ausdrückliche Rückfrage beim Nutzer.
- Fehler nicht „wegreparieren“, sondern im Bericht stehen lassen und erklären. Codeänderungen nur nach Absprache und nach den Regeln in `AGENTS.md`.
- Startet das Dial beim Öffnen des Anschlusses neu (Bericht: „Neustarts“), ist das ein Hinweis, kein Gerätefehler: notieren.

### Was das Skript prüft

| Prüfung | Grenze |
|---|---|
| Verbindung über USB, Firmware-Version | Antwort, ≥ 0.17.1 |
| Keine Neustarts während der Prüfung | 0 |
| Größter freier Speicherblock (kleinster Wert) | ≥ 32 KB |
| Ampel wird bedient (Sekunden seit der letzten Abfrage der Ampel); jede Pause mit Uhrzeit und vermutlicher Ursache (Tablet aus dem WLAN / Tablet hat nicht gefragt / Dial hat abgebrochen) | ≤ 3 s |
| Ampel während des Speicher-Dauertests | ≤ 3 s |
| Speicher-Dauertest (20× Speichern im Hintergrund) | ohne Fehler |
| Status für das Tablet bauen (10×) | ≤ 1500 ms |
| Sicherung lesbar (im Dial geprüft) | gültig, Kartenzahl |
| Kartenleser, Speichern, längste Antwort ans Tablet | keine Störungen, ≤ 1500 ms |

Nicht automatisch prüfbar (bleibt von Hand, siehe `ANLEITUNG-DIAL.md` → „Abnahme am echten Gerät“): Karten vorhalten, Drehring, Taste, Stromausfall.

## USB-Prüfschnittstelle (technisch)

115200 Baud, Zeilen `@mensa <befehl>`, Antwort eine Zeile `@mensa-reply {json}`. Befehle: `info`, `health`, `memorytest` (startet den Hintergrundtest), `bench` (Status 10× bauen), `backupcheck` (Sicherung im Dial bauen und prüfen; der Inhalt geht nicht über das Kabel), `otatest` (seit 0.25.3: schreibt 64 KB Testdaten in den freien Update-Bereich und verwirft sie; installiert nichts, ändert nichts am Start). Nur lesen bzw. Dauertest. Umsetzung: `firmware/src/main.cpp` (`serialPoll`, `serialCommand`).
