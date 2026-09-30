# Mensaampel auf dem M5Stack Dial

**Vorbereitete Geräteversion 0.10.2-preview · Stand 27.09.2026**

> **Bedienung im Alltag:** siehe die bebilderte [Bedienungsanleitung](BEDIENUNG-DIAL.html) (auch als PDF) und die [Kurzkarte zum Aufkleben](DIAL-KURZKARTE.html). Download aller Dateien: https://github.com/nassdaniel1987-a11y/mensaampel/releases

Die Software, Tabletoberfläche und Windows-Übertragung sind vorbereitet. Der Gerätecode wurde erfolgreich für ESP32-S3 übersetzt. Die Erprobung an einem echten Dial steht noch aus. Dieses Paket ist für euren ersten begleiteten Hardwaretest vorgesehen.

## Was du brauchst

- M5Stack Dial v1.1.
- Windows-PC zum einmaligen Aufspielen und ein USB-C-**Datenkabel**. Ein reines Ladekabel reicht dafür nicht.
- Tablet mit aktuellem Browser für Betreuung oder große Ampel.
- Passende 13,56-MHz-Karten, deren UID der WS1850S lesen kann; zunächst mit wenigen Karten testen, bevor ihr alle beschriftet oder kauft.
- M5Stack RFID2 Unit (WS1850S, U031-B) am **Port A**, mit passendem Grove-Kabel. Vor dem Anstecken die Stromversorgung trennen. In der Tischkonsole ist sie fest unter der Kartenfläche eingebaut: [hardware/gehaeuse](hardware/gehaeuse/README.md) (3D-Druck).
- Für den späteren Betrieb eine zuverlässige USB-Stromversorgung. Bei einer Powerbank prüfen, ob sie bei der geringen Last eingeschaltet bleibt.

Nach dem Aufspielen läuft die Buchungslogik auf dem Dial. Der PC wird im Alltag nicht gebraucht. Das Dial stellt sein eigenes WLAN und die Webseiten bereit; Internet und zusätzliche Router sind dafür nicht nötig. Das Tablet ist Anzeige und Bedienung, der Dial speichert den Bestand.

## 1 · Software per USB aufspielen

1. `Mensaampel_Dial_Vorbereitung.zip` vollständig in einen beschreibbaren Ordner entpacken.
2. Am Dial die rückseitige **G0-Taste gedrückt halten**, das USB-Datenkabel mit dem PC verbinden und G0 loslassen. Das versetzt das Gerät in den Übertragungsmodus.
3. `Dial-Installieren.cmd` doppelt anklicken. Der mitgelieferte Helfer benötigt keine separat installierte Python- oder Programmierumgebung.
4. Den passenden USB-Anschluss auswählen. Falls keiner erscheint: Datenkabel, G0-Modus und „Aktualisieren“ prüfen.
5. Beim ersten Mal **Erstinstallation** auswählen. Dabei werden die bisherige Software, Einstellungen und Daten auf dem Dial gelöscht. Der Helfer fragt dies ausdrücklich ab. Bereits vorhandene Daten vorher sichern.
6. Gerät und Vorgang im Kontrollkästchen bestätigen und **Software übertragen** wählen. Währenddessen USB verbunden lassen.
7. Nach „Fertig“ nötigenfalls RST drücken oder USB neu verbinden. Auf dem Display erscheinen WLAN-Name, WLAN-Kennwort und Einrichtungscode.

**Notfallweg, falls der Helfer abbricht:** Im entpackten Ordner in die Adresszeile des Explorers `cmd` tippen und Enter drücken. Dann diesen Befehl eingeben (statt `COM3` den im Helfer angezeigten Anschluss):

```
tools\mensa-flash.exe --chip esp32s3 --port COM3 --baud 460800 write_flash --flash_size 8MB 0x0 firmware\first-install.bin
```

Erfolgreich, wenn am Ende „Hash of data verified.“ steht. Bei „Failed to connect“: USB abziehen, G0-Modus neu starten, Befehl wiederholen.

