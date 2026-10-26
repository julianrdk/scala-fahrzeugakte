# Testbericht

Prüfstand der lokalen Abnahme: 26. Oktober 2026, Europe/Berlin. Lokale Umsetzung für **car.jurodak.com**. Bei diesen Tests wurde kein Google-Konto verbunden, keine echte Mail verschickt und keine Website veröffentlicht. Das Ziel-Repository **julianrdk/scala-fahrzeugakte** wurde vom Nutzer bereitgestellt; der jeweilige Online-Prüflauf ist unter GitHub Actions nachvollziehbar. Galerie, Pinnwand, Werkstattprofile und lokale Belegerkennung wurden ausschließlich lokal vorbereitet. Commit, Push und Apps-Script-Veröffentlichung bleiben beim Nutzer.

## Automatisierte Prüfungen

Vollständige lokale Prüfung einschließlich Galerie, Belegerkennung, Tankstellensuche und Sitzungsadapter: **194 Tests in 15 Dateien**, TypeScript-Prüfung, Vite-Produktionsbuild, Apps-Script-Build und Cloudflare-Pages-Build. Die Prüfungen entsprechen den Schritten von `pnpm check`. Zusätzlich wird das gebaute Apps-Script-Bundle ohne Browser-/Node-Globals in einem isolierten V8-Kontext geladen; alle vier öffentlichen Top-Level-Funktionen bleiben vorhanden. Das GitHub-Pages-Artefakt enthält nur Frontend und öffentliche Konfiguration; der Cloudflare-Dienst wird separat gebaut. Der Build prüft auch, dass OCR-Worker, Sprachdateien, Core-Varianten und Lizenztexte tatsächlich im Website-Artefakt liegen.

`pnpm audit --json` am 26. Oktober: zunächst vier Meldungen zur transitiven Bibliothek `fast-uri` 3.1.8. Nach kompatibler Aktualisierung auf 3.1.9 meldete die erneute Registry-Prüfung **0 bekannte Schwachstellen**, einschließlich der neuen PDF-/OCR-Abhängigkeiten. Exakte Versionen und Integritätshashes stehen im Lockfile. Ein Audit ersetzt keine vollständige Sicherheitsanalyse.

