# Datenmodell und Speicherverhalten

Speicherversion 1. Format `vehicle-record-import`, Importversion 1. Der wortgleiche Vertrag und Prompt liegen unter `docs/`; `shared/import-v1.schema.json` ist die ausführbare Validierung. Änderungen daran erfordern abgestimmte Version, Beispiele, Prompt und Migration. Unbekannte Versionen werden abgewiesen. Die hier dokumentierte Erweiterung des internen Tabellenlayouts ergänzt ausschließlich optionale Felder; der Importvertrag v1 bleibt unverändert.

## Struktur

Alle Fachzeilen besitzen `id`, `vehicle_id`, `revision`, Zeitstempel sowie getrennte Kennzeichen `archived` und `voided`. Referenzen verwenden IDs, niemals Zeilennummern. Eine Fahrzeuginstanz ist zurzeit aktiv; `vehicle_id` und die separate Vehicles-Tabelle erlauben später eine ausdrücklich implementierte Mehrfahrzeugmigration. Diese Version erzwingt bei Wiederherstellung genau ein Fahrzeug.

| Tabelle | Normale benannte Spalten / Bedeutung |
| --- | --- |
| Vehicles | Hersteller, Modell, Baujahr, Erstzulassung, Motor, FIN, Kennzeichen, Kaufdatum/km, Kraftstoff, Fotoverweis |
| Expenses | Titel, Kategorie, Datum/km, Integer-Cent, Währung, Händler, Rechnungsnummer, Zahlungsart, Erstattungsbezug |
| Work | Arbeitsart/-status, tatsächliches Datum/km, Durchführung, Beschreibung, Ausgaben-/Dokumentreferenzen, Material, optionale Planungskosten/Zeit/Anteile/Umbauangaben |
| Documents | Originaldateiname, eigener Anzeigename, Typ, optionale Seitenliste, SHA-256, Größe, MIME, Drive-ID, Fehlstatus |
| DocumentLinks | Dokument-ID und zugeordnete Ausgaben-/Arbeits-ID |
| Reminders | Datum- und Kilometergrenze, Wiederholung, Vorlauf, E-Mail-Wunsch, Bezug auf bestätigte Arbeit, feste Kalenderregel |
| Imports | Fingerprint, optionale gelieferte Import-ID, eigener Speichervorgang |
| Operations | Eigene Vorgangs-ID, Fingerprint, bestätigtes Ergebnis für Retry |
| Uploads | Vorgangsbezug und nachverfolgbare Datei, Hash, Größe, Originalname und Drive-ID |
| AuditLog | Aktion, Bezug, Zeit, Vorher-/Nachher-Werte |
| Settings | Sichtbarkeit, Link, Mailaktivierung, editierbare Recherchevorlagen und Aufbewahrung |
| Odometer | Explizit bestätigte datierte Kilometerstände |
| NotificationLog | Hinweis-Fingerprint, Versandstatus und nachvollziehbarer Ausgang |
| FavoriteStations | Vorbereitete Struktur; integrierte Provider-/Kartenfunktion nicht aktiv |
| _Integrity | Prüfsumme des vollständigen normalisierten Tabellenstands; technische Änderungsprüfung |

Nur strukturierte Detailfelder (Materiallisten, Referenzlisten, optionale Tank-/Umbauangaben, Vorher-/Nachher-Daten) sind JSON in einer benannten Zelle. Hauptdaten sind lesbare einzelne Spalten. `null` wird als leere Zelle gespeichert; optionale Felder werden beim Lesen entsprechend behandelt. Keine Formeln werden aus Importtext erzeugt: Sheets-`stringValue` schreibt Text ausdrücklich als Text. CSV-Exporte entschärfen zusätzlich Formelinjektion.

## Geld und Arbeiten

Geld als ganze Cent, keine Binärfließkommawerte für Zahlungen. Null ist unbekannt, 0 ist kostenfrei. Erstattung ist eine negative Ausgabe, optional mit `refund_of_id`; Fahrzeugverkauf eine positive `income`. Mehrere Währungen werden getrennt angezeigt, nicht umgerechnet; EUR-Summen zählen keine unbekannten/fremden Währungen.

Jede Rechnung genau eine Ausgabe. Positionen und die Verknüpfung zu Arbeiten erzeugen keine weiteren Zahlungen. Arbeitskostenschätzungen und eigene Arbeitszeit werden nicht in Ist-Ausgaben umgewandelt. Eine Ausgabe darf mehrere Arbeiten bezahlen. Optionale Anteile dürfen in Summe den absoluten Rechnungsbetrag nicht übersteigen.

Archivierung gültiger Zeilen ändert keine Summe. Stornierte Ausgaben zählen nicht. Ausgeblendete Kategorien bleiben in Summen enthalten. Die Jahresübersicht benennt und zählt undatierte, unklare oder unbekannte Werte separat. Keine Kosten/km oder Durchschnittszahl ohne ausreichend bestätigte Bezugsdaten.