Der Übertragungshelfer wurde zuerst ohne angeschlossenes Gerät geprüft; bei der ersten echten Installation meldete er nach dem Löschen fälschlich einen Fehler (inzwischen behoben). Die erste tatsächliche USB-Übertragung ist Teil des Hardwaretests. Das Programm ist nicht digital signiert. Sicherheitsrichtlinien eines Schul-PCs gegebenenfalls mit der zuständigen IT klären.

## 2 · Tablet verbinden und Zugang einrichten

1. In den WLAN-Einstellungen des Tablets das auf dem Dial angezeigte Netz auswählen und dessen WLAN-Kennwort eingeben.
2. Falls das Tablet „Kein Internet“ meldet: für diesen Betrieb mit dem Netz verbunden bleiben. Automatisches Wechseln auf ein anderes WLAN würde die Ampel trennen.
3. Im Browser ausdrücklich **http://192.168.4.1** öffnen.
4. Mit dem Einrichtungscode vom Dial anmelden. Unter **Gerät → WLAN und Zugang** ein eigenes Betreuungskennwort mit mindestens zehn Zeichen festlegen, wiederholen und speichern.
5. WLAN-Name und WLAN-Kennwort können ebenfalls geändert werden. Eine WLAN-Änderung startet den Dial neu; anschließend das Tablet neu verbinden.

Die Betreuung ist kennwortgeschützt. Die Kinderansicht unter **http://192.168.4.1/ampel** zeigt ausschließlich den Ampelstatus und benötigt keine Anmeldung. Nur vertrauenswürdige Geräte ins Mensa-WLAN aufnehmen; das lokale Webinterface verwendet HTTP im kennwortgeschützten WLAN. Ein neues Anmelden beendet die vorherige Betreuungssitzung. Betreuung und Kinderampel können gleichzeitig geöffnet sein.

## 3 · Internen oder externen Leser auswählen

Unter **Gerät → Kartenleser** wählen:

| Auswahl | Anschluss |
|---|---|
| **Automatisch (empfohlen, Standard)** | Externe RFID2 Unit an Port A, sobald sie antwortet; sonst der eingebaute Leser |
| Intern im M5Stack Dial | Eingebauter Leser; kein Zusatzgerät |
| Extern: RFID2 an Port A | Externe RFID2 Unit am Port A |

**Automatisch:** Beim Start und danach alle 5 Sekunden (wenn gerade keine Karte aufliegt) prüft das Dial, ob an Port A ein Leser antwortet, und schaltet selbst um. Fällt der externe Leser aus oder wird abgezogen, arbeitet das Dial ohne Störung mit dem internen Leser weiter. Das Dial meldet „Externer Leser aktiv“ bzw. „Interner Leser aktiv“; unter Gerät steht, welcher Leser gerade aktiv ist. Der Bestand bleibt dabei unverändert. Port A laut Hersteller nur **stromlos** umstecken.

**Auswahl speichern und Leser prüfen** drücken. Die Einstellung bleibt nach dem Ausschalten erhalten. Beim Wechsel wird der Einlass gesperrt und der Bestand muss erneut bestätigt werden. Es ist kein erneutes Aufspielen der Software erforderlich.

Im externen Modus wird das interne RFID-Feld abgeschaltet und dessen Abschaltung überwacht. Ein fehlender oder nicht erreichbarer Leser führt zu Rot. Nach dem Einschalten oder Wechsel den Leser etwa eine Sekunde frei lassen. Ein Leserfehler oder eine Lesepause gilt nicht als bestätigtes Entfernen einer Karte.

Die echte Funkstabilität muss mit Tablet und Karten geprüft werden. Interner RFID-Leser und WLAN nutzen unterschiedliche Frequenzen; dennoch sind beim Dial Berichte über gegenseitige Störungen bekannt. Eine externe Unit ist eine prüfbare Alternative, keine bereits nachgewiesene Garantie.

## 4 · Karten einmalig zuordnen

