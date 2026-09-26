# Mensaampel – PC-Simulation

## Starten

1. Falls du die ZIP verwendest: **den gesamten Ordner entpacken**, zum Beispiel nach Dokumente. Nicht direkt aus der ZIP starten.
2. **Start-Mensaampel.cmd** doppelt anklicken. Die Anwendung öffnet sich im normalen Browser. Internet und eine zusätzliche Installation sind im täglichen Betrieb nicht nötig.
3. In **Betreuung** den Bestand prüfen und **Bestand bestätigen** wählen. Die Küche hat 48 freie Plätze; die Mensa bleibt gesperrt.

Mit **Mensaampel-beenden.cmd** wird der Hintergrunddienst beendet. Nur das Browserfenster zu schließen beendet den Dienst nicht. Der Bestand bleibt gespeichert. Nach einem echten oder simulierten Neustart ist eine erneute Bestätigung erforderlich.

## Einen Mittag ausprobieren

1. Auf **Simulation** wechseln und K01 **kurz scannen**. Der Platz gilt jetzt als belegt.
2. Sofort erneut scannen: Die Karte wird wegen ihrer zehnsekündigen Sperrzeit abgewiesen. Andere Karten sind sofort nutzbar.
3. **+10 Sekunden** und K01 erneut scannen: Der Platz ist wieder frei.
4. **Auflegen und liegen lassen** testen. Auch nach dem Vorspulen entsteht keine zweite Buchung. Erst **Entfernen**, dann erneut vorhalten.
5. M01 testen: Ohne Mensafreigabe wird die Ausgabe abgewiesen.
6. In Betreuung **Mensa → Anpassen** öffnen, beispielsweise 16 Plätze für das freie Essen vorsehen und den Raum öffnen. Danach lassen sich bis zu 16 Mensakarten ausgeben.
7. **Einlass pausieren**: Die Ampel wird rot. Ausgegebene Karten können nach ihrer Sperrzeit weiterhin zurückgenommen werden.
8. **Ampel öffnen** zeigt die Kinderansicht in einem eigenen Fenster. Änderungen aus der Betreuung erscheinen dort automatisch. **Vollbild** blendet den Browserrahmen aus; mit Esc verlassen.

**Wichtig für euren Ablauf:** Die 61 begleiteten Kinder erhalten keine Einzelbuchungen. Während sie in der Mensa essen, bleibt diese gesperrt. Erst tatsächlich nutzbare Plätze werden für das freie Essen freigegeben. Die Software erkennt weder Kinder noch saubere Tische. Eine ausgegebene Karte reserviert einen Platz; ihre Rückgabe gibt ihn frei.

## Karten und Korrekturen

- K01–K48 gehören zur Küche, M01–M64 zur Mensa. Die simulierten Kennungen heißen zum Beispiel `sim:K01`.
- **Karte einlernen** registriert eine neue Kennung und einen Raum. Zusätzliche Karten erhöhen die Raumkapazität nicht automatisch.
- **Bearbeiten** an einer Karte korrigiert Belegung und Verlustmarkierung. Eine verlorene ausgegebene Karte bleibt als belegt erfasst, bis die Betreuung den tatsächlichen Platz geprüft und freigegeben hat.
- **Letzte Buchung rückgängig** korrigiert die letzte Ausgabe oder Rückgabe. Änderungen an Karten, Kapazitäten oder Sperrzeit beenden diese Rückgängig-Möglichkeit.
- Eine Kapazität oder Teilfreigabe unter der aktuellen Belegung wird abgewiesen. Um weitere Ausgaben zu stoppen, den Raum schließen.
- **Neuer Essenstag** setzt Belegungen erst nach ausdrücklicher Bestätigung zurück. Verlustmarkierungen bleiben erhalten; die Mensa wird wieder geschlossen.
- **Einstellungen** ändern die Sperrzeit. Ein versehentlicher erneuter Scan nach deren Ablauf zählt weiterhin als Gegenbuchung. Das ist die bekannte Grenze eines einzelnen Lesers mit Umschaltlogik.

## Fehler bewusst ausprobieren

**Verbindung unterbrechen:** Acht Sekunden lang gibt es keine Statusmeldungen. Spätestens etwa drei Sekunden nach der letzten erfolgreichen Aktualisierung zeigt die Ampel Rot und einen Störungshinweis. Danach verbindet sie sich automatisch wieder.

**Neustart testen:** Der Bestand bleibt erhalten, aber der Einlass ist bis zur Bestätigung gesperrt.