## Kilometer, Tanken und Fälligkeiten

Aktueller Kilometerstand aus dem neuesten bestätigten datierten Stand, datierten Ausgaben oder abgeschlossenen Arbeiten. Geplante Arbeiten zählen nicht. Historische Importe ersetzen keinen neueren Stand; fallende Verläufe werden markiert. Ohne tatsächliches Datum bleibt ein historischer Stand offen.

Verbrauch nur zwischen geeigneten Volltankungen, alle erfassten Teilmengen dazwischen eingeschlossen. Unbekannte Tankmengen/-zustände und bestätigte Lücken unterbrechen den Zusammenhang. Die erste Volltankung füllt nur den Ausgangspunkt und geht nicht als Verbrauch in ihr eigenes Intervall ein.

Fälligkeit ist Datum **oder** bestätigter Kilometerstand. Keine Fahrleistungsprognose. Wiederholung erfolgt erst durch bestätigte, passende abgeschlossene Arbeit; zugehörige Wiederholung braucht deren echtes Datum/km. Monatsenden werden geklemmt (31. Januar plus ein Monat = letzter Februartag). Optionale Tageswiederholung und feste Kalenderregel sind interne Aktenfelder; der unveränderte Importvertrag v1 enthält keine frei erfundenen Zusatzfelder dafür.

## Commit, Retry und Konflikte

Uploads erfolgen einzeln vor dem Fachcommit. Browser und Backend prüfen Größe, MIME-Signatur und SHA-256. Grenzwert 4 MiB pro Original, 1 MiB Import-JSON, höchstens 100 Datensätze je Importarray, 10.000 Zeilen je Tabelle. Ein 4-MiB-Original wird als Base64 über den Apps-Script-Aufruf transportiert. Große Pakete kontrolliert teilen; Fortschritt wird angezeigt. Vollständige Exportarchive werden bei 20 MiB Originaldaten aufgeteilt.

Drive und Sheets bilden keine gemeinsame Transaktion. Nach einem Upload ist die Datei zunächst nachverfolgbar, noch keine Ausgabe. Dateinamen auf Drive sind Inhalts-Hashes; nach einem Abbruch vor Upload-Registrierung findet der Retry dasselbe Original anhand Hash/Bytevergleich wieder. Vorhandene Nutzerdateien werden nie als Rollback gelöscht. Nicht verknüpfte Dateien sind in Einstellungen prüfbar.

Für Import/Bearbeitung hält der Server einen Script-Lock. Validierung, fachliche Dublettenprüfung und Vorgangsprüfung erfolgen darin. Anschließend publiziert **ein einziges Sheets batchUpdate** alle benannten Tabellen, das bestätigte Vorgangsergebnis und die Integritätskennung gemeinsam. Ein atomar abgewiesener Batch lässt keine Teilkosten sichtbar werden. Für diese persönliche Akte wird jeweils der validierte Tabellenstand geschrieben; das ist einfach prüfbar, aber keine Strategie für unbegrenzt große Flottenakten.

Gleicher Vorgang liefert sein früheres Ergebnis. Ein deterministischer kanonischer Paketfingerprint ignoriert die optionale ChatGPT-Import-ID. Ein identisches Paket mit neuer ID wird ebenfalls erkannt. Neu formulierter Text mit gleicher Rechnung erzeugt einen fachlichen Konflikt; legitime ähnliche Käufe brauchen eine bewusste Begründung. Beim ersten Speicherversuch ist die Vorschau festgelegt. Nach Fehlern entweder denselben Vorgang wiederholen oder serverseitig prüfen, ob er bereits abgeschlossen ist, bevor die Bearbeitung wieder freigegeben wird.

Bearbeitung verlangt die gelesene Revision. Nach einer Änderung durch Gerät A wird der alte Stand von Gerät B abgewiesen. Fehlende Serverbestätigung bleibt Fehler; keine Erfolgsmeldung vor bestätigtem Ergebnis. Ein Nachladen nach erfolgreichem Commit kann ebenfalls scheitern: Retry liefert dann den vorhandenen Vorgang, statt nochmals zu buchen.

## Direkte Tabellenänderungen und Migration

Manuelles Ändern der Sheets ist kein paralleler Standardworkflow. Header-, Daten- und Formelprüfung sowie die gemeinsam gespeicherte Integritätskennung erkennen direkte Änderungen. Die Akte sperrt weitere Aktionen bei Abweichung. Kein automatisches Neu-Hashen ungeprüfter Nutzereingriffe; stattdessen unveränderte Sicherung in neue Ressourcen wiederherstellen.

