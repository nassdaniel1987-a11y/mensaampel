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

## Noch ausstehend

Ampelseite (Kinder) und Dial-Display (240 × 240, nur Zeichenbefehle des Rasterers).
