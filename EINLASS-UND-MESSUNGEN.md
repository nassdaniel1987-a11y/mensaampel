# Einlass und Messungen

Die neue Seite **Einlass & Messungen** ist auf dem verbundenen Tablet verfügbar. In der PC-Simulation und in der einzelnen HTML-Vorführung funktioniert sie mit simulierten Karten genauso. Echte Messdaten werden auf dem Dial beziehungsweise im PC-Bestand gespeichert; die HTML-Vorführung behält nur ihren Testbestand bis zum Neuladen.

## Grün, Gelb und Rot

- Grün: Einlass offen, mehr freie Plätze als die Gelbgrenze.
- Gelb: Einlass offen, noch ein bis fünf freie Plätze (Startwert, einstellbar). Weitere Ausgaben bleiben möglich.
- Rot: Pause, abgeschlossene Einlassgruppe, keine Plätze, noch unbestätigter Bestand oder Störung. Eine Pause lässt gültige Rückgaben zu.

Die freien Plätze berücksichtigen nur freigegebene Räume und verfügbare Karten. 0 als Gelbgrenze schaltet Gelb aus. Der farbige Kreis am Dial zeigt dieselbe Regel wie die Tabletampel. Bei einer unterbrochenen Tabletverbindung zeigt das Tablet nach mehr als drei Sekunden ohne Status Rot, unabhängig vom lokalen Gerätezustand.

## Kleine Einlassgruppen

1. Unter **Einlass & Messungen** eine Gruppengröße setzen, zum Beispiel fünf Kinder.
2. Speichern. Der Einlass wird zunächst pausiert.
3. Nach Prüfung der Ausgabe **Einlass fortsetzen** wählen oder den Dial kurz drücken.
4. Jede erfolgreiche neue Kartenausgabe zählt ein Kind. Abgewiesene Scans und Rückgaben zählen nicht mit.
5. Nach der eingestellten Anzahl bleibt die Ampel automatisch rot. Freie Sitzplätze allein öffnen den Einlass nicht wieder.
6. Wenn die Ausgabe frei ist: **Nächste Gruppe freigeben** oder kurzer Druck auf den Dial.

Mit 0 ist die Gruppenbegrenzung ausgeschaltet; dies bleibt zur Einführung der Standard. Bei einem Wechsel der Gruppengröße wird der Einlass bewusst pausiert. Nach einer manuellen Pause beginnt beim Fortsetzen ebenfalls eine neue Gruppe. Eine Rückgabe oder eine rückgängig gemachte Buchung öffnet keine bereits abgeschlossene Gruppe; die Zählung bleibt dabei konservativ. Ein Zeitvorschlag öffnet den Einlass niemals automatisch.

## Einzelkind messen

1. **Uhrzeit vom Tablet übernehmen** drücken. Datum/Wochentag und Uhrzeit des Tablets sollten stimmen. Nach einem Neustart oder neuen Essenstag erneut übernehmen.
2. Situation **Keine Schlange**, **Kurze Schlange** oder **Lange Schlange** wählen. Diese Einschätzung kommt von euch; für „kurz“ und „lang“ gemeinsam klare Kriterien festlegen.
3. **Einzelkind messen** wählen. Die Messung wartet auf die nächste erfolgreiche Kartenausgabe. Rückgaben und abgelehnte Scans starten sie nicht.
4. Das zugehörige Kind beobachten. Die Kartennummer wird während dieser Messung angezeigt.
5. Sobald dieses Kind sein Essen erhalten hat und zum Platz gehen kann, auf **Essen erhalten** tippen.

Erfasst wird die Zeit vom Ausgabescan der Platzkarte bis zur Bestätigung am Tablet. Die spätere Kartenrückgabe ist kein Messende. Wird die Messkarte vorher zurückgegeben, wird die unvollständige Messung verworfen. Eine zusätzliche beobachtende Person an der Ausgabe kann die Bestätigung am Tablet übernehmen. Es gibt keine zweite Leserstation für den Messabschluss.

## Gruppe messen

1. Vor der nächsten Gruppe die Schlangensituation wählen und **Gruppe messen** drücken. Wenn gerade eine begrenzte Gruppe eingelassen wird, diese zunächst abschließen.
2. Einlass freigeben. Die erste erfolgreiche Kartenausgabe startet die Zeit; weitere Ausgaben erhöhen die gemessene Gruppengröße.
3. Nach Erreichen des Gruppenlimits stoppt der Einlass automatisch. Ohne Gruppenlimit den Einlass von Hand pausieren.
4. Wenn das **letzte Kind dieser Gruppe sein Essen hat**, auf **Alle haben Essen** tippen.
5. Erst danach die nächste Gruppe freigeben. Solange eine Gruppenmessung noch läuft, wird das Fortsetzen abgewiesen; alternativ die Messung bewusst verwerfen.

