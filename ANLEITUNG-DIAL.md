# Mensaampel auf dem M5Stack Dial

**Vorbereitete Geräteversion 0.6.0-preview · Stand 26.09.2026**

Die Software, Tabletoberfläche und Windows-Übertragung sind vorbereitet. Der Gerätecode wurde erfolgreich für ESP32-S3 übersetzt. Die Erprobung an einem echten Dial steht noch aus. Dieses Paket ist für euren ersten begleiteten Hardwaretest vorgesehen.

## Was du brauchst

- M5Stack Dial v1.1.
- Windows-PC zum einmaligen Aufspielen und ein USB-C-**Datenkabel**. Ein reines Ladekabel reicht dafür nicht.
- Tablet mit aktuellem Browser für Betreuung oder große Ampel.
- Passende 13,56-MHz-Karten, deren UID der WS1850S lesen kann; zunächst mit wenigen Karten testen, bevor ihr alle beschriftet oder kauft.
- Optional: M5Stack RFID2 Unit (WS1850S, U031-B) am **Port A**, mit passendem Grove-Kabel. Vor dem Anstecken die Stromversorgung trennen.
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

Der Übertragungshelfer wurde ohne angeschlossenes Gerät geprüft. Die erste tatsächliche USB-Übertragung ist Teil des Hardwaretests. Das Programm ist nicht digital signiert. Sicherheitsrichtlinien eines Schul-PCs gegebenenfalls mit der zuständigen IT klären.

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
| Intern im M5Stack Dial | Eingebauter Leser; kein Zusatzgerät |
| Extern: RFID2 an Port A | Externe RFID2 Unit am Port A |

**Auswahl speichern und Leser prüfen** drücken. Die Einstellung bleibt nach dem Ausschalten erhalten. Beim Wechsel wird der Einlass gesperrt und der Bestand muss erneut bestätigt werden. Es ist kein erneutes Aufspielen der Software erforderlich.

Im externen Modus wird das interne RFID-Feld abgeschaltet und dessen Abschaltung überwacht. Ein fehlender oder nicht erreichbarer Leser führt zu Rot. Nach dem Einschalten oder Wechsel den Leser etwa eine Sekunde frei lassen. Ein Leserfehler oder eine Lesepause gilt nicht als bestätigtes Entfernen einer Karte.

Die echte Funkstabilität muss mit Tablet und Karten geprüft werden. Interner RFID-Leser und WLAN nutzen unterschiedliche Frequenzen; dennoch sind beim Dial Berichte über gegenseitige Störungen bekannt. Eine externe Unit ist eine prüfbare Alternative, keine bereits nachgewiesene Garantie.

## 4 · Karten einmalig zuordnen

Die Nummern **K01–K48** und **M01–M64** sind vorbereitet. Auf einem echten Gerät zählen noch nicht zugeordnete Nummern zunächst nicht als verfügbare Karten.

1. Unter **Gerät → Platzkarten zuordnen** beispielsweise K01 auswählen.
2. **Echte Karte einlernen** drücken. Die Einlasspause wird eingeschaltet.
3. Leser freihalten, dann genau eine Karte vorhalten. Ihre Kennung erscheint in der Oberfläche.
4. **Zuordnung speichern** drücken. Beim Einlernen erfolgt keine Platzbuchung.
5. Karte passend mit K01 beschriften. Die Auswahl springt zur nächsten Nummer. Den Ablauf für weitere Karten wiederholen.
6. Zum Schluss unter **Betreuung** den Bestand prüfen und bestätigen; eine bestehende Einlasspause ausdrücklich beenden.

Für den ersten Test genügen z. B. zwei Küchen- und zwei Mensakarten. Die maximal mögliche Ausgabe ergibt sich sowohl aus Raumfreigabe als auch verfügbaren zugeordneten Karten. Zusätzliche Kartennummern vergrößern die Raumkapazität nicht automatisch.

## 5 · So läuft der Mittag

