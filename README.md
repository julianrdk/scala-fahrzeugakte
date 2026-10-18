# Scala Fahrzeugakte

Private Fahrzeugakte für einen Škoda Scala. React/TypeScript/Vite als statische Oberfläche, Google Sheets für strukturierte Daten, Google Drive für unveränderte Originale und Google Apps Script für validierte Zugriffe und tägliche Aufgaben.

Repository: [julianrdk/scala-fahrzeugakte](https://github.com/julianrdk/scala-fahrzeugakte), veröffentlicht unter **https://car.jurodak.com**. Der Nutzer hat den echten Google-Lese-/Schreibtest, den Testmail-Eingang sowie Beispieldokument-Upload/Öffnen/Download bestätigt. Triggerlauf und echte Wiederherstellung sind noch offen. Der zusätzliche Cloudflare-Anmeldedienst ist gebaut und lokal getestet, aber noch nicht eingerichtet oder aktiviert; siehe [Einrichtung der dauerhaften Anmeldung](docs/CLOUDFLARE_ANMELDUNG.md).

Die echte Akte beginnt leer. **Testmodus öffnen** führt in einen getrennten, leeren IndexedDB-Speicher dieses Browsers. Keine Google-Verbindung wird simuliert, keine E-Mail versendet. Beispieldateien sind ausdrücklich Testdaten.

## Lokal starten

Voraussetzungen: Node.js 24 und pnpm 11.25.0. Mit `corepack enable`/`corepack prepare pnpm@11.25.0 --activate` oder pnpm gemäß offizieller Installationsanleitung einrichten.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

Die ausgegebene lokale URL öffnen. Produktive Anmeldung ist absichtlich erst auf der konfigurierten eigenen HTTPS-Origin möglich. Lokal den ausdrücklich bezeichneten Testmodus verwenden.

## Enthalten

- Übersicht, filterbare Historie mit Detailbearbeitung, Archiv und Storno; manuelle Erfassung und gemeinsamer ChatGPT-Import.
- Unbekannte Beträge/Datum/Kilometer bleiben offen; Kauf, Arbeit, Erstattung, Verkauf und Planung sind getrennt.
- JSON-Schema v1, Paketvorschau, exakte Dateizuordnung, Mehrdeutigkeiten, SHA-256, Dateiwiederverwendung und fachliche Dublettenhinweise.
- Fahrzeug, Kilometerhistorie, eigene Bilder, Umbauten mit Material und Genehmigungsangaben, Dokumentablage ohne Buchung.
- Datum-ODER-Kilometer-Fälligkeit, bestätigte Erledigung, Kalenderarithmetik, Mail-Bündelung und kopierbare Recherchetexte.
- Atomare Tabellencommits, Sperre und Revisionen, datierte Sicherungen, ZIP/CSV-Export, Wiederherstellung in neue Ressourcen.
- A4-Serviceheft, Kostenübersicht und Verkaufsfassung; responsive Oberfläche und Startbildschirm-Manifest.
- Tankpreis-Link ohne Schlüssel. Integrierte Tankerkönig-Suche/Karte ist die optionale, hier nicht aktivierte Erweiterung.

## Wegweiser

| Datei | Zweck |
| --- | --- |
| [SETUP.md](SETUP.md) | Einrichtung ab Domain/Repository, kleinste nächste Schritte und Fehlerhilfe |
| [docs/CLOUDFLARE_ANMELDUNG.md](docs/CLOUDFLARE_ANMELDUNG.md) | Kostenloser zusätzlicher Anmeldedienst, Sitzungscookie und Schrittfolge |
| [DATA_MODEL.md](DATA_MODEL.md) | Tabellen, Kostenlogik, Transaktionen, Revisionen, Grenzen |
| [BACKUP_RESTORE.md](BACKUP_RESTORE.md) | ZIP und Drive-Sicherung, geprüfter Wiederherstellungsablauf |
| [TEST_REPORT.md](TEST_REPORT.md) | Tatsächliche lokale Prüfungen und verbleibende Kontotests |
| [shared/import-v1.schema.json](shared/import-v1.schema.json) | Verbindliches maschinenlesbares Format |
| [docs/CHATGPT_ERFASSUNGSPROMPT.md](docs/CHATGPT_ERFASSUNGSPROMPT.md) | Unveränderter Erfassungsprompt aus dem Startauftrag |
| [docs/JSON_VERTRAG_V1.md](docs/JSON_VERTRAG_V1.md) | Beigefügter Vertrag im Wortlaut |
| [docs/STARTAUFTRAG.md](docs/STARTAUFTRAG.md) | Vollständige Ausgangsvorgabe |
| [config/script-properties.example.json](config/script-properties.example.json) | Nur im Apps-Script-Editor einzutragende Kontokonfiguration |

Nur diesen Projektordner in das Ziel-Repository übernehmen. Die vorhandenen Fahrzeugunterlagen im übergeordneten Arbeitsverzeichnis gehören nicht in Repository oder Build. Private Cloudflare-Werte ausschließlich als Secrets hinterlegen; `config/private-auth-key.txt` ist von Git und Quellcodearchiv ausgeschlossen.

## Quellaufteilung

`src/`: Oberfläche und Adapter, `shared/`: Format und Fachlogik, `apps-script/src/`: Google-Backend, `auth/src/`: optionaler Cloudflare-Sitzungsdienst, `tests/`: Fach- und Adaptertests. `pnpm build` erzeugt `dist/` für GitHub Pages, `apps-script/dist/Code.js` plus Manifest und `auth/dist/` für Cloudflare Pages. Öffentliche Apps-Script-Einstiegspunkte werden nach dem Bundling angefügt und geprüft. `dist/` enthält keinen Backendcode.

Keine KI-API, keine ChatGPT-Anmeldung, keine automatische Dokumentübertragung an KI-Dienste. Originale werden ausschließlich über den autorisierten Datenadapter gespeichert. Keine Service-Worker-Caches oder Hintergrundsynchronisation. Der bisherige Adapter hält Google-Tokens nur im Arbeitsspeicher. Die vom Nutzer gewünschte optionale dauerhafte Sitzung hält Tokens verschlüsselt serverseitig in Cloudflare D1 und Google-Client-/Verschlüsselungsschlüssel als Cloudflare-Secrets; Google-Tokens gelangen damit nicht in den Browser. Erst die öffentliche Konfiguration `authOrigin` aktiviert diesen Adapter. Dabei werden Anfragen/Dateien durch Cloudflare zu Google geleitet; die zusätzlichen Datenverarbeitungs- und Einrichtungsdetails stehen in der Anleitung.