Eine Gruppenzeit ist die Dauer bis zur Versorgung des letzten Kindes, kein Durchschnitt der einzelnen Kinder. Einzel- und Gruppenmessungen werden deshalb getrennt ausgewertet.

## Auswertung und Zeithinweise

Die Tabelle zeigt Anzahl, Durchschnitt sowie kürzeste und längste gemessene Zeit nach Schlangensituation und Messart. Sie ist insgesamt oder für den aktuell eingestellten Wochentag sichtbar. Diese breite Übersicht fasst unterschiedliche Gruppengrößen und Zeitfenster zusammen und ist keine automatische Steuerungsregel.

Ein Zeithinweis wird in zwei Stufen gebildet:

- **Grobe Orientierung:** Ab drei Gruppenmessungen mit gleicher tatsächlicher Gruppengröße und gleicher Schlangensituation; Wochentag und Uhrzeit dürfen abweichen.
- **Passend zu Uhrzeit und Wochentag:** Sobald zusätzlich mindestens drei Werte mit gleichem Wochentag und gleichem 15-Minuten-Zeitfenster des Einlasses vorliegen, werden ausschließlich diese verwendet.

Anzahl, Durchschnitt und kürzeste/längste Zeit bleiben sichtbar. Ein oder zwei Werte erzeugen noch keinen zeitlichen Prüfhinweis. Die beim ersten Einlass gesetzte Schlangensituation bleibt für den Vergleich dieser Gruppe fest. Ist der Mittelwert seit dem ersten Eintritt erreicht, erscheint bei geschlossener Gruppe **„Ausgabe wieder frei? Bitte vor Ort prüfen.“** Andere Uhrzeiten werden nur in der ausdrücklich als grob gekennzeichneten Orientierung einbezogen.

Dies ist eine erste statistische Unterstützung. Die Software erkennt weder eine Schlange noch eine freie Essensausgabe. Die Grenzwerte und Gruppengröße werden von euch festgelegt; es gibt keine selbstständige Änderung oder zeitgesteuerte Freigabe. Für einen genauen Vergleich fällt der Tag mit frühem Essen um 11:40 in ein anderes Zeitfenster als ein Beginn um 12:25.

## Daten und Korrekturen

- Es läuft jeweils eine aktive Messung. Die Schlangensituation und die Zeitbasis lassen sich währenddessen nicht ändern.
- Gültige Messdauern: eine Sekunde bis 60 Minuten. Eine vergessene Messung über 60 Minuten bitte verwerfen; sie wird nicht als Durchschnittswert übernommen.
- Die letzten **120 abgeschlossenen Messungen** bleiben gespeichert. Die nächste ersetzt jeweils den ältesten Wert. Vor längeren Versuchen regelmäßig **Messungen als CSV sichern** nutzen.
- Abgeschlossene Messungen enthalten Messart, Schlangensituation, Wochentag, Startminute, Gruppengröße und Dauer; keine Kindernamen und keine Kartenkennung.
- Eine falsche letzte Messung kann nach Rückfrage gelöscht werden. Eine aktive Messung kann jederzeit verworfen werden.
- Neustart, neuer Essenstag sowie Buchungskorrektur oder Rückgängig verwerfen eine aktive Messung. Abgeschlossene Messungen bleiben bei Neustart und Tageswechsel erhalten.
- Messungen werden erst nach erfolgreichem Speichern bestätigt. Ein Speicherfehler rollt auch gleichzeitig betroffene Gruppenzähler und Buchungen zurück.
- Eine neu übernommene Tablet-Uhrzeit verwirft den Zeithinweis für eine bereits laufende Gruppe; die nächste Gruppe erhält wieder eine neue Zeitbasis.

## Kurzer Probelauf

In der Simulation zunächst zwei Kinder pro Gruppe einstellen und die Tablet-Uhrzeit übernehmen. Gruppe messen, Einlass öffnen, K01 und K02 ausgeben: Rot muss erscheinen. Zehn Sekunden vorspulen, **Alle haben Essen** bestätigen und den Tabellenwert prüfen. Anschließend bewusst die nächste Gruppe freigeben. Für Gelb testweise nur drei Küchenplätze freigeben und Gelbgrenze zwei wählen; die Mensa bleibt geschlossen.

Vor dem Einsatz mit Kindern bleiben die Hardwareprüfungen notwendig: RFID und WLAN gleichzeitig, Tastendruck am Dial, Tabletanzeige, Speicherung bei Stromunterbrechung und ausreichend freier Gerätespeicher mit allen Karten und Messwerten.


## Ausgabe entlasten direkt am Dial