**Am schnellsten: Karten am Stück einlernen.** Unter **Betreuung → Karten am Stück einlernen** „Küche“ oder „Mensa“ starten. Das Dial zeigt groß die nächste freie Nummer (z. B. „K07“). Karte vorhalten → sie gehört nun zu K07 → mit dem passenden Etikett bekleben (aus dem **Etiketten-Tool**, siehe unten). Das Dial springt selbst weiter. Taste = Nummer überspringen, 3 s halten = Ende. Doppelte Karten werden erkannt, gebucht wird nichts. Der Einzelweg unten bleibt für Nachträge.

Die Nummern **K01–K48** und **M01–M64** sind vorbereitet. Auf einem echten Gerät zählen noch nicht zugeordnete Nummern zunächst nicht als verfügbare Karten.

1. Unter **Gerät → Platzkarten zuordnen** beispielsweise K01 auswählen.
2. **Echte Karte einlernen** drücken. Die Einlasspause wird eingeschaltet.
3. Leser freihalten, dann genau eine Karte vorhalten. Ihre Kennung erscheint in der Oberfläche.
4. **Zuordnung speichern** drücken. Beim Einlernen erfolgt keine Platzbuchung.
5. Karte passend mit K01 beschriften. Die Auswahl springt zur nächsten Nummer. Den Ablauf für weitere Karten wiederholen.
6. Zum Schluss unter **Betreuung** den Bestand prüfen und bestätigen; eine bestehende Einlasspause ausdrücklich beenden.

Für den ersten Test genügen z. B. zwei Küchen- und zwei Mensakarten. Die maximal mögliche Ausgabe ergibt sich sowohl aus Raumfreigabe als auch verfügbaren zugeordneten Karten. Zusätzliche Kartennummern vergrößern die Raumkapazität nicht automatisch.

### Etiketten drucken

`Etiketten-Tool.html` am PC im Browser öffnen (funktioniert ohne Internet):

1. **Bogen wählen.** Empfohlen: Avery Zweckform **3474** (70 × 37 mm, 24 pro A4). Das Etikett passt mit Rand auf die Karte. Weitere Bögen, kartengroße und runde Etiketten oder eigene Maße sind möglich.
2. **Testseite** auf Normalpapier drucken, auf den Etikettenbogen legen und gegen das Licht halten. Bei Bedarf „nach rechts / nach unten“ verschieben. Das rote Lineal muss genau 10 cm lang sein. Die Einstellung bleibt im Browser gespeichert.
3. **Karten wählen:** Küche K01–K48, Mensa M01–M64 oder einzelne Ersatzkarten (z. B. `K03, M10-M12`). Bei einem angefangenen Bogen in der Vorschau die schon benutzten Felder anklicken.
4. **Aussehen:** Tiere, Monster & Weltraum, Gemischt oder Schlicht. Jede Nummer hat immer dasselbe Motiv, auch beim Nachdruck. So finden auch Kinder, die noch nicht sicher lesen, ihre Karte wieder.
5. **Drucken:** im Druckdialog **„Tatsächliche Größe / 100 %“** und **„Ränder: keine“** wählen.

## 5 · So läuft der Mittag

