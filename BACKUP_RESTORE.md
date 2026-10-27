# Sichern und wiederherstellen

Der neue Cloudflare-Betrieb und der bisherige Google-Betrieb verwenden dasselbe vollständige ZIP-Format. Die Einrichtung und der Wechsel stehen unter **[Eigene Konten einrichten](docs/EIGENE_KONTEN_EINRICHTEN.md)**. Eine Übernahme kopiert Daten und Dateien; sie löscht keine Google-Dateien.

## Zusätzliche Regeln im Cloudflare-Betrieb

Ein neues Konto bietet die ZIP-Übernahme direkt an. Bei bestehenden Konten erfolgt sie unter Einstellungen. Der Import erstellt eine separate D1-Generation derselben verifizierten Clerk-ID. Jede Originaldatei wird beim Upload anhand Größe, MIME und SHA-256 geprüft; R2 bekommt dieselbe Prüfsumme als Schreibbedingung. Bildvorschauen entstehen lokal im Browser und werden separat gespeichert. Nachweise werden erst nach bestätigtem Schreiben als verwendbar markiert. Erst nach Prüfung dieser Nachweise und ausdrücklicher Bestätigung wird die aktive Generation umgeschaltet. Die alte Generation bleibt erhalten. Wiederholung desselben Exports erzeugt keine zusätzlichen Buchungen.

Der Cron-Worker erstellt datierte JSON-Snapshots im privaten R2-Bereich des Kontos. Diese enthalten Aktenstand und Verweise auf die bereits bestätigten unveränderten Originale. Originale werden nicht für jeden Snapshot erneut kopiert oder täglich vollständig heruntergeladen. Die Aufbewahrung beträgt standardmäßig 14 Snapshots, einstellbar 1–90. Erst nach bestätigtem neuem Snapshot werden ältere Snapshots entfernt; Originale werden nicht automatisch gelöscht. Ein fehlgeschlagener Mailversand verhindert die Datensicherung nicht.

Alle reservierten und gespeicherten Dateien einschließlich Vorschauen und Snapshots zählen gegen die Speichergrenzen. Bei fehlendem Platz kann auch eine neue Sicherung abgewiesen werden; die bisherige bleibt erhalten und der Fehler wird angezeigt. Ein Snapshot ohne seine Originale ist kein vollständiger Export. Bei Verlust des gesamten Cloudflare-Kontos hilft nur eine außerhalb davon aufbewahrte vollständige ZIP-Kopie.

Falls nur ein R2-Snapshot vorhanden ist: JSON und die anhand SHA-256 referenzierten Originale aus dem privaten Konto-Unterordner herunterladen. Originale im lokalen Ordner mit ihrem Hash als Dateiname ablegen. Der vorhandene Helfer funktioniert auch mit diesen Snapshots:

```sh
node scripts/pack-drive-backup.mjs SNAPSHOT.json ORIGINALORDNER AUSGABE.zip
```

Er prüft die tatsächlichen Originalbytes vor der ZIP-Erstellung. Das fertige ZIP wird anschließend über die reguläre geprüfte Wiederherstellung eingelesen. R2-Dateien oder D1-Zeilen nicht von Hand verändern, um eine Prüfung zu umgehen. Bei beschädigter D1-Datenbank zuerst den Stand sichern und die Datenbank-Wiederherstellung prüfen; eine leere neu gebundene Datenbank rekonstruiert vorhandene Speicherreservierungen nicht automatisch.

## Herunterladbarer vollständiger Export

Einstellungen → **Vollständigen Export herunterladen**. Die App liest den bestätigten Aktenstand und lädt jedes unveränderte Original einzeln vom Backend. Größe und SHA-256 werden beim Export geprüft. Identische Inhalte erscheinen nur einmal unter `files/<sha256>`.

Jedes ZIP enthält `data.json` mit Format-ID `vehicle-record-backup`, Speicherversion, Zeitpunkt, Teilnummer/-anzahl, Aktenstand und kanonischer Datenprüfsumme. In `tables/` liegen menschenlesbare CSV-Dateien mit deutschen Semikolon-Trennzeichen; Excel kann sie öffnen. Die Aktenverknüpfungen verweisen auf Dokument-IDs, Dokumente zusätzlich auf Inhalts-Hashes. Alte Drive-IDs sind lediglich Herkunft und werden beim Restore ersetzt. Tokens, OAuth-Client-Secrets und Script Properties werden nicht exportiert.

Ab 20 MiB Originaldaten werden mehrere ZIPs heruntergeladen. Browser müssen mehrere Downloads zulassen. Alle Teile gemeinsam aufbewahren. Fehlende Dateien oder Downloadfehler führen ausdrücklich zu `UNVOLLSTAENDIG` im Namen, `complete:false`, einer Liste fehlender Originale und einer Fehlermeldung. Ein solcher Export wird nicht als vollständig bestätigt.

Die Importgrenze für Archivteile beträgt 150 MiB komprimiert, höchstens 256 MiB entpackt über die ausgewählten Teile. Einzeloriginale weiterhin höchstens 4 MiB. ZIP-Pfade werden nicht auf das Dateisystem entpackt; nur `data.json` und exakt passende Hashpfade akzeptiert. Größen werden vor Dekompression begrenzt.

## Wiederherstellung mit Vorschau