- Nach jedem Neustart den tatsächlichen Bestand prüfen und **Bestand bestätigen**. Es wird nichts automatisch auf null gesetzt.
- Die Küche hat zunächst 48 Plätze; die Mensa bleibt für das freie Essen geschlossen. Die 61 begleiteten Kinder werden nicht einzeln gebucht.
- Karte vorhalten: verfügbare Karte wird ausgegeben. Dieselbe Karte später erneut vorhalten: Rückgabe.
- Nach einer erfolgreichen Buchung gelten zehn Sekunden Sperre für diese Karte. Andere Karten bleiben nutzbar. Dauerhaftes Vorhalten erzeugt keine zweite Buchung.
- Eine Karte nach dem Vorhalten entfernen; für die sichere Entfernungserkennung etwa eine Sekunde Abstand zwischen Karten lassen. Eine in der Sperrzeit abgewiesene Buchung wird nicht später nachgeholt.
- **Einlass pausieren** stoppt Ausgaben, lässt Rückgaben zu. Ein kurzer Tastendruck am Dial schaltet die Pause ebenfalls um.
- Tatsächlich freie Mensaplätze später unter **Betreuung → Mensa → Anpassen** teilweise oder vollständig freigeben.
- Eine verlorene ausgegebene Karte bleibt belegt, bis der Platz geprüft und die Karte manuell korrigiert wurde.
- Ein erneuter Scan nach Ablauf der Sperrzeit zählt als Gegenbuchung, auch wenn er versehentlich war. Dann „Letzte Buchung rückgängig“ oder gezielt „Bearbeiten“ verwenden.
- **Neuer Essenstag** wird ausdrücklich gestartet. Dabei werden Belegungen zurückgesetzt, Verlustmarkierungen bleiben erhalten und die Mensa wird wieder gesperrt.

## 6 · Große Ampel anzeigen

Auf dem Tablet **Ampel öffnen** und bei Bedarf **Vollbild** wählen. Grün bedeutet: betriebsbereit, keine Pause und mindestens eine verfügbare Karte für einen freigegebenen Platz. Bei Pause, vollem Bestand oder Störung erscheint Rot.

Nach mehr als drei Sekunden ohne erfolgreiche Statusmeldung schaltet die laufende Browseranzeige auf Rot. Das gilt nicht für einen eingefrorenen Browser oder ausgeschalteten Bildschirm: Energiesparen und automatische Bildschirmsperre für euren Einsatz passend einstellen und testen. Die getrennte Ampel sollte vor dem Mensaeingang sichtbar sein.

## 7 · Sicherung, Zugang und Updates

**Bestand sichern:** Unter Gerät die JSON-Sicherung herunterladen. Sie enthält Kartenzuordnungen und Belegungen, keine Zugangskennwörter. Derzeit ist dies eine Sicherung zur Kontrolle und technischen Wiederherstellung; ein automatischer Importknopf ist noch nicht enthalten.

**WLAN anzeigen:** Taste am Dial drei Sekunden halten und loslassen. Die Zugangsdaten werden vorübergehend angezeigt.

**Betreuungskennwort vergessen:** Taste zehn Sekunden halten, loslassen und die Rückfrage mit einem kurzen Druck bestätigen. Danach erscheint ein neuer Einrichtungscode. Der Kartenbestand bleibt erhalten. Dies setzt den Betreuungszugang zurück; bei gültiger Konfiguration bleibt das WLAN-Kennwort unverändert.

**Update:** Bestand vorher sichern. Im Installationshelfer „Update“ wählen. Der Helfer liest zunächst das Speicherlayout aus; bei Abweichung bricht er ab, ohne die Firmware zu schreiben. Bei passendem Layout wird nur die Programmdatei aktualisiert. Die Option ist für die bereits installierte Mensaampel vorgesehen. Nach Neustart ist erneut eine Bestandsbestätigung erforderlich. Ein erstmaliger oder fremder Geräteinhalt gehört nicht in den Updatepfad.

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
| Strom nach bestätigter Buchung trennen | Belegung bleibt, Einlass fordert Bestätigung | ☐ |
| Strom während Speichern unterbrechen, nur Testbestand | Kein unbemerkter Neustart mit falschem Bestand | ☐ |
| Update des Testgeräts | Kartenzuordnungen und Einstellungen bleiben | ☐ |
| Mindestens ein kompletter Mittag als Probelauf | WLAN, Scans, Stromversorgung und Speicher stabil | ☐ |