| Bereich | Nachweis |
| --- | --- |
| JSON-Vertrag | Gute und fehlerhafte Repository-Beispiele, Versionen, Integer-Cent, Kalenderdaten, lokale Referenzen, unbekannte Felder, Markdown-Codeblock |
| Untrusted input | HTML als Text, CSV-/Sheets-Formelinjektion, MIME-Signaturen, Größen-/Hashprüfung |
| Kosten | 50-Euro-Kauf, Einbau ohne neue Zahlung, 10-Euro-Erstattung, 100-Euro-Planung; getrennte Einnahmen/Kauf/Betriebskosten |
| Dubletten | Identische Pakete, geänderte Import-ID, Retry nach verlorener Antwort, neu formulierte Rechnung, doppelte Rechnung im selben Paket, bewusste Begründung |
| Dokumente | Exakte Namen, Mehrdeutigkeit, Hash statt Dateiname, gleicher Name bei verschiedenen Inhalten, mehrfach verwendetes Original |
| Korrektur | Archiv zählt weiter, Storno zählt nicht, ausgeblendete Kategorie zählt weiter, Kostenanteile und Revisionenkonflikt |
| Historie | Alte Kilometer überschreiben keinen neuen bestätigten Stand; unbekannte Beträge/Datum bleiben null; mehr als 100 gespeicherte Einträge |
| Termine | Datum ODER Kilometer, Vorlauf, Monatsende/Schaltjahr, tatsächliche Erledigung, idempotente Erledigung, feste Kalenderregel |
| Verbrauch | Teilbetankungen im vollständigen Intervall; keine Berechnung über eine bekannte Lücke |
| GIS-/REST-Adapter | Deployment-ID, offizieller Endpunkt, Header statt Token-URL, vollständige Scopes, Ablauf und fremde Origin, kein Erfolg bei done:false |
| Cloudflare-Sitzungen (lokal) | Echtes SQLite-Schema, einmaliger browsergebundener State/PKCE, ausschließlich verifiziertes Eigentümerkonto, AES-GCM-Tokens, gehashte Cookies, 30 Tage/12 Stunden, Logout und Ablauf, Origin/CSRF, widerrufene Freigaben, serverseitiges Refresh vor sechs Minuten Restlaufzeit |
| Cloudflare-Aufrufe und Diagnose | Reproduzierter Abbruch bei workerd-inkompatiblem Redirectmodus; unterstützter manueller Modus bei Codeaustausch, Kontoabruf, Refresh, API und Tageslauf; Weiterleitungen vor Weitergabe von Geheimnissen abgewiesen; feste Fehlerkennungen ohne private Inhalte; fehlende Tabelle ohne Teilanmeldung |
| Sitzungsadapter/Weiterleitung | Neue Adapterinstanz stellt Sitzung ohne OAuth her, nur festes Popup akzeptiert, kein Google-Bearer im Browser, kein automatisches Wiederholen von Schreibzugriffen, fester scripts.run-Umschlag, Unicode/JSON-Ausbruch/Größenlimit/ungültiges UTF-8, Stringargument im Google-Backend validiert |
| Tankstellensuche (lokal) | Echtes SQLite mit idempotenter Zusatzmigration und unveränderten Konten; Sitzung, Origin und CSRF; direkter JSON-Endpunkt im Adapter; fehlender/ungültiger/Demo-Schlüssel ohne Netzaufruf; begrenzte Suchfelder und Anfragegröße; gerundeter GPS-Punkt, PLZ-Geocoder mit Cache; atomare gemeinsame Anbietergrenzen bei parallelen Suchen; drei Minuten Ergebniscache; keine Google-Tokens beim Anbieter; Weiterleitungen und private Fehlertexte abgewiesen; fehlende Preise bleiben unbekannt; Kraftstoff-/Umkreisfilter ohne weitere Anbieterabfrage; Wartezeit und Sitzungsablauf |
| Google-Backend (simuliert) | Eigentümer/fehlende Identität, idempotentes Setup, benannte Spalten/stringValue, Integrität, atomarer Batch-Fehler, Uploadabbruch/Dateiwiederverwendung |
| Automation (simuliert) | Ein Editortrigger, globale/regelförmige Aktivierung, Bündelung, Versandwiederholung unterdrückt, unklarer Ausgang, Kontingentfehler und ausdrückliche Testmail |
| Wiederherstellung | Tatsächlicher ZIP/CSV-Rundlauf und simulierte neue Google-Ressourcen; neue Drive-IDs, gleiche Originalbytes, Hashes, Beträge und Links; fehlende Teile abgewiesen |
| Galerie und Pinnwand | Auswahl bestehender Bilddokumente, Standard zuerst, stabile Sortierung, Rechnungsfotos ausgeschlossen; SSR mit 0, 1, 3, 10 und 11 Bildern sowie mobiler Begrenzung auf 4 |
| Private Vorschauen | Höchstens zwei gleichzeitige Abrufe, Wiederverwendung innerhalb einer Sitzung, verworfene verspätete Antworten nach Abmeldung/Kontowechsel, Wiederholung eines fehlgeschlagenen Abrufs |
| Belegvorschläge | Mehrseitiger Text, gültige/ungültige Datumsangaben, mehrdeutige Rechnungsbeträge, Netto/Brutto, Positionen und reale OCR-Textregression; keine erfundenen Nullbeträge |
| Werkstätten und Preise | Eigenleistungsstandard nur aktiv, historische Kopie trotz Profiländerung, genaue Dezimalpreise, ganze Positions-Cent, unpassende Referenzen abgewiesen, Kosten einmal, Retry und Prototypnamen abgesichert; v1 weiterhin strikt |
| Tabellenumstellung | Altes Layout ohne Schreibzugriff lesbar, Sicherung vor Umstellung, konstante IDs, Manipulation vor Sicherung abgewiesen, atomarer Fehler mit Wiederholung, Rastererweiterung im selben Batch, keine ignorierten neuen Zellen unter altem Header, Restore neuer Zusatzangaben |
| CSV-Zusatzfelder | Optionale Positionspreise auch dann enthalten, wenn die erste Zeile noch das alte Feldset besitzt |