- Nach dem Einschalten den tatsächlichen Bestand prüfen und **Bestand bestätigen** (Taste 3 s halten). Ausnahme: Ein kurzer Neustart am selben Tag (z. B. Stecker kurz raus) übernimmt den heute schon bestätigten Bestand, sobald die Uhr gelesen ist; ein laufender Gruppen-Countdown läuft dann weiter. Es wird nichts automatisch auf null gesetzt.
- Die Küche hat zunächst 48 Plätze; die Mensa bleibt für das freie Essen geschlossen. Die 61 begleiteten Kinder werden nicht einzeln gebucht.
- Karte vorhalten: verfügbare Karte wird ausgegeben. Dieselbe Karte später erneut vorhalten: Rückgabe.
- Nach einer erfolgreichen Buchung gelten zehn Sekunden Sperre für diese Karte. Andere Karten bleiben nutzbar. Dauerhaftes Vorhalten erzeugt keine zweite Buchung.
- Eine Karte nach dem Vorhalten entfernen; für die sichere Entfernungserkennung etwa eine Sekunde Abstand zwischen Karten lassen. Eine in der Sperrzeit abgewiesene Buchung wird nicht später nachgeholt.
- **Einlass pausieren** stoppt Ausgaben, lässt Rückgaben zu. Ein kurzer Tastendruck am Dial schaltet die Pause ebenfalls um.
- Tatsächlich freie Mensaplätze später unter **Betreuung → Mensa → Anpassen** teilweise oder vollständig freigeben.
- Eine verlorene ausgegebene Karte bleibt belegt, bis der Platz geprüft und die Karte manuell korrigiert wurde.
- **Karten, die am Tagesende fehlen,** werden beim neuen Essenstag als verloren **gesperrt** (sie zählen nicht als freie Plätze). Taucht eine Karte wieder auf, einfach ans Dial halten: „K07 ist wieder da und frei“. Alternativ am Tablet unter „Gesperrte Karten“ → „gefunden“.
- Ein erneuter Scan nach Ablauf der Sperrzeit zählt als Gegenbuchung, auch wenn er versehentlich war. Dann „Letzte Buchung rückgängig“ oder gezielt „Bearbeiten“ verwenden.
- **Neuer Essenstag:** startet mit eingestellter Uhrzeit von selbst (frühestens 30 Minuten nach dem letzten Scan, am nächsten Kalendertag). Sind noch Karten draußen, wartet das Dial stattdessen auf eine Person: „Neuer Tag? Taste 3 s halten“. Am Tablet geht es jederzeit über „Neuer Essenstag“. Belegungen werden zurückgesetzt, fehlende Karten gesperrt, die Mensa wieder geschlossen. Tage ohne ein einziges Essen (Wochenende, Ferien) zählen nicht im Tagesbericht.
- **Erinnerung:** Wartet eine Pause, Entlastung oder volle Gruppe länger als 3 Minuten auf jemanden, piept das Dial kurz und zeigt z. B. „Noch Pause? Taste: weiter“ (einstellbar unter Einstellungen, auch „aus“).

## 6 · Große Ampel anzeigen

Auf dem Tablet **Ampel öffnen** und bei Bedarf **Vollbild** wählen. Grün bedeutet: betriebsbereit, keine Pause und mindestens eine verfügbare Karte für einen freigegebenen Platz. Bei Pause, vollem Bestand oder Störung erscheint Rot.

Nach mehr als drei Sekunden ohne erfolgreiche Statusmeldung schaltet die laufende Browseranzeige auf Rot. Das gilt nicht für einen eingefrorenen Browser oder ausgeschalteten Bildschirm: Energiesparen und automatische Bildschirmsperre für euren Einsatz passend einstellen und testen. Die getrennte Ampel sollte vor dem Mensaeingang sichtbar sein.

### iPad als Ampel einrichten (einmalig)

Auf dem iPad braucht es keine Zusatz-App: Die eingebaute Funktion **„Geführter Zugriff“** sperrt das iPad auf die Ampelseite (Kiosk-Betrieb).

1. **WLAN:** Einstellungen → WLAN → dem WLAN des Dial beitreten (Name und Kennwort zeigt das Dial nach 3 s Halten), **„Automatisch verbinden“ an**. Beim **Schul-WLAN** auf diesem iPad **„Automatisch verbinden“ aus** – das Dial-WLAN hat kein Internet, sonst wechselt das iPad gern zurück.
2. **Ampelseite:** Safari → `http://192.168.4.1/ampel` → Teilen → **„Zum Home-Bildschirm“**.
3. **Bildschirm immer an:** Einstellungen → Anzeige & Helligkeit → **Automatische Sperre: Nie**. Einstellungen → Batterie → **Stromsparmodus aus**. Im Kontrollzentrum **Fokus „Nicht stören“** einschalten (keine Mitteilungen).
4. **Geführten Zugriff vorbereiten:** Einstellungen → Bedienungshilfen → **Geführter Zugriff an** → **Code-Einstellungen**: Code festlegen, den nur die Betreuung kennt → **Anzeige-Autosperre: Nie**.