Auf dem Dial-Bildschirm die orange Fläche **Ausgabe entlasten** antippen. Die Ampel wird rot; gültige Rückgaben bleiben möglich. Der Dial zeigt den eigenen Stoppgrund an. Ein kurzer Druck auf die physische Dial-Taste gibt den Einlass bewusst wieder frei, sofern keine laufende Gruppenmessung erst abgeschlossen oder verworfen werden muss. Freie Plätze und Betriebsbereitschaft bleiben Voraussetzung für Grün/Gelb. Die Taste behält auch die gewöhnliche Pausefunktion.

Beginn und Ende stehen im begrenzten Ereignisprotokoll (letzte 80 Ereignisse), beim Ende mit Dauer in Sekunden. Nach Neustart bleibt die Entlastung aktiv; ihre Dauer wird als unbekannt angegeben. Diese Phasen sind keine Wartezeitmessungen und fließen nicht in die Empfehlungen ein. Ein neuer Essenstag beendet eine Entlastung ausdrücklich. Es gibt kein dauerhaftes separates Archiv der Entlastungsphasen.

Der Dial zeigt während des offenen Einlasses die verbleibende Gruppenzahl, begrenzt durch tatsächlich freie Plätze. Die Bildschirmfläche ist neu und muss am echten Dial auf Erreichbarkeit geprüft werden.

## Zwei Tablets und gut sichtbare Ampel

Tablet 1 vor der Tür öffnet die reine Ampelansicht, Tablet 2 in der Anfangsphase die kennwortgeschützte Betreuung für Messungen und Einstellungen. Beide verbinden sich mit demselben Dial-WLAN und sehen denselben zentralen Zustand. Die öffentliche Ampel benötigt keine Betreuungsanmeldung.

Die große Ampel hat jetzt einen kräftigen, vollflächigen Hintergrund, dunkle kontrastreiche Schrift und ein großes Symbol. Rot bleibt ruhig und blinkt nicht. Am Tablet die Displayhelligkeit passend zum Standort einstellen; Farbe allein kann die Gerätehelligkeit nicht erhöhen. Sichtbarkeit aus eurer tatsächlichen Entfernung und bei Tageslicht vor Ort prüfen. Die Offline-HTML-Datei ist eine Vorführung pro Gerät und synchronisiert zwei Tablets nicht.

## Erprobungsphase 0.5

Nur im aktualisierten Dial-Paket: Unter **Einlass & Messungen → Erprobung der Freigabe** die Vorschläge bewerten. Das Tablet vor der Tür bleibt eine reine Ampel. Die zweite Person verwendet das Betreuungstablet.

Vor einer Gruppe Uhrzeit übernehmen und bei Bedarf den Puffer einstellen (0–300 Sekunden, Startwert 30). Mindestens drei passende Gruppenmessungen sind nötig. Der Prüfvorschlag wird beim letzten Einlassscan der Gruppe festgelegt: längste passende gemessene Gruppenzeit plus Puffer, frühestens denselben Puffer nach dem letzten Einlassscan. Genau passende Tages-/Zeitfensterdaten werden bevorzugt, sonst wird der Vergleich als grob gekennzeichnet. Dies ist eine vorsichtige Heuristik, keine nachgewiesene sichere Freigabezeit.

Wenn der Zeitpunkt erreicht ist, einmal **Passt** oder **Noch zu voll** drücken. Die Ampel bleibt in beiden Fällen rot. Zum Einlassen weiterhin bewusst die nächste Gruppe freigeben. Bei manueller Pause, Entlastung oder unbestätigtem Bestand ist die Bewertung gesperrt. Ein Neustart verwirft den laufenden Vorschlag, behält aber abgeschlossene Bewertungen.

Die letzten 120 anonymen Bewertungen werden separat gespeichert und lassen sich als CSV exportieren. Erfasst werden Gruppengröße, Schlange, Wochentag, Startminute, vorgeschlagene Dauer, tatsächlicher Bewertungszeitpunkt, Antwort, Zahl der Vergleiche und Genauigkeitsstufe (1 grob, 2 passend). Eine späte Antwort bewertet die Situation zum tatsächlichen Drücken; sie beweist nicht, dass der frühere Vorschlagszeitpunkt gepasst hätte. Es gibt noch keine automatische Anpassung und kein automatisches Öffnen. Die Zahl positiver Rückmeldungen allein ist kein Nachweis für eine verlässliche Automatik.

## Automatische Gruppenfreigabe (0.6.0-preview)

**Ziel:** Die täglich wechselnde Person in der Mensa soll möglichst nichts bedienen müssen. Das Tablet vor der Tür ist nur Ampel, das Dial steht drinnen.