**Simuliert bedeutet:** Die Tests führen den echten Backend-/Adaptercode gegen kontrollierte lokale Google-Service-Ersatzobjekte aus. Sie beweisen keine realen Google-Berechtigungen, Servicequoten oder Mailzustellung.

## Erster echter Verbindungstest: falsche Integritätsmeldung

Der Nutzer konnte sich verbinden; erst der Lese-/Schreibtest meldete eine direkte Tabellenänderung. Er bestätigte, keine Tabellenzellen geändert zu haben. Der bisherige Code kombinierte Advanced-Sheets-API-Schreibvorgänge mit SpreadsheetApp-Lesevorgängen. Ein Test mit zwischengespeicherten SpreadsheetApp-Werten reproduziert exakt die Fehlermeldung beim Rücklesen des frisch geschriebenen Prüfeintrags. Ein zweiter Regressionstest zeigt, dass derselbe alte Cache echte Änderungen verdecken konnte.

Die Korrektur liest alle Datenblätter und `_Integrity` gemeinsam per `Sheets.Spreadsheets.get` und verwendet die rohen `userEnteredValue`-Felder. Die Prüfsummenberechnung und das Speicherformat bleiben gleich. Es gibt keine neue Prüfsumme für ungeprüfte Daten, keine automatische Freischaltung und keinen Datenreset. Beide Regressionstests sowie ein zusätzlicher Formeltest bestehen; auch alle bisherigen Tests bestehen.

Nach zunächst erneut gemeldetem Fehler bestätigte eine direkte Editor-Diagnose **Leser: neue Korrektur** und **Lesetest: OK**. Der Nutzer bestätigte ausdrücklich den **Lese-/Schreibtest auch auf der Website**, den Eingang der ausdrücklich ausgelösten Testmail sowie Upload/Öffnen/Download des Beispieldokuments. Fremdkonto-Test, automatischer Triggerlauf sowie realer Export/Restore sind damit noch nicht nachgewiesen. Das Einrichtungspaket `examples/einrichtungstest/Belegtest.json` ist gegen das verbindliche Schema geprüft und enthält nur ein Beispieldokument, keine Ausgaben, Arbeiten oder Regeln.

Die Cloudflare-Anmeldung ist inzwischen eingerichtet und in der öffentlichen Website aktiviert. HTTPS, öffentliche Konfiguration, unauthentifizierte Sitzungsprüfung und Start der Anmeldung mit D1-State wurden live geprüft; der echte Google-Rücksprung meldete `GOOGLE_TOKEN`. Ursache im Code: `redirect:'error'` wird von Cloudflares workerd bereits vor dem Netzaufruf abgewiesen. Ein neuer Regressionstest reproduzierte den Abbruch; die Korrektur verwendet durchgehend `manual` und lehnt 3xx-Antworten ausdrücklich ab. Grundlage: [workerd-Implementierung](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c%2B%2B). Der vollständige echte Google-Login, Cookies nach Browserneustart, zweites Konto und Free-CPU-Limit mit 4-MiB-Originalen bleiben bis zur echten Abnahme offen. Tagesprüfungs-Worker ebenfalls noch ausstehend.

## Browserprüfung

### Galerie, Pinnwand und Belegerkennung

Die echte App wurde im getrennten lokalen Testmodus mit ausschließlich synthetischen Fahrzeugbildern und Belegen bei **1280 × 900** und **360 × 800** geprüft:

