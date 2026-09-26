# Gehäuse: Tischkonsole für Dial und Kartenleser

Die Konsole steht drinnen neben der Ausgabe. Oben sitzt das M5Stack Dial, davor die feste Kartenfläche „KARTE HIER“. Unter der Kartenfläche ist die **RFID2 Unit fest eingebaut**. Sie ist der Kartenleser der Konsole und keine Alternative zum eingebauten Leser des Dial. Die Software bleibt unverändert (Leserwahl „Automatisch“): Sobald die RFID2 an PORT.A steckt, liest das Dial über sie.

![Zusammenbau](bilder/zusammenbau.png)

## Teile

| Teil | Anzahl |
|---|---|
| M5Stack Dial v1.1 (K130-V11) | 1 |
| M5Stack Unit RFID2 (U031-B) mit beiliegendem Grove-Kabel (20 cm) | 1 |
| USB-C-Kabel (am besten mit 90°-Winkelstecker) und 5-V-Netzteil | 1 |
| Senkkopfschraube M3 × 10 (Deckplatte auf Unterteil) | 4 |
| Schraube M3 × 8 (Haltebügel der RFID2) | 2 |
| Gummifüße Ø 10 mm | 4 |
| Kabelbinder (Zugentlastung) | 1 |

## Druckdateien

| Datei | Inhalt | Lage beim Druck |
|---|---|---|
| `deckplatte.stl` | Oberseite mit Dial-Aufnahme, Kartenfläche und RFID2-Tasche (≈ 69 g) | Oberseite nach unten (so exportiert) |
| `unterteil.stl` | Wanne mit Schraubdomen, Kabelloch und Fußmulden (≈ 137 g) | stehend, Boden unten |
| `rfid_halter.stl` | Haltebügel für die RFID2 | flach |
| `passtest.stl` | kleiner Ausschnitt mit Dial-Sitz und RFID2-Tasche | wie Deckplatte |

PETG oder PLA, 0,2 mm Schichthöhe, 3 Wände, 20 % Füllung, **keine Stützen**. Die Maße stehen oben in `mensaampel-gehaeuse.scad` und lassen sich in OpenSCAD anpassen; einzelne Teile mit `-D 'teil="deckplatte"'` usw. exportieren.

**Zuerst `passtest.stl` drucken** (ca. 20 Minuten) und Dial und RFID2 einsetzen. Erst wenn beides passt und durch die Platte gelesen wird, die großen Teile drucken.

## Zusammenbau

![Explosionszeichnung](bilder/explosion.png)

1. RFID2 mit der Antennenseite nach oben in die Tasche unter „KARTE HIER“ legen, das Grove-Kabel zur Dial-Öffnung hin führen. Haltebügel mit 2 × M3 × 8 festschrauben.
2. Grove-Kabel durch die Öffnung hinter dem Dial-Sitz an **PORT.A** des Dial stecken (nur stromlos stecken).
3. USB-C-Kabel in das Dial stecken und durch den Kanal unter der Deckplatte führen. Dial von oben in die Aufnahme drücken; der Drehring liegt frei über der Platte.
4. Kabel durch das hintere Loch im Unterteil führen, mit dem Kabelbinder an den beiden Ösen zugentlasten.
5. Deckplatte mit 4 × M3 × 10 auf das Unterteil schrauben, Gummifüße einkleben.
6. Einschalten. Unter Gerät muss „Automatisch – aktiv: extern“ stehen. Danach die Abnahme aus `ANLEITUNG-DIAL.md` durchgehen.

![Deckplatte von unten](bilder/deckplatte-unterseite.png)
![Unterteil](bilder/unterteil.png)

## Am echten Gerät prüfen

Die Maße stammen aus den offiziellen M5Stack-Modellen (github.com/m5stack/M5_Hardware), das Gehäuse ist aber noch nicht mit echter Hardware gedruckt worden. Beim Passtest prüfen:

- **Lage der USB-C-Buchse** und **Ausrichtung des Displays**: Die Buchse soll zur Vorderkante zeigen (`usb_winkel = 270`), damit die Anzeige gerade steht. Sonst `usb_winkel` anpassen.
- **Sitz des Dial**: fest, aber ohne Kraft; der Drehring darf nicht schleifen (`spiel`, `sitz_tiefe`).
- **Lesereichweite** durch 1,5 mm Kunststoff: Karte flach auflegen, sie muss sicher gelesen werden. Wenn nicht, `rfid_restwand` auf 1,0 mm verringern.
- **Welcher Grove-Anschluss PORT.A ist** (auf der Rückseite beschriftet). An PORT.B arbeitet die RFID2 nicht.