Die Erweiterung für Belegerkennung akzeptiert ausschließlich das bekannte bisherige oder das neue Spaltenlayout. Zuerst wird der vollständige ursprüngliche Stand einschließlich seiner ursprünglichen Spaltenbreiten gegen `_Integrity` geprüft. Ein reiner Lesezugriff verändert nichts. Vor dem ersten Schreibzugriff auf ein altes Layout werden unter Script-Lock eine datierte Drive-Sicherung und die Originalkopien erstellt. Anschließend erweitert ein atomarer Sheets-Batch die Tabellen um die optionalen Spalten und schreibt die zugehörige Prüfsumme. IDs, vorhandene Inhalte und Referenzen bleiben erhalten. Ein fehlgeschlagener Batch lässt den alten Stand lesbar; eine Wiederholung bleibt möglich. Unbekannte Spalten, zusätzliche Inhalte unter alten Überschriften und eine abweichende Prüfsumme werden vor der Umstellung abgewiesen.

## Galerie, Werkstätten und Positionspreise

Die Galerie verwendet vorhandene `Documents` vom Typ `photo` und den bestehenden Standardverweis `Vehicles.photo_id`. Ein bisher anderweitig typisiertes, ausdrücklich ausgewähltes Fahrzeugfoto wird ebenfalls angezeigt. Rechnungs- und Belegscans werden nicht pauschal zu Galeriefotos. Foto-Uploads erzeugen keine Ausgaben oder Arbeiten. Die stabile Reihenfolge ist Standardfoto, danach `created_at` absteigend und bei Gleichstand ID. Vorschauen werden nur in einer kontoabhängigen Browsersitzung gehalten; zwei Abrufe gleichzeitig, keine dauerhafte öffentliche Kopie.

| Neue optionale Spalte | Inhalt |
| --- | --- |
| `Settings.workshops` | JSON-Liste mit höchstens 50 Profilen: `id`, `name`, optionale Adresse als leerer String, `archived` |
| `Settings.self_workshop_id` | ID eines aktiven Eigenleistungsstandards oder `null` |
| `Work.workshop_snapshot` | Historische Kopie aus `profile_id`, `name` und `address` oder `null` |
| `Expenses.position_prices` | Zur Materialliste ausgerichtete JSON-Liste mit `unit_price`, `total_cents` und `basis` |

`unit_price` ist eine exakte Dezimalzeichenfolge mit höchstens sechs Nachkommastellen, kein gerundeter Fließkomma-Geldbetrag. `total_cents` ist eine ganze Centzahl oder unbekannt. `basis` unterscheidet `net`, `gross` und `unknown`. Ausschließlich `Expenses.amount_cents` zählt in den Ist-Kosten; Positionssummen und Arbeitseinträge werden nicht nochmals addiert. Verkäufer bleibt `Expenses.vendor`, die ausführende Werkstatt gehört zur Arbeit.

Der bestätigte Speichervorgang darf neben dem unveränderten Importpaket einen streng geprüften `capture`-Block mit `workshops_by_work_ref` und `prices_by_expense_ref` enthalten. Referenzen müssen zum selben Paket passen. Die Zusatzangaben gehen in den Vorgangsfingerprint ein; der Paketfingerprint für Dubletten bleibt auf dem unveränderten v1-Inhalt. Änderungen einer Werkstatt überschreiben keine historischen Kopien. Alte Sicherungen ohne diese Felder bleiben gültig, neue Sicherungen und CSV-Exporte enthalten sie.

## Grenzen und Privatsphäre

Frontend-Routen verwenden Hashes und funktionieren damit bei GitHub Pages auch nach Neuladen. Nur App-Assets und öffentliche Google-Verbindungs-IDs werden veröffentlicht. Browser-Tokens bleiben ausschließlich im Speicher. Private Dokumente werden nicht durch Service Worker gecacht. Der ausdrücklich gewählte Testmodus hat einen getrennten IndexedDB-Namensraum und sendet nichts an Google.

Apps Script prüft aktive und effektive Eigentümeridentität und private konfigurierte Ressourcen. Fehlende Identität, fremder Eigentümer, Freigaben, veränderte Originaldateien oder Integritätsabweichungen führen zu Fehlern. Ein Backup auf demselben Konto ist kein Schutz gegen Kontoverlust.

## Getrennte Konten

Eine Speicherversion-1-Akte gehört genau einem Google-Konto und enthält derzeit ein Fahrzeug. Neue Akten beginnen mit einer reservierten leeren Fahrzeugzeile, die erst nach ausdrücklicher Eingabe als Fahrzeug angezeigt wird. Beim Mehrkontomodus entstehen separate Tabellen und Drive-Ordner je ausführendem Google-Nutzer. Ressourcen-, Restore- und Statuszuordnung liegen in Google UserProperties. Nur das ursprüngliche Eigentümerkonto verwendet weiterhin seine bisherigen global konfigurierten Ressourcen. Übergebene Nutzer-/Ressourcenkennungen wechseln niemals den Kontokontext. Cloudflare ordnet Sitzungen, verschlüsselte Google-Tokens und Tagesprüfjobs nach verifizierter Google-sub zu; keine Fahrzeugdatenbank in D1.