Offene Hardwaremessungen: Lesefeld und Reichweite, Reaktionszeit beim Speichern, tatsächliche Speicherreserven mit allen 112 Karten, gleichzeitiger WLAN-/RFID-Betrieb und Stromausfallverhalten. Softwaretests ersetzen diese Prüfung nicht.

## Herstellerunterlagen

- [M5Stack Dial v1.1](https://docs.m5stack.com/en/core/M5Dial%20V1.1)
- [RFID2 Unit und Anschluss](https://docs.m5stack.com/en/unit/rfid2)
- [Übertragungsmodus des Dial](https://docs.m5stack.com/en/arduino/m5dial/program)
- [Erfahrungsbericht zu WLAN und RFID](https://community.m5stack.com/topic/6628/m5dial-wifi-not-work-when-rfid-is-enabled)

## Neu: Einlassgruppen, Gelb und Messungen

Unter **Einlass & Messungen** stehen Gelbgrenze, begrenzte Einlassgruppen sowie Einzel- und Gruppenmessungen zur Verfügung. Startwert Gelb: fünf freie Plätze. Gruppenbegrenzung zunächst aus (0); beispielsweise auf fünf setzen und Einlass anschließend bewusst fortsetzen. Die Messungen bedient ihr am verbundenen Tablet. Einzelheiten: [Einlass und Messungen](EINLASS-UND-MESSUNGEN.md).

Auf dem Dial zeigt ein Kreis Grün, Gelb oder Rot mit kurzem Text. Ein kurzer Druck pausiert beziehungsweise setzt fort; bei einer noch laufenden Gruppenmessung zuerst den Messabschluss am Tablet bestätigen oder die Messung verwerfen.


## Erweiterung 0.4: Entlastung und frühe Hinweise

Die orange Bildschirmtaste am Dial startet **Ausgabe entlasten**. Kurzer physischer Tastendruck setzt bewusst fort. Messungen bleiben am Betreuungstablet. Die neue Ampelanzeige und die zweistufigen Zeithinweise sind in [Einlass und Messungen](EINLASS-UND-MESSUNGEN.md) beschrieben.

## Neu in 0.6: Automatische Gruppenfreigabe

Das Tablet steht als reine Ampel **vor** der Mensa, das Dial **drinnen** bei der Person an der Ausgabe. Mit eingeschalteter Automatik (Tablet: **Einlass & Messungen → Automatik**, Gruppengröße > 0) öffnet die Ampel nach einer vollen Gruppe **von selbst** nach der gelernten Zeit. Das Dial zeigt dabei „Naechste Gruppe in 0:42“.

**Aufkleber neben das Dial:**

> **Zu voll?** Orange Fläche antippen.
> **Ausgabe schon frei?** Taste drücken.
> Sonst nichts tun.

- Orange Fläche nach einer automatischen Freigabe = „war zu früh“: Ampel sofort rot, das System wartet künftig länger. Weiter geht es mit der Taste.
- Taste während des Countdowns = „Ausgabe war schon früher frei“: sofortige Freigabe, künftig etwas kürzer.
- Ohne Eingriff wird das System vorsichtig etwas schneller, bis jemand „zu voll“ meldet.
- Einlernphase: Anfangs misst eine zweite Person am Handy oder Tablet im Dial-WLAN Gruppen (**Gruppe messen → Alle haben Essen**). Jede Messung fließt direkt ein.
- **Uhrzeit:** Einmal **Uhrzeit vom Tablet übernehmen** stellt auch die eingebaute Uhr des Dials. Danach übernimmt das Dial Wochentag und Uhrzeit nach Neustart und neuem Essenstag selbst (Uhr nach längerer Stromlosigkeit am Gerät prüfen).
- Keine automatische Freigabe bei Pause, Entlastung, laufender Gruppenmessung, fehlenden Plätzen, Leser- oder Speicherstörung und unbestätigtem Bestand.

Die Automatik ist eine lernende Heuristik und muss im begleiteten Probebetrieb erprobt werden. Die PC-Simulation zeigt das Dial Pixel für Pixel so, wie es auf dem Gerät erscheint; dort lässt sich der Ablauf vorher üben.