**Jeden Tag bzw. nach einem Neustart des iPads:**

1. Ampelseite öffnen, **„Vollbild“** tippen.
2. **Dreimal schnell die obere Taste** drücken (iPads mit Home-Taste: Home-Taste).
3. Unter „Optionen“ **Tasten aus**, Berührung an lassen → **„Starten“**.
4. Ist „Ton an“ gewählt: **einmal auf den Bildschirm tippen** (die Ampel zeigt dazu einen Hinweis) – Browser erlauben Töne erst nach einer Berührung.

**Beenden:** wieder dreimal die Taste drücken, Code eingeben, „Beenden“. Das iPad **am Ladekabel lassen**. Nach einem iPad-Neustart ist der Geführte Zugriff aus und muss neu gestartet werden.

Verwaltet die Schul-IT die iPads zentral (MDM), kann sie das iPad fest im **„Einzel-App-Modus“** auf Safari sperren; dann startet es auch nach einem Neustart von selbst so. Für ein Android-Tablet eignet sich stattdessen eine Kiosk-App wie „Fully Kiosk Browser“.

**Uhr:** Das Dial hat eine eingebaute Uhr (RTC). Sie wird automatisch von jedem angemeldeten Tablet gestellt. Ist sie nach einem langen Stromausfall leer, übernimmt das Dial die Uhrzeit auch von der Ampel-Seite; bis dahin steht am Dial „Uhr nicht gestellt“.

Meldet sich eine Minute nach dem Bestätigen noch keine Ampel, zeigt das Dial „Ampel nicht verbunden!“.

## 7 · Sicherung, Zugang und Updates

**Bestand sichern:** Unter Gerät die JSON-Sicherung herunterladen – spätestens direkt nach dem Einlernen der Karten und danach etwa alle zwei Wochen (das Tablet erinnert daran). Sie enthält Kartenzuordnungen, Belegungen, Einstellungen und Lernwerte, keine Zugangskennwörter. Mit „Sicherung einspielen“ lässt sie sich wiederherstellen, z. B. auf einem Ersatzgerät; danach den Bestand bestätigen.

**WLAN anzeigen:** Taste am Dial drei Sekunden halten und loslassen (ein weißer Ring zeigt den Fortschritt). Die Zugangsdaten werden 30 Sekunden angezeigt; ein kurzer Druck schließt die Anzeige, ohne etwas anderes auszulösen. **WLAN-Kanal** (1, 6 oder 11) unter Gerät → Geräteeinstellungen wählen, falls das WLAN in der Schule durch Nachbarnetze gestört wird.

**Betreuungskennwort vergessen:** Taste zehn Sekunden halten, loslassen und die Rückfrage zur Sicherheit mit **nochmal 3 Sekunden Halten** bestätigen (ein kurzer Druck bricht ab). Danach erscheint ein neuer Einrichtungscode. Der Kartenbestand bleibt erhalten. Dies setzt den Betreuungszugang zurück; bei gültiger Konfiguration bleibt das WLAN-Kennwort unverändert.

**Update:** Bestand vorher sichern. Im Installationshelfer „Update“ wählen. Der Helfer liest zunächst das Speicherlayout aus; bei Abweichung bricht er ab, ohne die Firmware zu schreiben. Bei passendem Layout wird nur die Programmdatei aktualisiert. Die Option ist für die bereits installierte Mensaampel vorgesehen. Am besten nach dem Mittag updaten; am selben Tag bleibt der Bestand danach bestätigt, sonst einmal bestätigen.

**Update für den Hausmeister in Kürze:** 1. Tablet: Sicherung herunterladen. 2. Dial per USB-Datenkabel an den Windows-PC. 3. Neue `Mensaampel_Dial_Vorbereitung.zip` entpacken, `Dial-Installieren.cmd` starten, „Update“ wählen. 4. Warten, bis das Dial neu startet. 5. Am Tablet unter Gerät die Version prüfen. Ein erstmaliger oder fremder Geräteinhalt gehört nicht in den Updatepfad.