- Erstes Bild groß, danach zehn weitere Bilder gemeinsam mit Auswahlvorschau gespeichert. Die Standardauswahl blieb durch neue Uploads unverändert. Desktop: zehn Bildkacheln und „+ 1 weitere“; mobil: vier Kacheln und „+ 7 weitere“.
- Standardfoto auf ein Hochformatbild umgestellt, Seite neu geladen und Testakte erneut geöffnet: Auswahl blieb erhalten. Bilder werden vollständig im Rahmen dargestellt. Bild-Großansicht und Schließen geprüft.
- Desktop-Textfläche auf ungefähr 27 Prozent begrenzt; mobile Anordnung mit Text oberhalb der Collage. Galerie einspaltig auf 360 Pixeln. Kein horizontaler Seitenüberlauf: `scrollWidth = clientWidth = 345` einschließlich Scrollbarabzug.
- Digitale PDF mit zwei Seiten direkt gelesen, Seitenvorschau geprüft. Synthetische Scan-PDF und JPG-Belegfoto tatsächlich mit Tesseract.js gelesen. Datum 26.10.2026, Nummer RE-2026-42, Verkäufer, Rechnungsbetrag 72,59 Euro, Mengen 2 / 4,5, Teilenummern OF-42 / OL-5, Einzelpreise 12,50 / 8,00 und Netto-Positionsbeträge 25,00 / 36,00 erkannt. Eine als „|“ erkannte Einheit blieb leer. Ein zuvor erkannter Parserfehler bei der Trennung von Teilenummer und Preis wurde korrigiert und mit dem tatsächlichen OCR-Text als Regressionstest abgesichert.
- Titel und Position manuell korrigiert und erneut ausgelesen: Korrekturen blieben erhalten. Erkennung eines Fotos abgebrochen und anschließend erfolgreich erneut gestartet. Ungültige PDF lieferte einen sichtbaren Lesefehler, die Felder blieben bearbeitbar. Eine passwortgeschützte PDF wurde nicht gesondert im Browser getestet.
- Eigenleistungsprofil als Standard gespeichert; „selbst gemacht“ wählte es voraus. Eine Ausgabe und verknüpfte Arbeit gemeinsam mit Original gespeichert; Verkäufer und Werkstatt blieben getrennt. Tatsächliches Arbeitsdatum und Erledigung separat bestätigt. Historie und Detailansichten zeigten die Material-/Preisangaben und historische Werkstattkopie. Übersicht zählte insgesamt **72,59 Euro**, ohne zusätzliche Kosten für die Arbeit oder die Positionssummen.
- Mobile Belegansicht: Vorschau unter den Feldern, kein Seitenüberlauf (`345/345`). Zusätzlich den **Vite-Produktionsbuild** auf eigener lokaler Origin geöffnet und eine Scan-PDF mit tatsächlich geladenem PDF-Worker, Tesseract-Core und mitgelieferten Sprachdaten erfolgreich ausgelesen; Rechnungsbetrag und Einzelpreise korrekt.

Nachweise: [Pinnwand Desktop](docs/screenshots/pinnwand-desktop-lokal.png), [Pinnwand mobil](docs/screenshots/pinnwand-mobil-lokal.png), [Galerie](docs/screenshots/galerie-desktop-lokal.png), [PDF-Prüfansicht](docs/screenshots/beleg-pdf-desktop-lokal.png), [OCR-Prüfansicht](docs/screenshots/beleg-ocr-desktop-lokal.png), [Beleg mobil](docs/screenshots/beleg-mobil-lokal.png). Keine echten Fahrzeugfotos oder privaten Belege wurden für diese Nachweise veröffentlicht. Kein physisches Mobilgerät, zweites echtes Konto oder produktiver Google-Migrationslauf wurde damit geprüft.

### Bisherige Browserprüfungen

Am 26. Oktober wurde die neue Tankstellenansicht lokal bei **360 × 800** und **1280 × 900** geprüft. Die echte App zeigt den Haupttab und die interaktive Karte im getrennten Testmodus; dort werden bewusst keine Livepreise abgefragt. Eine zusätzliche, nicht veröffentlichte Vorschauseite verwendet dieselben Komponenten mit eindeutig gekennzeichneten synthetischen Tankstellen und Preisen. Geprüft wurden PLZ-Suchablauf, Kraftstoffauswahl, Nur-geöffnet-Filter, Preisreihenfolge, Kartenmarkierungen und das Öffnen eines Kartenpunkts durch Auswahl einer Listenkarte. Alle drei Kraftstoffpreise sowie fehlende Preise sind mobil lesbar. Kein horizontaler Seitenüberlauf (345 beziehungsweise 1265 CSS-Pixel nach Abzug der Scrollbar). Echte Standortfreigabe, Tankerkönig-Schlüssel und reale Anbieterantworten wurden dabei nicht getestet.