**Dial in der Simulation:** Unter **Simulation** ist das Dial so abgebildet, wie sein runder Bildschirm am Gerät aussieht (gleiche Schrift, Farben und Texte). Orange Fläche anklicken = antippen, Ring oder **Taste drücken** = Gerätetaste, Karte auf das Dial ziehen = vorhalten. Rückmeldungen erscheinen wie am Gerät für 3,5 Sekunden mit Ton (abschaltbar).

**Speicherfehler:** Fehler einschalten und eine Karte scannen. Es wird nichts gebucht. Fehler beenden und die Aktion erneut ausführen; erst eine erfolgreiche Speicherung beseitigt den Störungshinweis.

Ungültige gespeicherte Daten sperren den Betrieb. Bei einer ausdrücklich bestätigten Wiederherstellung wird die beschädigte Datei aufbewahrt und ein leerer Grundbestand angelegt. Den tatsächlichen Bestand danach abgleichen.

## Speicherung und Grenzen dieser Version

Der Ordner `data` wird beim Start angelegt. `bestand.json` enthält Karten, Einstellungen und maximal 80 Ereignisse ohne Kindernamen. Vor einer Sicherung den Dienst beenden und den gesamten Ordner kopieren. Zwei Instanzen dürfen nicht dieselbe Bestandsdatei bearbeiten.

Diese Version läuft auf einem Windows-PC (x64) mit einem aktuellen Browser. Sie ist bewusst nur auf diesem PC unter `http://127.0.0.1:4317` erreichbar. Ein verbundenes Tablet kann die PC-Version noch nicht über das Netzwerk öffnen.

Die Geräteversion ist jetzt als separates Paket vorbereitet: **Mensaampel_Dial_Vorbereitung.zip** mit USB-Installationshelfer und **ANLEITUNG-DIAL.html**. Leser-, Speicher-, Anzeige- und WLAN-Anbindung sind implementiert und übersetzt, müssen aber noch mit echter Hardware erprobt werden. Die Auswahl zwischen internem und externem Leser erfolgt dort in der Oberfläche. Die PC-Simulation bleibt unabhängig davon nutzbar.

## Wenn der Start nicht klappt

- Den vollständigen Ordner in ein beschreibbares Verzeichnis entpacken.
- Im Browser `http://127.0.0.1:4317` öffnen, wenn das automatische Öffnen scheitert.
- In `data/fehler.log` steht eine mögliche Startfehlermeldung. Port 4317 muss verfügbar sein.
- Bei einem bereits laufenden Dienst öffnet die Startdatei dessen Oberfläche. Vor dem Wechsel auf eine andere Kopie der Anwendung zuerst die bisherige mit ihrer Beenden-Datei stoppen.
- Bei einer unterbrochenen Browserverbindung wird bewusst Rot angezeigt. Nach Wiederherstellung kann die Anzeige einige Sekunden benötigen.

## Selbstabnahme

Die technischen Prüfungen sind abgeschlossen. Probiere nun einen vollständigen Mittag mit euren Abläufen: Küche füllen, Karten zurückgeben, Mensa teilweise freigeben, Pause, Verlustkorrektur und Neustart. Erst damit ist die Bedienung für euren Alltag gemeinsam abgenommen.

## Neu: Einlassgruppen, Gelb und Messungen

Unter **Einlass & Messungen** stehen Gelbgrenze, begrenzte Einlassgruppen sowie Einzel- und Gruppenmessungen zur Verfügung. Startwert Gelb: fünf freie Plätze. Gruppenbegrenzung zunächst aus (0); beispielsweise auf fünf setzen und Einlass anschließend bewusst fortsetzen. Die Messungen bedient ihr am verbundenen Tablet. Einzelheiten: [Einlass und Messungen](EINLASS-UND-MESSUNGEN.md).

Auf dem Dial zeigt ein Kreis Grün, Gelb oder Rot mit kurzem Text. Ein kurzer Druck pausiert beziehungsweise setzt fort; bei einer noch laufenden Gruppenmessung zuerst den Messabschluss am Tablet bestätigen oder die Messung verwerfen.

## Neu: Automatische Gruppenfreigabe

Unter **Einlass & Messungen → Automatik** lässt sich die automatische Freigabe einschalten (Gruppengröße > 0 nötig). Nach einer vollen Gruppe zählt das Dial herunter und die Ampel öffnet von selbst. Zum Ausprobieren in der Simulation Karten ans Dial halten und vorspulen. Orange Fläche = zu voll, Taste im Countdown = früher frei; beides lernt das System. Die PC-Version übernimmt Wochentag und Uhrzeit automatisch. Einzelheiten: [Einlass und Messungen](EINLASS-UND-MESSUNGEN.md).