1. Alle Teile desselben Backups unter **In eine frische Akte wiederherstellen** auswählen. Formate, Teilvollständigkeit, Daten- und Dateiprüfsummen werden geprüft.
2. Lokale Vorschau der Mengen und Beträge lesen.
3. **Neue Akte erstellen und Originale prüfen**. Im Cloudflare-Betrieb entsteht eine getrennte D1-Generation, im Google-Betrieb eine neue private Tabelle mit Originalordner. Bestehende aktive Daten werden nicht überschrieben.
4. Originale werden mit den verifizierten Bytes hochgeladen. Dokument-IDs behalten ihre Bedeutung; Speicherverweise werden ersetzt. Wiederholung kann anhand Hash vorhandene Uploads wiederverwenden.
5. Serverseitige Vorschau prüfen. Solange Originale fehlen, bleibt Umschalten gesperrt. Bewusst bereits ohne Original geführte Belege ohne Hash bleiben als fehlend gekennzeichnet.
6. Ausdrücklich bestätigen und **Auf geprüfte Wiederherstellung umschalten**. Erst jetzt ändert sich die aktive D1-Generation beziehungsweise die Ressourcenzuordnung in Google Script Properties. Alte Akten bleiben erhalten.
7. Beträge, Belege und Verknüpfungen nachsehen, einen Originaldownload vergleichen und neue Sicherung erzeugen.

Wird die Webseite während der Wiederherstellung geschlossen, bleibt die bisherige aktive Akte erhalten. Ein erneuter Import desselben bestätigten Aktenstands findet serverseitig denselben Wiederherstellungsvorgang. Noch nicht aktivierte Ressourcen können später bewusst in Drive bereinigt werden. Keine automatische Löschung alter Akten.

## Tägliche Google-Drive-Sicherung

Nach Installation des Eigentümertriggers wird täglich ein datierter `snapshot-…json` im privaten Sicherungsordner erstellt. Zusätzlich werden neue Originale unter `Originale-nach-Hash/` nachgeführt. Dateien mit gleichem Hash benötigen nur eine Sicherungskopie. Erst nach vollständigem neuen Snapshot entfernt die Retention ältere Snapshots; der voreingestellte Bestand sind 14, einstellbar 1–90. Originalkopien bleiben erhalten; automatische Löschung vermeintlich unbenötigter Originale findet nicht statt.

Die Snapshot-JSON und die gesonderten Originalkopien bilden zusammen die Sicherung. Eine einzelne Snapshotdatei ohne Originalkopien ist kein vollständiger Export. Bei einem Fehler ist `LAST_ERROR` sichtbar; ein nicht bestätigter Nachfolger rechtfertigt kein Löschen des Vorgängers. Es gibt kein Versprechen minutengenauer Ausführung.

## Notfall bei beschädigter aktiver Tabelle

Keine Zellen oder `_Integrity` von Hand ändern, um die Sperre zu umgehen. Ursprungsdatei unverändert zur Diagnose behalten. Der UI-Zugriff auf Wiederherstellung benötigt eine lesbare aktive Akte. Falls diese aufgrund erkannter Manipulation gesperrt ist:

1. Script Properties mit den bisherigen `SPREADSHEET_ID`, `DOCUMENT_FOLDER_ID`, `BACKUP_FOLDER_ID` privat sichern.
2. Aktive `SPREADSHEET_ID` und `DOCUMENT_FOLDER_ID` im Editor entfernen; **setupOwner** ausführen. Es entsteht eine neue leere Akte, ohne die beschädigten Ursprungsdateien zu löschen. Der vorhandene Backupordner bleibt konfiguriert.
3. Mit Google erneut verbinden und den zuletzt vollständigen lokalen ZIP-Export regulär in weitere frische Ressourcen wiederherstellen.
4. Falls nur eine tägliche Drive-Sicherung vorhanden ist: Snapshot und die anhand Hash referenzierten Dateien aus `Originale-nach-Hash/` herunterladen. Mit dem mitgelieferten Helfer in ein prüfbares ZIP umwandeln, dann regulär in der App wiederherstellen:

```sh
node scripts/pack-drive-backup.mjs PFAD_ZUM_SNAPSHOT.json PFAD_ZUM_ORIGINALORDNER AUSGABE.zip
```

Der Helfer prüft sämtliche geforderten Originale und Hashes, verweigert fehlende Daten und baut dasselbe Importformat. Die Snapshot-JSON enthält keine Kontosecrets. Den fertigen ZIP-Export anschließend außerhalb des Google-Kontos aufbewahren.

## Nachgewiesene und offene Prüfung

Automatisierte Tests prüfen Wiederherstellung in neue simulierte Google-Ressourcen mit neuen Datei-IDs sowie unveränderten Beträgen, Hashes und Links. Ein ZIP-Rundlauf prüft Export-/Importer-Kompatibilität. Das ist kein Beweis für Kontoberechtigungen, echte Google-Quoten oder reale Browserdownloads; diese Tests werden in der Einrichtung mit dem Eigentümerkonto ergänzt.

## Erweiterung um Galerie und Belegerkennung

Standardfoto und Galerie verweisen weiterhin auf bestehende Fotodokumente. Werkstattprofile, historische Werkstattkopien und Positionspreise sind optionale interne Felder. Sie werden in neuen Sicherungen mitgeführt; alte vollständige Sicherungen ohne diese Felder lassen sich weiterhin in neue Ressourcen wiederherstellen.

Vor der ersten Änderung eines bisherigen Tabellenlayouts prüft das Backend den alten Stand und seine ursprüngliche Prüfsumme. Es erstellt eine datierte Drive-Sicherung mit Originalkopien, bevor es die optionalen Spalten atomar ergänzt. Scheitert die Sicherung oder die Integritätsprüfung, beginnt keine Spaltenerweiterung. Bei einem abgewiesenen Tabellenbatch bleibt der alte Tabellenstand erhalten. Keine manuelle Ergänzung von Überschriften oder Neuberechnung von `_Integrity` ist erforderlich. Die lokal simulierten Umstellungs- und Restoretests prüfen auch die neuen Zusatzangaben; eine echte Wiederherstellung im Google-Konto bleibt gesondert zu testen.