In der Fahrzeuganlage waren die Eingaben trotz sichtbarer Beispiele leer. In der Erfassung wurde eine Vorschau nur mit einem Testtitel erstellt: Betrag, Kilometerstand, Liter und Notizen blieben im erzeugten JSON `null`. Die Beispieltexte wurden nicht übernommen; die Vorschau wurde nicht als Ausgabe gespeichert. Nachweise: [Formularbeispiele](docs/screenshots/formular-beispiele-desktop.png), [Tankstellen Desktop mit Testpreisen](docs/screenshots/tankstellen-testdaten-desktop.png), [Tankstellen mobil mit Testpreisen](docs/screenshots/tankstellen-testdaten-mobil.png). Kein physisches Mobilgerät wurde verwendet.

Die neue vorgeschaltete Anmeldeansicht wurde lokal bei **360 × 800** geprüft: `scrollWidth = clientWidth = 360`, Merkfunktion/Erklärung lesbar, Testmodus erreichbar, Abmelden führt wieder zur Anmeldeansicht. Nachweis: [Anmeldeseite, lokal vorbereitet](docs/screenshots/anmeldung-mobil-vorbereitet.png), [Abmeldung der lokalen Testakte](docs/screenshots/anmeldung-abgemeldet-lokaler-test.png). Der Google-Button ist auf dieser HTTP-Layoutvorschau absichtlich deaktiviert; kein echter Google-/Cloudflare-Login wurde damit geprüft. Produktive Konfiguration wurde für die Vorschau nicht verändert.

Im lokalen In-App-Browser mit ausdrücklich aktiviertem Testmodus:

- Manuell 50,00 Euro ohne erfundenes Datum erfasst, Vorschau und bestätigte Historienanzeige geprüft.
- Drei Rechnungen gemeinsam aus einer JSON-Datei geladen, erste vor dem Speichern umbenannt, drei unterschiedliche PNG-Originale gleichzeitig ausgewählt und anhand exakter Namen automatisch zugeordnet. Historie enthält drei verknüpfte Belege; Jahreskosten 60,00 Euro. Der undatierte 50-Euro-Testkauf wird getrennt als offen ausgewiesen.
- 360 × 800 und 1280 × 900 geprüft. Dokument-/Import-/Historienansicht ohne horizontalen Seitenüberlauf; gemessenes documentElement: scrollWidth = clientWidth, jeweils 345 bzw. 1265 CSS-Pixel nach Abzug der Scrollbar.
- Langer Originaldateiname auf 360 Pixeln geprüft. Dabei erkannte Verengung durch die Aktionsbuttons korrigiert; Vorschau/Download liegen mobil in einer eigenen Zeile.
- Tastatur-Navigation mit Tab geprüft; nächster Hauptlink wird fokussiert, sichtbare durchgezogene Fokusmarkierung vorhanden.
- Kosten-Druckvorschau mit Datum, Belegnummern und korrekten Beträgen geprüft. Browserdruck aufgerufen; der native Dialog blockierte die Browsersteuerung und wurde mit Escape geschlossen. **Keine fertige PDF-Datei oder tatsächliche A4-Seitenumbrüche behauptet.** Abschließender PDF-Probedruck in der Einrichtung erforderlich.

Nachweise: [Desktop im Testmodus](docs/screenshots/desktop-testmodus.png), [mobile Dokumentansicht](docs/screenshots/mobile-dokumente-testmodus.png). Die Bilder zeigen ausschließlich synthetische Testdaten. Kein physisches Android-Gerät wurde verwendet.

## Zuordnung zu den Abnahmekriterien