**Speicherstörung:** Der Einlass bleibt gesperrt. Bei einem vorübergehenden Schreibfehler kann „Speicherung prüfen“ helfen. Bei beschädigten oder unterbrochenen Bestandsdateien zuerst alle tatsächlichen Belegungen abgleichen, nötige Korrekturen unter Betreuung vornehmen und erst danach unter Gerät ausdrücklich übernehmen. Die Software formatiert den Speicher niemals selbstständig. Bei einer wiederholten Beschädigung ist eine technische Prüfung nötig; nicht durch Erstinstallation den ungeklärten Bestand löschen.

## Abnahme am echten Gerät

| Prüfung | Erwartung | Erledigt |
|---|---|---|
| Erstinstallation und Tablet-Einrichtung | Display und Oberfläche erreichbar | ☐ |
| Intern und optional extern auswählen | Gewählter Leser funktioniert; Auswahl bleibt nach Neustart | ☐ |
| Zwei Karten einlernen | Richtige Nummern, keine Platzbuchung | ☐ |
| Ausgabe / Rückgabe | Genau eine Änderung; gesicherter Bestand | ☐ |
| Karte mindestens 20 Sekunden vorhalten | Keine zweite Buchung | ☐ |
| Erneut bei 5 und nach 10 Sekunden vorhalten | Erst abgewiesen, später Gegenbuchung | ☐ |
| Andere Karte während Sperre | Sofort verwendbar nach bestätigter Entfernung | ☐ |
| Mensa gesperrt / teilweise offen / Pause | Regeln und Ampel stimmen | ☐ |
| Tablet-WLAN trennen | Ampel nach drei Sekunden ohne Status rot | ☐ |
| Leser abziehen / wieder anschließen | Störung rot; keine Phantom-Rückgabe | ☐ |
| Strom nach bestätigter Buchung trennen | Belegung bleibt; am selben Tag bleibt der Bestand bestätigt und der Countdown läuft weiter | ☐ |
| Tagesstart mit einer nicht zurückgegebenen Karte | Dial wartet („Neuer Tag? 3 s halten“), Karte danach gesperrt, Scan gibt sie frei | ☐ |
| Ring um eine Raste anstoßen | Mensa-Einstellung öffnet sich nicht | ☐ |
| Taste halten | Weißer Fortschrittsring, nach 3 s „Loslassen“ | ☐ |
| Strom während Speichern unterbrechen, nur Testbestand | Kein unbemerkter Neustart mit falschem Bestand | ☐ |
| Update des Testgeräts | Kartenzuordnungen und Einstellungen bleiben | ☐ |
| Mindestens ein kompletter Mittag als Probelauf | WLAN, Scans, Stromversorgung und Speicher stabil | ☐ |

Offene Hardwaremessungen: Lesefeld und Reichweite, Reaktionszeit beim Speichern, tatsächliche Speicherreserven mit allen 112 Karten, gleichzeitiger WLAN-/RFID-Betrieb und Stromausfallverhalten. Softwaretests ersetzen diese Prüfung nicht.

## Herstellerunterlagen

