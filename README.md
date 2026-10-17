# Scala Fahrzeugakte

Private Fahrzeugakte für einen Škoda Scala. React/TypeScript/Vite als statische Oberfläche, Google Sheets für strukturierte Daten, Google Drive für unveränderte Originale und Google Apps Script für validierte Zugriffe und tägliche Aufgaben.

Ziel-Repository: [julianrdk/scala-fahrzeugakte](https://github.com/julianrdk/scala-fahrzeugakte). Vorgesehene eigene Domain: **car.jurodak.com**. Die Domain- und Google-Einrichtung steht noch aus; die App ist noch nicht als verbundene Produktivakte bestätigt.

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
| [DATA_MODEL.md](DATA_MODEL.md) | Tabellen, Kostenlogik, Transaktionen, Revisionen, Grenzen |
| [BACKUP_RESTORE.md](BACKUP_RESTORE.md) | ZIP und Drive-Sicherung, geprüfter Wiederherstellungsablauf |
| [TEST_REPORT.md](TEST_REPORT.md) | Tatsächliche lokale Prüfungen und verbleibende Kontotests |
| [shared/import-v1.schema.json](shared/import-v1.schema.json) | Verbindliches maschinenlesbares Format |
| [docs/CHATGPT_ERFASSUNGSPROMPT.md](docs/CHATGPT_ERFASSUNGSPROMPT.md) | Unveränderter Erfassungsprompt aus dem Startauftrag |
| [docs/JSON_VERTRAG_V1.md](docs/JSON_VERTRAG_V1.md) | Beigefügter Vertrag im Wortlaut |
| [docs/STARTAUFTRAG.md](docs/STARTAUFTRAG.md) | Vollständige Ausgangsvorgabe |
| [config/script-properties.example.json](config/script-properties.example.json) | Nur im Apps-Script-Editor einzutragende Kontokonfiguration |

Nur diesen Projektordner in das Ziel-Repository übernehmen. Die vorhandenen Fahrzeugunterlagen im übergeordneten Arbeitsverzeichnis gehören nicht in Repository oder Build. Das Remote-Repository wurde vom Nutzer angelegt; eine Veröffentlichung als verbundene Produktivakte ist noch nicht bestätigt.

## Quellaufteilung

`src/`: Oberfläche und Adapter, `shared/`: Format und Fachlogik, `apps-script/src/`: Google-Backend, `tests/`: Fach- und Adaptertests. `pnpm build` erzeugt `dist/` für Pages und `apps-script/dist/Code.js` plus Manifest für Apps Script. Öffentliche Top-Level-Einstiegspunkte werden erst nach dem Bundling angefügt und geprüft. `dist/` enthält keinen Backendcode.

Keine KI-API, keine ChatGPT-Anmeldung, keine automatische Dokumentübertragung an KI-Dienste. Originale werden ausschließlich über den autorisierten Datenadapter gespeichert. Keine Service-Worker-Caches, keine Hintergrundsynchronisation und keine Speicherung von Zugriffstokens außerhalb des Arbeitsspeichers.
