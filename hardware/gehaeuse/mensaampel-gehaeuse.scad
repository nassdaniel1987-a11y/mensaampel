// Mensaampel - Tischkonsole fuer M5Stack Dial v1.1 und externen Kartenleser (M5Stack Unit RFID2, U031-B).
// Masse des Dial und der RFID2 Unit aus den offiziellen M5Stack-Modellen (github.com/m5stack/M5_Hardware).
// Teile (einzeln exportieren mit -D teil="..."): "deckplatte", "unterteil", "rfid_halter", "passtest", "zusammenbau".
// Druck: PETG oder PLA, 0,2 mm, 3 Waende, 20 % Fuellung. Deckplatte mit der Oberseite nach unten drucken, Unterteil stehend.
// Keine Stuetzen noetig.

teil = "zusammenbau";

// --- Gehaeuse ---
breite = 120;        // x
tiefe = 150;         // y, Grundflaeche
neigung = 15;        // Grad, Deckplatte steigt nach hinten an
hoehe_vorne = 24;    // Aussenhoehe vorne
wand = 2.5;
boden = 3;
platte = 3;          // Deckplattenstaerke
spiel = 0.3;         // Passungsspiel

// --- M5Stack Dial v1.1 ---
dial_sockel_d = 44.0;   // hinterer, fester Sockel
dial_sockel_h = 8.5;    // vom Drehring bis zur Rueckseite
dial_ring_d = 50.8;     // Drehring (liegt 0,5 mm ueber der Platte, schleift nicht)
dial_luft_ring = 0.5;
usb_winkel = 270;       // Richtung der USB-C-Buchse im Sockel (270 = zur Vorderkante); am Geraet pruefen
usb_breite = 13;        // Platz fuer USB-C-Stecker mit Umspritzung
usb_laenge = 28;        // Kanal fuer den geraden Stecker ab Sockelrand (Winkelstecker nach unten braucht weniger)
usb_haut = 0.8;         // Restwand der Oberseite ueber dem Kanal
dial_mitte_y = 110;     // Abstand der Dial-Mitte von der Vorderkante, entlang der Platte
anschluss_d = 32;       // freie Oeffnung hinter dem Dial fuer PORT.A/B und Kabel
sitz_tiefe = 8.0;       // Oberseite Platte bis Dial-Rueckseite (Sockel 8,5 mm, Ring 0,5 mm ueber der Platte)

// --- M5Stack Unit RFID2 ---
rfid = [48, 24, 8];
rfid_restwand = 1.5;    // Kunststoff zwischen Karte und Antenne (Lesereichweite < 20 mm)
karte = [85.6, 54];
karte_mitte_y = 38;

// --- Schrauben ---
m3_kern = 2.6;          // Kernloch fuer M3-Blechschraube / Gewindeformer
m3_durch = 3.4;
m3_kopf = 6.2;
eck_abstand = 9;

$fn = 96;
laenge = tiefe / cos(neigung);          // Deckplatte entlang der Schraege
hoehe_hinten = hoehe_vorne + tiefe * tan(neigung);
eps = 0.01;

