# Prüfbericht – Mehrere Fahrzeuge und bereinigte Cloudflare-Struktur

Stand: 28. Oktober 2026. Die Umsetzung und die folgenden Prüfungen erfolgten lokal. Produktive Kontoeinstellungen, Daten und Veröffentlichungen wurden nicht geändert. Commit und Push bleiben beim Nutzer. Die Freigabe der produktiven Umstellung steht noch aus.

## Bestandene Prüfungen

- 202 automatisierte Tests in 15 Dateien. Die aktuellen Fälle ersetzen die entfallenen Google-Laufzeitprüfungen und ergänzen die bestehenden Fach-, Galerie-, OCR- und Vertragsprüfungen.
- TypeScript mit strict, noUnusedLocals und noUnusedParameters erfolgreich; Produktionsbuild für Website und gemeinsamen Worker erfolgreich.
- Öffentliche Artefakte, lokale OCR-Dateien, Sicherheitsheader und ausschließliches /api-Routing geprüft. Kein Google-OAuth-Code, keine Backend-Secrets, keine Laufzeitkompilierung des JSON-Prüfers und kein synthetischer Testzugang im Produktionsbundle.
- Wrangler-Worker-Dry-run und tatsächliche lokale Übersetzung der Pages Functions erfolgreich. Keine Veröffentlichung. Worker-Artefakt etwa 953 KiB, gzip etwa 142 KiB.
- pnpm audit meldet am Prüftag 0 bekannte Sicherheitslücken.
- ChatGPT-JSON-Vertrag v1 unverändert; bestehende Google-ZIPs bleiben lesbar. Historischer Prüfbericht: [27. Oktober](docs/PRUEFSTAND_2026_10_27.md).

## Konten, Fahrzeuge und Schreibvorgänge

Zwei synthetische Konten mit jeweils zwei Fahrzeugen. Geprüft sind Konto-/Fahrzeugzuordnung beim Lesen und Schreiben, fremde Dokument-/Upload-/Restore-IDs, tatsächliche RSA-signierte Tokens, Aussteller und Website, gesperrte und neue Konten, fehlende und abgelaufene Anmeldung. Die normale Prüfung eines vorhandenen Kontos benötigt keinen Clerk-Netzwerkaufruf.

Bestätigt sind getrennte Revisionen, parallele Änderungen an unterschiedlichen Fahrzeugen, Konflikt und atomarer Rollback im selben Fahrzeug, Vorgangskennungen nach verlorenen Antworten sowie einmalige Kosten. Testmails und manuell angeforderte Sicherungen behalten ihre Kennungen ebenfalls bei Wiederholungen. Gemeinsame Werkstätten und historische Werkstattkopien, fahrzeugbezogene Kategorien und schreibgeschützte Archivierung sind geprüft.

Seitennavigation liefert stabile Seiten ohne Lücken. Historienfilter laufen über die gesamte Fahrzeughistorie; Belegfilter prüfen zugehörige Originale. Änderungen liefern kleine bestätigte Antworten. Verspätete Antworten nach Abmeldung, Fahrzeug- oder Ansichtswechsel werden verworfen.

## Lokale Cloudflare-Laufzeit und Last

Die HTTP-Aufrufe liefen in echtem lokalem workerd mit lokaler D1-Datenbank und privatem lokalem R2. Je Buchung gibt es eine verknüpfte Arbeit, ein Dokument und zwei Dokumentverknüpfungen. Datei-Originale werden beim Einstieg nicht geladen.

| Buchungen | Arbeiten | Dokumente | Einstieg ms | Einstieg Bytes | Änderung ms | Änderung Bytes |
|---|---|---|---|---|---|---|
| 100 | 100 | 100 | 89 | 58465 | 31 | 1813 |
| 1000 | 1000 | 1000 | 81 | 58531 | 27 | 1821 |
| 3000 | 3000 | 3000 | 97 | 58587 | 40 | 1822 |

Das sind lokale Antwortzeiten einschließlich D1, keine Internet- oder produktiven CPU-Messwerte. Ziel unter zwei Sekunden lokal erreicht. Bei 1.000 Buchungen lag die vorherige kleine Einstellungsantwort bei rund 983 kB; die aktuelle kleine Fahrzeugänderung liefert etwa 1,8 kB. Die Änderungstypen unterscheiden sich; dies ist kein identischer Produktionsbenchmark. Rohdaten: test-results/runtime.json.

