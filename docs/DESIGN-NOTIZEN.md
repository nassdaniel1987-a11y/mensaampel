# Design-Notizen (Stitch-Entwürfe, Stand 03.10.2026)

Der Nutzer gestaltet in Google Stitch nach `docs/STITCH-PROMPTS.md`. Eingebaut wird erst, wenn alle drei Entwürfe da sind (Betreuung, Ampel, Dial) – ein einheitlicher Stil. Beim Einbau gilt: kein Tailwind-CDN, keine Google-Fonts/Material-Symbols (Dial-WLAN ohne Internet) → eigenes CSS in `src/style.css`, Inter lokal, Lucide-Symbole. Nichts übernehmen, was es im System nicht gibt.

## Gemeinsame Gestaltung (aus beiden Entwürfen)

- Hintergrund `#f8f9ff`, Karten weiß, große Rundungen (Karten ~32 px, Knöpfe als Pillen), sehr leichte Schatten, viel Weißraum.
- Hauptfarbe Grün `#006948` (hell `#85f8c4`, Container `#00855d`), Text `#0d1c2f`, Nebentext `#3d4a42`, Flächen `#eff4ff`/`#e6eeff`/`#dde9ff`.
- Warnung Orange `#904d00` / `#fe932c` (Container `#ffdcc3`), Fehler Rot `#ba1a1a` / `#e02928` (Container `#ffdad6`).
- Inter; große Ziffern 112 px/900, Überschriften 36 px/700, Titel 28 px/600, Beschriftung 16 px/600; Knöpfe mindestens 48 px hoch, Hauptknöpfe 64 px.
- Kopfzeile: rundes Logo + „Mensaampel“, Pille „Dial verbunden“ (pulsierender Punkt), Reiter als Pillen-Leiste (aktiv grün gefüllt), rechts Abmelden.

## Betreuung → Reiter „Betrieb“

Reihenfolge von oben: (1) Statuskarte: großer Kreis mit Symbol + „Grün · Einlass offen“ + Zeile darunter, rechts zwei große Pillen „Pausieren“ und „Gruppe jetzt freigeben“ (Text darf nicht abgeschnitten werden). (2) Küche und Mensa nebeneinander: große Zahl „38 / 48“, Pille „10 frei“, Fortschrittsbalken, Zeile Freigabe mit − / Zahl / + (Mensa in 5er-Schritten), Offen/Geschlossen-Pille. (3) Leiste „Heute erwartet“ (Prognose). (4) „Meldungen & Vorschläge“ als bis zu 3 Karten mit Art-Kennzeichen, Titel, Satz und Knopf (z. B. Karte lange draußen → Zurückbuchen/Verloren; Mensa-Vorschlag → Jetzt freigeben). (5) Einklappbares Raster „Alle 112 Plätze“ mit Filter-Pillen Alle/Belegt/Frei/Auffällig, Kacheln je Raum, gestreift = auffällig, Legende. (6) Fußkarte mit „Sicherung“ und „Neuer Essenstag“.

Nicht übernehmen (erfunden): Akku, „Tablet Station #01“, „Sync“, „Ampel-Override“, „v2.4.1“, „Klassen 3 & 4 im Anmarsch“, „Kiosk-Anzeige“. Mensa-Belegt nicht in Orange (sonst Verwechslung mit Warnung) – eigene ruhige Farbe für den Raum.

## Betreuung → Reiter „Gerät“

Kopf-Karte: Überschrift „Gerätestatus & Gesundheit“ mit zwei Knöpfen (z. B. „Gerätetest starten“, „Dial neu starten“ mit Bestätigungsfenster). Links „Gesundheit heute“: je Zeile eine Karte mit rundem Symbol (grün Haken / orange Warnung / rot), Titel, Pille (Bereit / Aufmerksamkeit / Prüfen), Messwert, ein Satz was zu tun ist, rechts optional ein Knopf (z. B. Kartenleser → „Leser testen“). Rechts schmale Spalte „Geräte-Details“: Version, WLAN-Art/Name/Adresse, Laufzeit seit Start, Leser intern/extern, freier Speicher, Knopf „Sicherung herunterladen“.

Nicht übernehmen (erfunden): HDMI-Kiosk, 32-GB-Speicher, Lenovo-Tablet, Akku/Batteriemodus, IP 192.168.10.42, „Wartung 02:00“, Kiosk-Schutz, „Türgong“. Gefüllt wird mit den echten Zeilen aus `src/health.mjs`.

## Dial-Display (Stitch „Variante 1: Gauge & Segment-Ringe“)

Grundidee: Jeder Zustand nutzt den Rand des runden Displays als Ring (Anzeige, Countdown, Rahmen). Hintergrund radialer Verlauf je Zustand: Grün `#15803d→#052e16`, Bernstein `#b45309→#451a03`, Rot `#b91c1c→#450a0a`, Türkis `#0f766e→#042f2e` (Karte zurück), Dunkel `#1e293b→#020617` (Menü, Start-Check, Taste halten). Schrift: große Zahl ~72 px (wir: 84 px), Zeit 52 px (vorhanden), Beschriftung 20 px, Unterzeile 13 px (wir: 15 px).

1. **Grün:** Ring r≈109, 9 px: blasse Spur + weißer Bogen = Anteil freier Plätze; Mitte „12“, „PLÄTZE FREI“ (Großbuchstaben, hellgrün), Unterzeile „Mensa 20 • Küche 8“ mit Punkt.
2. **Gelb:** wie 1, Bogen fast voll, Unterzeile „Fast voll“.
3. **Rot / Gruppe voll:** Countdown als weißer Bogen, Mitte „1:20“ (52 px), darunter „NÄCHSTE GRUPPE“ zweizeilig.
4. **Karte ausgegeben:** grün, Doppelring (weiß 4 px r 111 + blass 2 px r 104), dicker Haken, „K12“ groß, „Guten Appetit!“.
4b. **Karte zurück:** türkis, weißer Ring 5 px + gestrichelter innerer Ring, kleiner Haken im hellen Kreis, „K12 zurück, danke!“.
5. **Karte gesperrt:** rot, Ring in Stücken (Strich-Lücke), dickes Kreuz, „KARTE GESPERRT“, Unterzeile mit Hinweis.
6. **Menü:** dunkel, Rand mit Strichmarken + blauer Bogen als Zeiger; Mitte „MENÜ“, darüber/darunter graue Einträge, ausgewählter Eintrag als blaue Pille mit weißem Punkt.
7. **Start-Check:** dunkel, Ring in 4 Viertel, je Viertel grün/orange/rot nach Zustand von Leser/Uhr/Speicher/WLAN; Liste mit „✓ OK“ / „! …“ rechtsbündig.
8. **Taste halten:** dunkel, dicker weißer Fortschrittsring 12 px, Pfeil-Symbol, „LOSLASSEN“, „nach 3 Sek.“.

Umsetzung: nur `core/engine.hpp`/`core/dial.hpp` (Zeichenliste); Rasterer hat Verlauf, Bögen, Kreise, Linien, abgerundete Rechtecke – runde Bogenenden mit kleinen Kreisen, Strich-Ringe als mehrere Bögen. Schriftgrößen prüfen (Glyphen „K“, „:“ in 52 px ggf. per `scripts/build-dial-font.py` ergänzen). Erfundenes: „Sekretariat“ bei gesperrter Karte → eigener Text („bei der Betreuung melden“); „Speicher 88 %“ → unsere Zustände.

## Noch ausstehend

Ampelseite (Kinder).