**Ablauf:** Gruppengröße festlegen und unter **Automatik** einschalten. Sobald eine Gruppe voll ist, wird die Ampel rot und das Dial zeigt einen Countdown. Nach Ablauf wird die nächste Gruppe automatisch freigegeben. Die Freigabezeit ist *Gruppengröße × gelernte Sekunden pro Kind*, gerechnet ab dem ersten Einlass der Gruppe, frühestens 10 Sekunden nach dem letzten Einlassscan.

**Woher der Wert kommt** (in dieser Reihenfolge):
1. passender Wochentag und passende halbe Stunde mit mindestens drei Beobachtungen,
2. alle bisherigen Beobachtungen,
3. der eingestellte Startwert (Standard 20 s pro Kind).

**Wie gelernt wird:**
- **Einlernphase:** Jede abgeschlossene Gruppenmessung („Alle haben Essen“) zählt als Beobachtung (gleitender Mittelwert). Gruppenmessungen aus älteren Speicherständen werden einmalig übernommen.
- **Taste im Countdown:** Die Ausgabe war schon früher frei. Sofortige Freigabe; der Wert bewegt sich in Richtung der tatsächlich vergangenen Zeit.
- **Orange Fläche (Entlasten) nach einer automatischen Freigabe:** Die Freigabe kam zu früh. Wert ×1,2 (einmal pro Freigabe). Weiter geht es mit der Taste.
- **Keine Beschwerde bis zur nächsten automatischen Freigabe:** Wert ×0,97, also vorsichtig schneller.
- Grenzen: 3 bis 180 Sekunden pro Kind. Es werden nur Zahlen je Wochentag und halber Stunde gespeichert, keine Kartenkennungen.

**Keine automatische Freigabe** bei manueller Pause, Entlastung, laufender Gruppenmessung (erst „Alle haben Essen“ bestätigen), unbestätigtem Bestand, Leser- oder Speicherstörung. Nach einem Neustart beginnt der Countdown nach der Bestandsbestätigung neu. Die Automatik lässt sich jederzeit ausschalten; „Gelerntes zurücksetzen“ löscht alle Lernwerte. Die Tabelle **Was die Automatik gelernt hat** zeigt die Werte und lässt sich als CSV sichern.

**Uhrzeit:** Die PC-Version nimmt sie automatisch vom PC. Das Dial übernimmt sie aus seiner eingebauten Uhr, sobald diese einmal über **Uhrzeit vom Tablet übernehmen** gestellt wurde.

Die „Erprobung der Freigabe“ bleibt als zusätzliche Bewertungsmöglichkeit erhalten. Die Automatik ist eine vorsichtige, lernende Heuristik. Vor dem Alltagseinsatz im begleiteten Probebetrieb prüfen, ob die Zeiten zu eurer Ausgabe passen.

## Startgruppe und lernende Gruppengröße (0.7.0-preview)

**Warum:** Zu Beginn steht die Ausgabe sonst leer, weil sich erst eine Schlange aufbauen muss.

- **Startgruppe:** Erste Gruppe des Essenstags und jede Gruppe nach einer Pause von `idleMinutes` (Standard 5) ohne Einlass. Größe: eingestellter Startwert (0 = doppelte Gruppengröße), später der gelernte Wert.
- **Takt:** Jede folgende Gruppe wird *Größe der nächsten Gruppe × Sekunden pro Kind* nach dem ersten Einlass der vorherigen Gruppe freigegeben. So bleibt die aufgebaute Schlange erhalten, statt nach der Startgruppe leerzulaufen.
- **Größe lernen:** Taste im Countdown = +1 Kind (bei Startgruppe: Startgruppe +1). Orange Fläche nach automatischer Freigabe = −1 (nach Startgruppe: Startgruppe −1). Normale Gruppen bleiben zwischen kleinster und größter Gruppe (0 = feste Gruppengröße, also zunächst kein Größenlernen). Je Wochentag und halbe Stunde gespeichert.
- **Neuer Essenstag automatisch** zur eingestellten Uhrzeit (einmal pro Wochentag, nur mit gültiger Uhrzeit). Beim ersten Einschalten der Funktion zählt der laufende Tag als bereits begonnen. Zusätzlich müssen seit dem letzten Scan mindestens 30 Minuten vergangen sein, damit eine falsch gehende Uhr nicht mitten im Mittag zurücksetzt.
- **Tagesbericht:** je Essenstag Ausgaben, Rückgaben, Gruppen, automatische Freigaben, „früher frei“, „zu voll“, Entlastungen, erste/letzte Ausgabe und nicht zurückgegebene Karten; 60 Tage, CSV-Export.

Ohne Automatik verhält sich alles wie bisher mit fester Gruppengröße.
