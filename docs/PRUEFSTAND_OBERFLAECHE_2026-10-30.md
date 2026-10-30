# Prüfnachweis zur vereinfachten Oberfläche

Stand: 30.10.2026. Umsetzung und Prüfung ausschließlich lokal. Commit, Push und Veröffentlichung übernimmt der Nutzer.

## Automatisierte Prüfung

- `pnpm check`: **314 Tests in 22 Dateien bestanden**, Typprüfung, Produktionsbuild, Worker-Build und Prüfung der öffentlichen Artefakte erfolgreich.
- `pnpm test:runtime`: erfolgreich in der lokalen Cloudflare-Laufzeit mit synthetischer D1/R2-Umgebung.
- `git diff --check`: erfolgreich.
- JSON-Vertrag v1 unverändert. Die separate Importoberfläche ist entfernt; bestehende Zustandsvalidierung und Sicherungs-/Wiederherstellungstests bleiben aktiv. Historische Recherchevorlagen werden beim Lesen toleriert; neue Vorlagen können nicht gespeichert werden.

Neue Prüfungen decken unter anderem den PLZ-Endpunkt samt Anmeldung und Ursprung, Abfragezähler, GPS, Filter, veraltete Antworten, Abbruch, Doppelklicks, Cache und Anbieterwartezeit ab. Kachelausfälle werden von einzelnen Fehlern unterschieden; Wiederholen betrifft nur die Karte.

Die Erfassungsprüfungen kontrollieren Anhänge ohne vorzeitigen Upload, OCR-Korrekturen, geschützte Formularwerte, mehrere Einträge, geplante Kosten, vorhandene Ausgabenverknüpfungen, Reminder-Bestätigung, Dateigröße sowie wiederholtes Speichern nach verlorener Antwort ohne zweite Buchung oder zweiten Upload. Entfernte Arbeiten und Ausgaben erhalten keine verwaisten Chatzuordnungen.

Die Farbprüfungen umfassen zwölf Vorgaben, freie Farben, Weiß und Schwarz. Weißer Buttontext sowie Akzenttext auf den verwendeten hellen Flächen erreichen rechnerisch mindestens 4,5:1. Serverseitige HEX-Prüfung, Trennung zwischen Fahrzeugen/Konten und Wiederherstellung mit gespeicherter Farbe sind geprüft.

## Browserprüfung

Eingebauter Chromium-Browser, Desktopansicht und mobiler Viewport **390 × 844**. Lokale signierte Testsitzungen; keine produktiven Fahrzeugdaten. Die mobile Prüfung ist eine Darstellungssimulation, kein neuer Test auf einem physischen Handy.

- Manuelle Arbeit mit simuliertem Chat ergänzt, direkt ins vorhandene Formular übernommen und im lokalen Worker gespeichert. Der manuelle Titel blieb erhalten; Kosten erschienen einmal.
- Ein synthetisches Text-PDF mit PDF.js und ein synthetisches Belegfoto mit Tesseract einschließlich lokaler Sprachdaten tatsächlich gelesen. Rechnungsnummer, Datum, Gesamtbetrag, Positionen und Nettopreise wurden übernommen. Manuell gesetzter Titel und nativ eingegebenes Arbeitsdatum blieben beim Scan erhalten. Ein OCR-Fehler bei der Einheit („1“ statt „l“) ließ sich korrigieren und speichern. Erkennungswarnungen bleiben deshalb erforderlich.
- Elf selbst erzeugte PNG-Testmotive in Hoch-, Quer- und Quadratformat hochgeladen; Hochformat als Standard gewählt. Desktop zeigt zehn, mobil vier vollständige Fotos und den Galerieverweis für weitere Bilder. Großansicht, Fahrzeugwechsel und Wiederaufnahme der gespeicherten Farbe/des Standardfotos geprüft. Ein bei der Sichtprüfung gefundener mobiler Breitenfehler wurde korrigiert.
- Echte OSM-Kacheln unter der vorgesehenen CSP, `Referrer-Policy: no-referrer` und Dateityp-Schutz geladen. Alle neun überprüften Kacheln waren geladen; ihre individuelle Policy lautete `strict-origin-when-cross-origin`. Keine Browserfehler bei dieser Prüfung.
- GPS und Tankpreise im ausdrücklich gekennzeichneten Browserfixture simuliert. Standort, PLZ-Auflösung, Radius und Zoom ließen den sichtbaren Preiszähler bei null; erst Suchen erhöhte ihn auf eins. E5, E10 und Diesel erschienen gemeinsam nach Entfernung sortiert. Keine echten Tankerkönig- oder Groq-Aufrufe.

Prüfbilder:

- [Gemeinsame Erfassung](screenshots/erfassen-gemeinsam-2026-10-30.png)
- [Desktopcollage mit Fahrzeugfarbe](screenshots/uebersicht-farben-collage-2026-10-30.png)
- [Mobile Collage](screenshots/uebersicht-mobil-2026-10-30.png)
- [Tankstellenkarte mit simulierten Preisen](screenshots/tankstellen-manuell-2026-10-30.png)

## Lokale Laufzeitmessung

| Verknüpfte Ausgaben/Arbeiten/Belege | Aktenstart | Kleine Änderung | Änderungsantwort |
|---|---:|---:|---:|
| je 100 | 72 ms | 27 ms | 1.813 Byte |
| je 1.000 | 73 ms | 23 ms | 1.821 Byte |
| je 3.000 | 88 ms | 23 ms | 1.822 Byte |

Dies sind lokale Antwortzeiten einschließlich D1, keine Messung der produktiven Worker-CPU-Zeit oder einer Mobilfunkverbindung. Der Build weist weiterhin auf das große bestehende Hauptbündel hin; OCR, PDF, Karte und Chat besitzen separate nachgeladene Module.

## Veröffentlichung

Keine zusätzlichen Schlüssel, Dienste oder Datenbankmigrationen. Der neue Ortsendpunkt und die Oberfläche gehören gemeinsam in den vorhandenen Veröffentlichungsablauf. Anleitung und Committext stehen in [Oberfläche vereinfachen](OBERFLAECHE_2026-10-30.md). Produktive Nutzung wird nach dem vom Nutzer ausgeführten Push kurz geprüft; diese lokale Prüfung ändert keine Kontoeinstellungen und verbraucht keine Groq- oder Tankerkönig-Kontingente.
