# Fahrzeugakte

Fahrzeugakte mit einem Fahrzeug pro Konto. Der neue, lokal vorbereitete Betrieb verwendet E-Mail/Passwort und Einladungen über Clerk, Cloudflare D1 für Einträge, privates R2 für Originale und Vorschauen sowie Resend für Wartungsmails. Handy und PC greifen nach Anmeldung auf dieselbe Akte zu. Internet ist erforderlich.

Repository: [julianrdk/scala-fahrzeugakte](https://github.com/julianrdk/scala-fahrzeugakte), Zieldomain **https://car.jurodak.com**. Die bisherige öffentliche Google-Konfiguration bleibt erhalten, bis der Nutzer bewusst umstellt. Kontoeinrichtung, echte Datenübernahme, Commit, Push und Veröffentlichung stehen noch aus. Die vollständige Reihenfolge steht unter **[Eigene Konten einrichten](docs/EIGENE_KONTEN_EINRICHTEN.md)**. Google-Tabelle, Drive-Dateien und alte Sicherungen werden durch den Wechsel nicht gelöscht.

Ein neues Konto beginnt leer und bietet ZIP-Übernahme oder neues Fahrzeug an. **Testmodus öffnen** führt weiterhin in einen getrennten IndexedDB-Speicher dieses Browsers. Er bestätigt weder Clerk- noch Google-Anmeldung und sendet keine E-Mails. Beispieldateien sind ausdrücklich Testdaten.

## Lokal starten

Voraussetzungen: Node.js 24 und pnpm 11.25.0. Mit `corepack enable`/`corepack prepare pnpm@11.25.0 --activate` oder pnpm gemäß offizieller Installationsanleitung einrichten.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

Die ausgegebene lokale URL öffnen. Für die Oberfläche ohne Kontokonfiguration den ausdrücklich bezeichneten Testmodus verwenden. Echte Clerk-Tests benötigen eine getrennte Development-Instanz und eine dafür konfigurierte lokale API; Produktionsschlüssel gehören ausschließlich in die vorgesehene Konfiguration.

## Enthalten

- Übersicht, filterbare Historie mit Detailbearbeitung, Archiv und Storno; manuelle Erfassung und gemeinsamer ChatGPT-Import.
- Unbekannte Beträge/Datum/Kilometer bleiben offen; Kauf, Arbeit, Erstattung, Verkauf und Planung sind getrennt.
- JSON-Schema v1, Paketvorschau, exakte Dateizuordnung, Mehrdeutigkeiten, SHA-256, Dateiwiederverwendung und fachliche Dublettenhinweise.
- Fahrzeug, Kilometerhistorie, eigene Bilder, Umbauten mit Material und Genehmigungsangaben, Dokumentablage ohne Buchung.
- Fahrzeuggalerie mit Mehrfachauswahl und Standardfoto; statische Pinnwand in der Übersicht mit bis zu zehn Bildern am Desktop beziehungsweise vier auf schmalen Displays.
- Kostenlose lokale Belegerkennung mit PDF.js und Tesseract.js, Belegvorschau, bearbeitbaren Positionen und getrennten Rechnungs-/Arbeitsdaten. Code und Sprachdaten werden mit der Website bereitgestellt.
- Werkstattprofile mit Eigenleistungsstandard und historischen Kopien im Arbeitseintrag; optionale Positionspreise ohne Änderung des JSON-Vertrags v1.
- Datum-ODER-Kilometer-Fälligkeit, bestätigte Erledigung, Kalenderarithmetik, Mail-Bündelung und kopierbare Recherchetexte.
- Atomare Revisionen und wiederholbare Speichervorgänge; D1 schreibt nur geänderte Datensätze und liefert den bestätigten Stand direkt zurück.
- Kleine private Bildvorschauen, höchstens zwei gleichzeitige Abrufe und kontogetrennter Browsercache; Originale erst bei Großansicht oder Download.
- Speicherreservierung mit 1 GB pro Konto und 8 GB insgesamt, tägliche Sicherungen, ZIP/CSV-Export und geprüfte Wiederherstellung in einen getrennten Speicherbereich.
- A4-Serviceheft, Kostenübersicht und Verkaufsfassung; responsive Oberfläche und Startbildschirm-Manifest.
- Eingabebeispiele als Platzhalter; unbekannte Angaben werden dadurch nicht vorausgefüllt oder gespeichert.
- Eigener Hauptbereich Tankstellen mit OpenStreetMap-Karte, optionaler Standortfreigabe, deutscher PLZ-Suche, E5/E10/Diesel und Umkreisfilter. Livepreise über den geschützten Cloudflare-Dienst nach [einmaliger Einrichtung](docs/TANKSTELLENSUCHE.md); der externe Link bleibt verfügbar.

## Wegweiser

| Datei | Zweck |
| --- | --- |
| [docs/EIGENE_KONTEN_EINRICHTEN.md](docs/EIGENE_KONTEN_EINRICHTEN.md) | Neuer Betrieb: Clerk, D1, privates R2, Resend, DNS, ZIP-Übernahme und Freigabe |
| [auth/data-schema.sql](auth/data-schema.sql) | Wiederholbares Schema für die neue D1-Datenbank `fahrzeugakte-daten` |
| [config/cloudflare-public.example.json](config/cloudflare-public.example.json) | Öffentliche Platzhalter für die neue Website-Konfiguration |
| [SETUP.md](SETUP.md) | Einrichtung ab Domain/Repository, kleinste nächste Schritte und Fehlerhilfe |
| [docs/CLOUDFLARE_ANMELDUNG.md](docs/CLOUDFLARE_ANMELDUNG.md) | Kostenloser zusätzlicher Anmeldedienst, Sitzungscookie und Schrittfolge |
| [docs/TANKSTELLENSUCHE.md](docs/TANKSTELLENSUCHE.md) | Kostenlosen Tankerkönig-Schlüssel eintragen, Datenbank ergänzen und Karte prüfen |
| [docs/GALERIE_UND_BELEGERKENNUNG.md](docs/GALERIE_UND_BELEGERKENNUNG.md) | Galerie, kostenlose OCR und Werkstätten verwenden; bestehendes Apps Script vor dem Push aktualisieren |
| [DATA_MODEL.md](DATA_MODEL.md) | Tabellen, Kostenlogik, Transaktionen, Revisionen, Grenzen |
| [BACKUP_RESTORE.md](BACKUP_RESTORE.md) | ZIP und Drive-Sicherung, geprüfter Wiederherstellungsablauf |
| [TEST_REPORT.md](TEST_REPORT.md) | Tatsächliche lokale Prüfungen und verbleibende Kontotests |
| [shared/import-v1.schema.json](shared/import-v1.schema.json) | Verbindliches maschinenlesbares Format |
| [docs/ERFASSUNGSPROMPT_ALLGEMEIN.md](docs/ERFASSUNGSPROMPT_ALLGEMEIN.md) | Erfassungsprompt für beliebige Fahrzeuge, mit unverändertem JSON-Vertrag |
| [docs/CHATGPT_ERFASSUNGSPROMPT.md](docs/CHATGPT_ERFASSUNGSPROMPT.md) | Ursprünglicher fahrzeugspezifischer Erfassungsprompt, als Anlage erhalten |
| [docs/JSON_VERTRAG_V1.md](docs/JSON_VERTRAG_V1.md) | Beigefügter Vertrag im Wortlaut |
| [docs/STARTAUFTRAG.md](docs/STARTAUFTRAG.md) | Vollständige Ausgangsvorgabe |
| [config/script-properties.example.json](config/script-properties.example.json) | Nur im Apps-Script-Editor einzutragende Kontokonfiguration |

Nur diesen Projektordner in das Ziel-Repository übernehmen. Die vorhandenen Fahrzeugunterlagen im übergeordneten Arbeitsverzeichnis gehören nicht in Repository oder Build. Private Cloudflare-Werte ausschließlich als Secrets hinterlegen; `config/private-auth-key.txt` ist von Git und Quellcodearchiv ausgeschlossen.

## Quellaufteilung

`src/`: Oberfläche und Adapter, `shared/`: Format und Fachlogik, `auth/src/v2/`: Clerk-API, D1/R2-Speicherung und Tagesaufgaben, `apps-script/src/`: weiterhin verfügbares Google-Backend, `tests/`: Fach- und Adaptertests. `pnpm build` erzeugt `dist/` für GitHub Pages, `auth/dist/` für die Cloudflare-API und `auth/scheduler-dist/` für den separaten Cron-Worker. Das bisherige Apps-Script-Bundle wird zur Kompatibilitätsprüfung ebenfalls gebaut. `dist/` enthält keinen Backendcode.

`pnpm dev` und `pnpm build` erzeugen die ignorierten OCR-Assets unter `public/ocr/` aus den im Lockfile festgelegten Paketen. Belege werden im Browser ausgewertet; Originale erst nach Bestätigung hochgeladen. Im neuen Cloudflare-Betrieb ist keine Apps-Script-Veröffentlichung nötig. Wer den bisherigen Google-Betrieb weiterverwendet, beachtet weiterhin die [Anleitung für die optionalen Tabellenspalten](docs/GALERIE_UND_BELEGERKENNUNG.md).

Keine KI-API, keine ChatGPT-Anmeldung und keine automatische Dokumentübertragung an KI-Dienste. Originale werden ausschließlich über den angemeldeten Datenadapter gespeichert. Keine Offline-Bearbeitung oder Hintergrundsynchronisation. Clerk verwaltet Passwörter und Sitzungen; die App speichert keine eigenen Passwörter. Vorschauen liegen zusätzlich im kontogetrennten IndexedDB-Cache und werden beim Abmelden verworfen. Die öffentliche Konfiguration `backend=cloudflare` aktiviert den neuen Adapter; normale Aktenzugriffe benötigen dann keine Google-Aufrufe. Ladezeiten für Sitzungsprüfung, Aktenstart, Vorschauen und Speichern sind in den Einstellungen dieses Tabs prüfbar.

Der bisherige Google-Betrieb bleibt für Export und Rückkehr verfügbar. Seine eigene Kontokonfiguration und Google-Tokenverwaltung sind ausschließlich in der [alten Anmeldeanleitung](docs/CLOUDFLARE_ANMELDUNG.md) beschrieben; sie sind keine Voraussetzung für den neuen Betrieb.