// Deckplatte in eigenen Koordinaten: Oberseite z = platte, Unterseite z = 0, y entlang der Schraege.
module deckplatte() {
  difference() {
    union() {
      cube([breite, laenge, platte]);
      // Aufnahme fuer den Dial-Sockel unter der Platte, unten mit 45-Grad-Sitz (druckbar ohne Stuetzen)
      translate([breite / 2, dial_mitte_y, 0]) mirror([0, 0, 1]) {
        cylinder(d = dial_sockel_d + 2 * spiel + 4, h = sitz_tiefe - platte);
        translate([0, 0, sitz_tiefe - platte - eps]) cylinder(d1 = dial_sockel_d + 2 * spiel + 4, d2 = anschluss_d + 4, h = (dial_sockel_d + 2 * spiel - anschluss_d) / 2);
      }
      // Rahmen fuer die RFID2 Unit unter der Kartenflaeche
      translate([breite / 2, karte_mitte_y, 0]) mirror([0, 0, 1]) rfid_rahmen();
    }
    // Sockel-Aufnahme: der Dial steckt von oben, der Drehring bleibt frei ueber der Platte;
    // die Rueckseite liegt am Rand auf dem 45-Grad-Sitz auf, die Mitte bleibt fuer PORT.A/B und Kabel offen
    translate([breite / 2, dial_mitte_y, platte - sitz_tiefe]) {
      cylinder(d = dial_sockel_d + 2 * spiel, h = sitz_tiefe + 1);
      mirror([0, 0, 1]) cylinder(d1 = dial_sockel_d + 2 * spiel, d2 = anschluss_d, h = (dial_sockel_d + 2 * spiel - anschluss_d) / 2 + eps);
    }
    translate([breite / 2, dial_mitte_y, -40]) cylinder(d = anschluss_d, h = 50);
    // USB-C-Kanal: unter der Oberseite bis in die Aufnahme, die Oberseite bleibt geschlossen
    translate([breite / 2, dial_mitte_y, platte - sitz_tiefe - 2.5])
      rotate([0, 0, usb_winkel]) translate([0, -usb_breite / 2, 0])
        cube([dial_sockel_d / 2 + usb_laenge, usb_breite, sitz_tiefe + 2.5 - usb_haut]);
    // RFID2-Tasche: Platte ueber der Antenne auf rfid_restwand verduennt
    translate([breite / 2 - (rfid[0] + 2 * spiel) / 2, karte_mitte_y - (rfid[1] + 2 * spiel) / 2, -rfid[2] - 2])
      cube([rfid[0] + 2 * spiel, rfid[1] + 2 * spiel, rfid[2] + 2 + platte - rfid_restwand]);
    // Kartenumriss und Beschriftung, 0,6 mm tief graviert
    translate([breite / 2, karte_mitte_y, platte - 0.6]) linear_extrude(1) difference() {
      offset(r = 3) square([karte[0] + 2 - 6, karte[1] + 2 - 6], center = true);
      offset(r = 2) square([karte[0] - 4 - 2, karte[1] - 4 - 2], center = true);
    }
    translate([breite / 2, karte_mitte_y + 6, platte - 0.6]) linear_extrude(1)
      text("KARTE HIER", size = 8, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
    translate([breite / 2, karte_mitte_y - 9, platte - 0.6]) linear_extrude(1)
      text("kurz vorhalten", size = 5, font = "Liberation Sans", halign = "center", valign = "center");
    translate([breite / 2, laenge - 8, platte - 0.6]) linear_extrude(1)
      text("Mensaampel", size = 5, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
    // Senkbohrungen fuer 4 x M3 (Gegenstueck: Dome im Unterteil)
    for (p = eckpunkte()) translate([p[0], p[1], -1]) {
      cylinder(d = m3_durch, h = platte + 2);
      translate([0, 0, platte - 1.6 + 1]) cylinder(d1 = m3_durch, d2 = m3_kopf, h = 1.6 + eps);
    }
  }
}

module rfid_rahmen() {
  innen = [rfid[0] + 2 * spiel, rfid[1] + 2 * spiel];
  difference() {
    union() {
      translate([-innen[0] / 2 - 2, -innen[1] / 2 - 2, 0]) cube([innen[0] + 4, innen[1] + 4, rfid[2] + 0.5]);
      // Schraubaugen fuer den Halter
      for (s = [-1, 1]) translate([s * (innen[0] / 2 + 6), 0, 0]) cylinder(d = 9, h = rfid[2] + 0.5);
    }
    translate([-innen[0] / 2, -innen[1] / 2, -1]) cube([innen[0], innen[1], rfid[2] + 3]);
    // Kabelausgang an der Stirnseite (Grove-Stecker)
    translate([innen[0] / 2 - 1, -7, -1]) cube([4, 14, rfid[2] + 3]);
    for (s = [-1, 1]) translate([s * (innen[0] / 2 + 6), 0, -1]) cylinder(d = m3_kern, h = rfid[2] + 3);
  }
}

// Haltebuegel, drueckt die RFID2 Unit gegen die Deckplatte
module rfid_halter() {
  innen = rfid[0] + 2 * spiel;
  difference() {
    hull() for (s = [-1, 1]) translate([s * (innen / 2 + 6), 0, 0]) cylinder(d = 10, h = 2.5);
    for (s = [-1, 1]) translate([s * (innen / 2 + 6), 0, -1]) cylinder(d = m3_durch, h = 5);
  }
  // zwei Stege liegen auf der Unit auf (Grove-Kabel bleibt frei)
  for (s = [-1, 1]) translate([s * 12 - 3, -8, 2.5 - eps]) cube([6, 16, 0.6]);
}

function eckpunkte() = [[eck_abstand, eck_abstand], [breite - eck_abstand, eck_abstand],
  [eck_abstand, laenge - eck_abstand], [breite - eck_abstand, laenge - eck_abstand]];

// Seitenprofil (y, z) des Unterteils: Oberkante liegt unter der Deckplatte
module profil(o = 0) {
  polygon([[o, o], [tiefe - o, o], [tiefe - o, hoehe_hinten - o / cos(neigung) - platte / cos(neigung)],
    [o, hoehe_vorne - o / cos(neigung) - platte / cos(neigung)]]);
}
module prisma(o = 0, x0 = 0, b = breite) {
  translate([x0, 0, 0]) rotate([90, 0, 90]) linear_extrude(b) profil(o);
}

module unterteil() {
  difference() {
    union() {
      difference() {
        prisma();
        translate([0, 0, boden]) prisma(wand, wand, breite - 2 * wand);
        // Innenraum nach oben offen
        translate([wand, wand, boden]) cube([breite - 2 * wand, tiefe - 2 * wand, hoehe_hinten * 2]);
      }
      // Dome senkrecht zur Deckplatte an den Schraubpunkten
      intersection() {
        prisma();
        for (p = eckpunkte()) platte_zu_welt(p[0], p[1]) mirror([0, 0, 1]) cylinder(d = 8, h = hoehe_hinten * 2);
      }
    }
    for (p = eckpunkte()) platte_zu_welt(p[0], p[1]) translate([0, 0, 1]) mirror([0, 0, 1]) cylinder(d = m3_kern, h = 14);
    // Kabelausgang hinten mit Oesen fuer einen Kabelbinder (Zugentlastung)
    translate([breite / 2, tiefe + 1, boden + 6]) rotate([90, 0, 0]) cylinder(d = 9, h = wand + 2);
    for (s = [-1, 1]) translate([breite / 2 + s * 5, tiefe - wand - 6, -1]) cylinder(d = 3.5, h = boden + 2);
    // Vertiefungen fuer Gummifuesse (10 mm)
    for (x = [14, breite - 14], y = [14, tiefe - 14]) translate([x, y, -eps]) cylinder(d = 10.5, h = 0.8);
  }
}

// Setzt ein Objekt aus Deckplatten-Koordinaten (x, y entlang der Schraege, z=0 Unterseite) in die Welt.
module platte_zu_welt(x, y) {
  translate([0, 0, hoehe_vorne - platte / cos(neigung)]) rotate([neigung, 0, 0]) translate([x, y, 0]) children();
}

module passtest() {
  // Nur die Dial-Aufnahme mit etwas Platte: vorab drucken und den Sitz pruefen (ca. 20 Minuten)
  intersection() {
    deckplatte();
    translate([breite / 2, dial_mitte_y, -20]) cylinder(d = dial_sockel_d + 16, h = 40);
  }
}

module zusammenbau() {
  color("gainsboro") unterteil();
  color("white") platte_zu_welt(0, 0) deckplatte();
  color("dimgray") platte_zu_welt(breite / 2, dial_mitte_y)
    translate([0, 0, platte + dial_luft_ring]) {
      translate([0, 0, -dial_sockel_h]) cylinder(d = dial_sockel_d, h = dial_sockel_h);
      cylinder(d = dial_ring_d, h = 5.5);
      translate([0, 0, 5.5]) cylinder(d = 49.7, h = 16);
      color("black") translate([0, 0, 21.5]) cylinder(d = 36, h = 0.3);
    }
  color("steelblue") platte_zu_welt(breite / 2, karte_mitte_y)
    translate([-rfid[0] / 2, -rfid[1] / 2, platte - rfid_restwand - rfid[2]]) cube(rfid);
}

module explosion() {
  color("gainsboro") unterteil();
  translate([0, 0, 45]) { color("white") platte_zu_welt(0, 0) deckplatte(); }
  translate([0, 0, 90]) color("dimgray") platte_zu_welt(breite / 2, dial_mitte_y) translate([0, 0, platte + dial_luft_ring]) {
    translate([0, 0, -dial_sockel_h]) cylinder(d = dial_sockel_d, h = dial_sockel_h);
    cylinder(d = dial_ring_d, h = 5.5);
    translate([0, 0, 5.5]) cylinder(d = 49.7, h = 16);
  }
  translate([0, 0, 20]) color("steelblue") platte_zu_welt(breite / 2, karte_mitte_y) translate([-rfid[0] / 2, -rfid[1] / 2, platte - rfid_restwand - rfid[2]]) cube(rfid);
  translate([0, 0, 5]) color("orange") platte_zu_welt(breite / 2, karte_mitte_y) translate([0, 0, -rfid[2] - 3.5]) mirror([0, 0, 1]) rfid_halter();
}

if (teil == "deckplatte") rotate([180, 0, 0]) deckplatte();  // Oberseite nach unten auf das Druckbett
else if (teil == "unterteil") unterteil();
else if (teil == "rfid_halter") rfid_halter();
else if (teil == "passtest") rotate([180, 0, 0]) passtest();
else if (teil == "explosion") explosion();
else zusammenbau();