Die aktuellen [D1-Limits](https://developers.cloudflare.com/d1/platform/limits/) nennen unter anderem 500 MB pro kostenloser Datenbank und 50 Abfragen pro Worker-Aufruf; ein D1-Batch zählt dabei als eine Abfrage. Die tatsächliche CPU-Zeit, Datenbankgröße und weitere Kontingente müssen in der getrennten Cloudflare-Testumgebung vor Freigabe gemessen werden.

## Sicherungen, Originale und Wiederherstellung

Geprüft sind alte vollständige Google-ZIPs, neue Fahrzeug- und Kontoarchive, fehlende/doppelte/manipulierte Teilnummern, falsche oder zusammengewürfelte Manifeste, defekte Prüfsummen, fehlende Originale, getrennte Vorbereitung und ausdrückliche Aktivierung. Fahrzeugwiederherstellung erhält andere Fahrzeuge und gemeinsame Einstellungen. Kontoaktivierung prüft die Revisionen aller bisherigen Fahrzeuge. Wiederholte Übernahmen erzeugen keine zusätzlichen Einträge.

Eine tatsächlich gespeicherte alte D1-Akte wurde mit IDs, Beträgen, Arbeiten und Historie übernommen. Ihre bisherigen Tabellen bleiben auch nach neuen Änderungen lesbar und unverändert. Die Sicherung vor Migration lässt sich nach einem Abbruch mit denselben Bytes wiederholen. Dieser lokale Rückweg ersetzt keinen Rollback neuer Buchungen auf eine alte Website; die Anleitung beschreibt diese Grenze ausdrücklich.

Dateireservierungen prüfen die Konto-/Gesamtquote atomar. SHA-256, Dateigröße, Original-/Vorschaurolle, unterbrochene R2-Schreibvorgänge und wiederholte Uploads wurden geprüft. Automatische Sicherungen und ihre Aufbewahrung arbeiten in begrenzten Schritten; unbestätigte abgebrochene Sicherungsteile werden bereinigt, Originale und bestätigte frühere Sicherungen bleiben geschützt.

Der große ZIP-Rundlauf verwendete echte ZIP-Dateien, synthetische Belegbytes und vollständige SHA-Prüfungen. Der Übernahmeadapter war hierbei ein lokaler Ersatz; die Rechteprüfung erfolgt zusätzlich in den SQLite-/API-Tests.

| Originalbytes | Dokumente | ZIP-Teile | Sekunden | beobachtetes RSS nach GC, MB |
|---|---|---|---|---|
| 268000000 | 67 | 14 | 17 | 154 |
| 960000000 | 240 | 48 | 63 | 291 |

Die Speicherangaben sind Stichproben nach Garbage Collection, keine gemessenen Spitzenwerte. Originale werden einzeln statt gemeinsam im Arbeitsspeicher verarbeitet. Rohdaten: test-results/large-backup.json. Keine 960 MB wurden zu einem externen Dienst übertragen.

## Tagesaufgaben und Anbieterbereinigung

08:00 Uhr Europe/Berlin einschließlich Zeitumstellungen, pausierte Automation, gebündelte Wartungsmail für aktive Fahrzeuge, bestätigte Empfängeradresse, identische Wiederholung nach verlorener Resend-Antwort, drei Testmails im rollenden Stundenfenster sowie globales App-Versandbudget geprüft. Jobfehler werden am äußeren Cron-Aufruf sichtbar und im Konto gespeichert. Aufbewahrung und fehlgeschlagene Sicherungen schützen vorherige bestätigte Sicherungen.

Die vorbereitete Übernahme der alten Tankstellen-Caches erhält globale Aufrufgrenzen, führt keine ungewollten SQL-Anweisungen aus und verweigert fremde Quelltabellen. Live-Übernahme und Stilllegung alter Anbieterkomponenten wurden nicht ausgeführt.

## Browserprüfung

Die React-Oberfläche und der echte Cloudflare-Adapter liefen gegen die lokale Test-API mit synthetischen Sitzungstokens. Das ist kein echter Clerk-Login. Geprüft wurden Desktop und ein 390 Pixel breiter mobiler Rahmen unter der vorgesehenen CSP; für den mobilen Testrahmen ist ausschließlich lokal ein gleichnamiger iframe zugelassen.

- Start ohne Browserfehler; 123 Testbuchungen und zwei Fahrzeuge. Wechsel, gespeicherter Motorwert und letzte Fahrzeugauswahl nach Neuladen bestätigt.
- 50 Einträge, danach 100 geladene Einträge; serverseitige Suche findet Testrechnung 0 außerhalb der ersten Seite. Zweites Konto zeigt keine Ausgaben oder Bilder des ersten Kontos.
- Elf synthetische Fahrzeugbilder hochgeladen, Standardfoto gewählt, zehn Kacheln plus Weiter-Link am Desktop und vier plus Weiter-Link mobil. Kopfbereich auf schmalen Displays korrigiert.
- Digitales zweitseitiges PDF: Datum, Nummer, Verkäufer, 72,59 EUR und Positionspreise erkannt. Manuell geänderter Titel bleibt nach erneutem Auslesen erhalten. Nach bestätigtem Speichern erhöht sich die Kostensumme genau um 72,59 EUR.
- Gescannte PDF lokal mit deutschen/englischen Sprachdaten erkannt, keine CSP-Fehler. Abbruch funktioniert; Felder bleiben bearbeitbar.
- Nachweise: test-results/fleet-desktop.png, fleet-mobile.png und fleet-ocr.png. Sie enthalten ausschließlich synthetische Daten und bleiben von Git ausgeschlossen.

Die zunächst weiße Testseite wurde behoben: Der erzeugte JSON-Prüfer hatte eine nicht browserfähige CommonJS-Anweisung; zusätzlich enthielt die lokale API-Adresse einen falschen Port. Der Build prüft das öffentliche Ergebnis nun auf diesen Fehler. OCR-Workerpfade beginnen an der Websitewurzel und funktionieren auch aus der verschachtelten Testseite.

## Vor der produktiven Freigabe noch erforderlich

1. Getrennte Cloudflare-Testressourcen und Clerk Development gemäß [Umstellungsanleitung](docs/UMSTELLUNG_CLOUDFLARE.md) einrichten; Vorlagen und Prüfung gegen produktive Datenbindungen liegen vor.
2. Echte Einladung, Passwortzurücksetzung, Sitzung/Abmelden und parallele Verwendung auf zwei physischen Geräten prüfen.
3. Tatsächliche Worker-CPU, D1-/R2-Kontingente, echten Resend-Versand sowie automatischen Tageslauf/Sicherung abnehmen.
4. Vor dem produktiven Wechsel D1 und Originale sichern, Übernahme probeweise durchführen und den Rückweg dokumentieren. Erst danach Freigabe, Domainwechsel und Stilllegung alter Dienste.

Es wurde nichts committed, gepusht, veröffentlicht, an produktiven Konten umgestellt oder aus der bisherigen Google-Akte gelöscht.