| Nr. | Stand |
| --- | --- |
| 1 | Lokal und im Browser mit drei gemeinsam zugeordneten Testoriginalen geprüft; echter Google-Upload noch offen |
| 2–5 | Automatisiert geprüft; UI-Bearbeitung/Null-Datum zusätzlich im Browser |
| 6 | Fachlogik und Mailautomation mit simulierten Diensten geprüft; reale Triggerzustellung offen |
| 7 | Ablehnung und Tokenmodell lokal geprüft; fremdes echtes Konto/Live-Ablauf erst nach Kontokonfiguration |
| 8–10 | Automatisiert geprüft; HTML wird durch React als Text dargestellt |
| 11 | ZIP-Rundlauf und neue simulierte Google-Ressourcen geprüft; echter Google-Restore offen |
| 12 | Desktop/360-Pixel/Import/langer Name/Tastatur/Druckvorschau geprüft. Galerie und lokale OCR zusätzlich wie oben geprüft. Physisches Android und fertiger Browser-PDF-Probedruck offen. Tankstellenkarte lokal geprüft; echte Anbieterabnahme nach Schlüsselfreischaltung offen |

## Noch vom Kontoinhaber zu erledigen

Für diese Erweiterung: bestehenden vollständigen Export sichern, das vorhandene Apps Script als neue Version aktualisieren und die lokal geprüften Änderungen selbst committen/pushen. Die genaue Schrittfolge steht in [docs/GALERIE_UND_BELEGERKENNUNG.md](docs/GALERIE_UND_BELEGERKENNUNG.md). Repo, Domain und grundlegender Google-Durchstich sind bereits eingerichtet. Offene reale Kontotests bleiben zweite Google-Identität, dauerhafte Sitzung nach Browserneustart, Tagesprüfung, vollständiger Export/Restore und PDF-Probedruck.

Die lokale Tankstellenkarte funktioniert unabhängig von der Kernakte. Echte Preise benötigen die gesonderte Einrichtung in [docs/TANKSTELLENSUCHE.md](docs/TANKSTELLENSUCHE.md). Diese Grenzen sind keine erfolgreichen Produktivnachweise.

## Neutrale Oberfläche und Kontentrennung

Neue Speicher beginnen mit leeren Hersteller-/Modellfeldern; die reservierte Fahrzeugzeile bleibt für Speicherversion 1 bestehen und wird erst nach ausdrücklichem Hinzufügen angezeigt. Bestehende Fahrzeuge werden nicht verändert. SSR-Prüfung der Anmelde- und Hinzufügeansicht ohne Marken-/Modellvorgaben. JSON-Vertrag unverändert; allgemeiner Erfassungsprompt als zusätzliche Fassung.

Acht zusätzliche Google-Backendtests mit drei simulierten Konten prüfen eigene Ressourcen/Kosten, keine Dateierstellung vor Fahrzeugbestätigung, kein Rückfall auf bestehende Eigentümerressourcen, manipulierte Ressourcen, fremde Restore-Kennungen, fehlende Identität und eigenen Mail-/Sicherungslauf. Sieben zusätzliche Cloudflare-Tests prüfen die ausdrückliche Freischaltung, kontoabhängige Bearer/CSRF/Sitzungen, getrenntes Abmelden, vertauschte verschlüsselte Tokens, Berliner Sommer-/Winterzeit und Verarbeitung/Lease/Retry der Tagesprüfung. Kein zweiter echter Google-/Cloudflare-Kontotest behauptet.

Browserprüfung der neutralen Fassung: 360 × 800, neuer lokaler Testmodus → leere Hinzufügeansicht → Volkswagen Golf (2020) bestätigt hinzugefügt; eigener Fahrzeugname in Übersicht und Formular, danach Abmelden ohne Modellanzeige. Kein horizontaler Überlauf: mobil 345/345, Desktop 1265/1265. Bilder: docs/screenshots/fahrzeugakte-anmeldung-neutral.png, fahrzeug-hinzufuegen-neutral.png und fahrzeugakte-golf-desktop-test.png. Ausschließlich lokale Testdaten, kein zweites echtes Konto.