- [M5Stack Dial v1.1](https://docs.m5stack.com/en/core/M5Dial%20V1.1)
- [RFID2 Unit und Anschluss](https://docs.m5stack.com/en/unit/rfid2)
- [Übertragungsmodus des Dial](https://docs.m5stack.com/en/arduino/m5dial/program)
- [Erfahrungsbericht zu WLAN und RFID](https://community.m5stack.com/topic/6628/m5dial-wifi-not-work-when-rfid-is-enabled)

## Bedienung im Alltag (Stand 0.8)

Ausführlich und mit echten Bildschirmbildern in [BEDIENUNG-DIAL.html](BEDIENUNG-DIAL.html) bzw. `BEDIENUNG-DIAL.pdf`. Die Kurzkarte `DIAL-KURZKARTE.pdf` (zwei Karten pro A4-Seite) neben das Dial kleben. Dieselben Inhalte stehen am Tablet unter **Hilfe**.

**Anzeige:** Der ganze Bildschirm leuchtet grün (Platz frei), gelb (fast voll) oder rot (Einlass zu). Große Schrift zeigt den Zustand, darunter die freien Plätze „K 45 M 0“ (Küche/Mensa). Wartet die Automatik auf die nächste Gruppe, läuft ein schwarzer Ring am Rand ab („Weiter in 0:42“). Rückmeldungen und Hinweise erscheinen im schwarzen Feld unten.

| Handgriff | Wirkung |
|---|---|
| Taste (Dial-Front drücken) kurz | Grün: Pause · Pause/Entlastung: weiter · Countdown: nächste Gruppe sofort · Mensa-Einstellung: übernehmen |
| Taste 3 s halten | Bestand unbestätigt: bestätigen · sonst WLAN-Daten |
| Taste 10 s halten | Zugang zurücksetzen (mit kurzem Druck bestätigen) |
| Ring drehen | Mensaplätze einstellen (0 = sperren), Taste übernimmt, 15 s ohne Eingabe = Abbruch |
| Fläche „ENTLASTEN“ | Einlass sofort stoppen, weil die Ausgabe zu voll ist |

**Automatik, Startgruppe, Tagesstart:** unter **Einlass & Messungen → Automatik** am Tablet. Einzelheiten in [Einlass und Messungen](EINLASS-UND-MESSUNGEN.md). Der automatische neue Essenstag setzt nur zurück, wenn mindestens 30 Minuten nicht gescannt wurde – eine falsch gehende Uhr kann so nicht mitten im Mittag zurücksetzen.

**Uhrzeit:** Die angemeldete Betreuungsansicht stellt die Dial-Uhr automatisch nach, wenn sie mehr als 2 Minuten abweicht (auch nach der Zeitumstellung). Einmal im Monat kurz die Betreuungsseite öffnen genügt.

**Lautstärke:** Betreuung → Einstellungen (0 = stumm). **Gong an der Ampel:** Auf dem Ampel-Tablet unten „Ton an“ tippen; beim Wechsel auf Grün klingt ein kurzer Gong.

**Warnungen am Dial:** „Ampel draussen getrennt!“ (Ampel-Tablet fragt nicht mehr nach), „2 Karten fehlen“ (20 Minuten kein Scan, aber Karten ausgegeben), „Stoerung“ (Leser oder Speicher).

**Sicherung:** unter Gerät herunterladen und wieder einspielen (enthält auch Lernwerte und Tagesberichte, keine Kennwörter). **Tagesbericht:** unter Einlass & Messungen, als CSV.

### Zusätzlich am echten Gerät prüfen (0.8)

| Prüfung | Erwartung | Erledigt |
|---|---|---|
| Taste = Dial-Front drücken | kurz / 3 s / 10 s wie beschrieben | ☐ |
| Drehring | eine Raste = eine Platzzahl, Richtung sinnvoll | ☐ |
| Lesbarkeit aus 1–2 m | Farbe und große Schrift erkennbar | ☐ |
| Anzeige ohne Flackern | Bildwechsel ruhig (Zwischenspeicher aktiv) | ☐ |
| Uhr nach Stromlosigkeit | Uhrzeit bleibt oder wird beim Öffnen der Betreuung nachgestellt | ☐ |
| Ampel-Tablet ausschalten | nach 10 s „Ampel draussen getrennt!“ am Dial | ☐ |

## Neu in 0.10

- **0.10.2:** Größerer Arbeitsbereich (Stack) für das Speichern – die erste Speicherung nach der Anmeldung konnte das Dial neu starten. „Blackbox“: Nach einem Fehler-Neustart zeigt das Dial eine Minute lang, wobei es passiert ist (z. B. „Fehler: Befehl clockSync“).
- **0.10.1:** Behebt einen Neustart des Dial beim ersten Anmelden am Tablet (Arbeitsspeicher war zu knapp: Bildpuffer jetzt in Streifen, Kartenliste speichersparend). Unter Gerät stehen jetzt „Letzter Start“ (z. B. „Absturz“) und der größte freie Speicherblock; nach einem Fehler-Neustart zeigt das Dial kurz den Grund.
- **Etiketten-Tool** (`Etiketten-Tool.html`): bunte Etiketten mit Tieren oder Monstern & Weltraum, passend für gängige Etikettenbögen, mit Testseite (siehe Abschnitt 4).
- **Tagesstart sicherer:** nach Kalenderdatum statt nur Wochentag; wartet bei Karten draußen auf eine Person; fehlende Karten werden gesperrt und per Scan wieder frei; Wochenenden zählen nicht im Tagesbericht. Die Uhr wird auch mit laufender Gruppe gestellt (vorher konnte der automatische Tagesstart nach einer angebrochenen letzten Gruppe ausfallen).
- **Neustart mitten im Mittag:** Bestand bleibt am selben Tag bestätigt, Countdown läuft weiter; 30-Minuten-Schutz zählt ab Neustart.
- **Bedienung:** Eine einzelne Raste am Ring öffnet die Mensa nicht mehr; ein Tastendruck direkt beim Drehen speichert nicht aus Versehen; Fortschrittsring beim Halten; Zurücksetzen nur mit zweitem langen Halten; das Touch-Feld wirkt in Menü, Einlernen und Mensa-Einstellung wie die Taste; Erinnerungs-Piep bei langer Pause.
- **Wartung:** Sicherungs-Erinnerung am Tablet, WLAN-Kanal wählbar, Ampel-Warnung auch wenn sich nach dem Start nie eine Ampel meldet, Ton-Hinweis auf der Ampel nach dem Neuladen.

## Neu in 0.9

- **Leser automatisch** (siehe Abschnitt 3), **Karten am Stück einlernen** (Abschnitt 4), **Kartenetiketten** zum Drucken.
- **Betreuerkarte:** unter Betreuung → Einstellungen „Neue Betreuerkarte einlernen“ und die Karte ans Dial halten (bis zu 5). Vorgehalten öffnet sie das Menü **BETREUUNG**: Bestand ok · Pause/Weiter · Mensa freigeben · Abbrechen (Ring = Auswahl, Taste = ausführen, Karte erneut = schließen). Sie bucht keinen Platz. Kein Sicherheitsschlüssel: Die Kartenkennung ist kopierbar, das Menü kann nur Alltagsaktionen.
- **Gerätetest:** unter Gerät „Gerätetest starten“. Das Dial zeigt Leser, Kartenkennung, Lesungen, Drehring, Taste/Touch, Tablets, Speicher und Uhr; Scans buchen nicht. Darunter eine Checkliste für die Abnahme (auf dem Tablet gespeichert, als CSV exportierbar).
- **Statistik:** Diagramme im Tagesbericht (Kinder pro Tag, Eingriffe, gelernte Sekunden pro Kind).

### Welche Karten kaufen?

Der Leser (WS1850S, 13,56 MHz, ISO 14443A) liest nur die Kartenkennung. Es reichen günstige **MIFARE Classic 1K**-Karten (ca. 0,50–0,70 € im 100er-Pack); NTAG213 geht auch. Farbige Karten (z. B. blau/rot) oder Karten mit Schlitz für eine Hakenleiste sind praktisch. **Zuerst 5–10 Stück am echten Dial testen.** Beispiele (ohne Gewähr): [Varius Card](https://www.variuscard.com/shop/de/chipkarten-nxp-mifare-classic-1k-ev1-4bnuid.html), [primacards](https://www.primacards.de/rfid-karten-mifare-classic-1k-1356-mhz-100.html), [Böttcher AG (Rechnungskauf)](https://www.bueromarkt-ag.de/rfid-karte_nxp_mifare_classic_1k_100_stueck,p-card12826.html), [ausweisshop farbig](https://ausweisshop.com/produkt/mifare-classic-1k-rfid-karte-farbig/), [mychip24 Schlüsselanhänger](https://mychip24.de/rfid-transponderanhaenger/17/13-56mhz-mifare-classic-1k-rfid-schluesselanhaenger).
