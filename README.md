# Fahrzeugakte

Fahrzeugakte mit getrennten Google-Konten. Ein Fahrzeug pro Konto; Hersteller und Modell werden beim Hinzufügen angegeben. React/TypeScript/Vite als statische Oberfläche, Google Sheets für strukturierte Daten, Google Drive für unveränderte Originale und Google Apps Script für validierte Zugriffe und tägliche Aufgaben.

Repository: [julianrdk/scala-fahrzeugakte](https://github.com/julianrdk/scala-fahrzeugakte), veröffentlicht unter **https://car.jurodak.com**. Der Nutzer hat den echten Google-Lese-/Schreibtest, den Testmail-Eingang sowie Beispieldokument-Upload/Öffnen/Download bestätigt. Der Cloudflare-Anmeldedienst ist eingerichtet und aktiviert. Dauerhafte Anmeldung nach Browserneustart, zweites echtes Konto, Tagesprüfungs-Worker und echte Wiederherstellung sind noch offen; siehe [Einrichtung der dauerhaften Anmeldung](docs/CLOUDFLARE_ANMELDUNG.md). Die neue Tankstellenkarte ist lokal vorbereitet; Livepreise benötigen die zusätzliche Einrichtung unten.

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
- Fahrzeuggalerie mit Mehrfachauswahl und Standardfoto; statische Pinnwand in der Übersicht mit bis zu zehn Bildern am Desktop beziehungsweise vier auf schmalen Displays.
- Kostenlose lokale Belegerkennung mit PDF.js und Tesseract.js, Belegvorschau, bearbeitbaren Positionen und getrennten Rechnungs-/Arbeitsdaten. Code und Sprachdaten werden mit der Website bereitgestellt.
- Werkstattprofile mit Eigenleistungsstandard und historischen Kopien im Arbeitseintrag; optionale Positionspreise ohne Änderung des JSON-Vertrags v1.
- Datum-ODER-Kilometer-Fälligkeit, bestätigte Erledigung, Kalenderarithmetik, Mail-Bündelung und kopierbare Recherchetexte.
- Atomare Tabellencommits, Sperre und Revisionen, datierte Sicherungen, ZIP/CSV-Export, Wiederherstellung in neue Ressourcen.
- A4-Serviceheft, Kostenübersicht und Verkaufsfassung; responsive Oberfläche und Startbildschirm-Manifest.
- Eingabebeispiele als Platzhalter; unbekannte Angaben werden dadurch nicht vorausgefüllt oder gespeichert.
- Eigener Hauptbereich Tankstellen mit OpenStreetMap-Karte, optionaler Standortfreigabe, deutscher PLZ-Suche, E5/E10/Diesel und Umkreisfilter. Livepreise über den geschützten Cloudflare-Dienst nach [einmaliger Einrichtung](docs/TANKSTELLENSUCHE.md); der externe Link bleibt verfügbar.

## Wegweiser

| Datei | Zweck |
| --- | --- |
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

`src/`: Oberfläche und Adapter, `shared/`: Format und Fachlogik, `apps-script/src/`: Google-Backend, `auth/src/`: optionaler Cloudflare-Sitzungsdienst, `tests/`: Fach- und Adaptertests. `pnpm build` erzeugt `dist/` für GitHub Pages, `apps-script/dist/Code.js` plus Manifest und `auth/dist/` für Cloudflare Pages. Öffentliche Apps-Script-Einstiegspunkte werden nach dem Bundling angefügt und geprüft. `dist/` enthält keinen Backendcode.

`pnpm dev` und `pnpm build` erzeugen die ignorierten OCR-Assets unter `public/ocr/` aus den im Lockfile festgelegten Paketen. Belege werden im Browser ausgewertet; Originale erst nach Bestätigung hochgeladen. Die neuen optionalen Speicherspalten benötigen eine neue Version der bestehenden Apps-Script-Bereitstellung. Vor der automatischen Erweiterung wird die alte Integrität geprüft und eine datierte Sicherung angelegt. Schrittfolge: [Galerie und Belegerkennung einrichten](docs/GALERIE_UND_BELEGERKENNUNG.md).

Keine KI-API, keine ChatGPT-Anmeldung, keine automatische Dokumentübertragung an KI-Dienste. Originale werden ausschließlich über den autorisierten Datenadapter gespeichert. Keine Service-Worker-Caches oder Hintergrundsynchronisation. Der bisherige Adapter hält Google-Tokens nur im Arbeitsspeicher. Das Backend bleibt standardmäßig auf den bisherigen Eigentümer beschränkt. Für die gewünschte gemeinsame Website wird der Mehrkontomodus ausdrücklich aktiviert: Cloudflare ACCOUNT_MODE=multi, Apps Script MULTI_USER_MODE=true und das API-Manifest für angemeldete Nutzer. Jedes Konto erhält eigene private Google-Dateien und eigene UserProperties; die bisherigen Eigentümerdateien bleiben unverändert. Die HTTP-Anmeldefunktion und der separate Cron Worker verwenden dieselbe kontoabhängige D1-Zuordnung. Die vom Nutzer gewünschte optionale dauerhafte Sitzung hält Tokens verschlüsselt serverseitig in Cloudflare D1 und Google-Client-/Verschlüsselungsschlüssel als Cloudflare-Secrets; Google-Tokens gelangen damit nicht in den Browser. Erst die öffentliche Konfiguration `authOrigin` aktiviert diesen Adapter. Dabei werden Anfragen/Dateien durch Cloudflare zu Google geleitet; die zusätzlichen Datenverarbeitungs- und Einrichtungsdetails stehen in der Anleitung.
