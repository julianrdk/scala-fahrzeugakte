# Galerie und Belegerkennung einrichten

Die Erweiterung ist lokal vorbereitet. Commit und Push erfolgen durch dich in GitHub Desktop. Ein Push auf `main` löst die bestehende automatische Veröffentlichung aus. Für die neuen gespeicherten Angaben muss vorher auch der Code in der bestehenden Apps-Script-Bereitstellung aktualisiert werden.

## 1. Bestehende Akte sichern

1. Öffne deine bisherige Fahrzeugakte und melde dich an.
2. Öffne **Fahrzeug → Einstellungen**.
3. Wähle **Vollständigen Export herunterladen** und bewahre sämtliche ZIP-Teile zusammen auf.

Die App legt beim ersten Schreibzugriff auf das bisherige Tabellenlayout zusätzlich eine datierte Drive-Sicherung an. Sie prüft vorher die alten Spalten und die bisherige Prüfsumme. Erst danach erweitert sie die Spalten unter Sperre in einem atomaren Tabellenzugriff. Bei einer Abweichung wird abgebrochen. Bitte keine Spalten oder Prüfsummen von Hand ändern.

## 2. Apps Script aktualisieren

Du verwendest weiterhin dasselbe Google-Projekt und dieselbe Bereitstellungs-ID.

1. Öffne [Google Apps Script](https://script.google.com/home) und dort das vorhandene Projekt der Fahrzeugakte.
2. Öffne auf deinem Computer im Projektordner die fertig gebaute Datei **`apps-script/dist/Code.js`** mit einem Texteditor. Sie wird durch `pnpm check` beziehungsweise `pnpm build` erzeugt.
3. Markiere den gesamten Inhalt dieser Datei und kopiere ihn.
4. Öffne im Apps-Script-Editor **Code.gs**, ersetze dessen gesamten bisherigen Inhalt durch den kopierten Code und speichere.
5. Klicke oben rechts auf **Bereitstellen → Bereitstellungen verwalten**.
6. Wähle deine bestehende API-Bereitstellung und klicke auf den **Stift** zum Bearbeiten.
7. Wähle unter **Version** den Eintrag **Neue Version**. Beschreibung zum Beispiel: `Galerie, Werkstätten und Belegerfassung`.
8. Klicke auf **Bereitstellen**. Die bestehende Bereitstellungs-ID bleibt erhalten.

Nicht „Neue Bereitstellung“ wählen. `setupOwner` muss hierfür nicht erneut ausgeführt werden. Die vorhandenen Script Properties, das Manifest und die Freigaben bleiben bestehen. Diese Erweiterung benötigt keine neuen Google-APIs, Cloudflare-Secrets oder D1-Tabellen.

Falls Apps Script beim Speichern einen Fehler zeigt, zuerst den vollständigen Kopiervorgang prüfen. Die erzeugte Datei beginnt mit dem gebündelten Backend und enthält am Ende die öffentlichen Einstiegspunkte. Nur einen Ausschnitt zu kopieren reicht nicht.

## 3. In GitHub Desktop prüfen und veröffentlichen

1. Öffne das Repository **scala-fahrzeugakte** in GitHub Desktop.
2. Prüfe unter **Changes** die Änderungen. Eigene Fahrzeugbilder und private Belege gehören nicht ins Repository.
3. Als **Summary** kannst du verwenden: `Fahrzeuggalerie und lokale Belegerkennung ergänzen`.
4. Als optionale **Description**:

   ```text
   Galerie mit Standardfoto und statischer Pinnwand ergänzen.
   PDFs und Belegfotos lokal auslesen, Positionspreise prüfen und Werkstätten zuordnen.
   Bestehende Akten vor der kontrollierten Spaltenerweiterung sichern; JSON-Vertrag v1 beibehalten.
   ```

5. Klicke auf **Commit to main** und anschließend **Push origin**.
6. Öffne [GitHub Actions](https://github.com/julianrdk/scala-fahrzeugakte/actions) und warte, bis der Veröffentlichungsdurchlauf grün ist.
7. Lade [car.jurodak.com](https://car.jurodak.com) neu. Falls noch die alte Ansicht erscheint, verwende einmal **Strg + F5**.

Die OCR-Dateien entstehen beim Build automatisch aus den festgelegten npm-Paketen. `public/ocr/` und die Sprachmodelle müssen nicht manuell in Git aufgenommen werden. Die bestehende Cloudflare-Anmeldung benötigt für diese Erweiterung keinen gesonderten Einrichtungsschritt.

Erscheint ein Hinweis auf eine erforderliche Apps-Script-Version, ist die Website bereits neuer als der Google-Code. Wiederhole Abschnitt 2 und lade die Website neu. Die erweiterte Belegerfassung speichert erst, wenn das Backend die neuen Angaben unterstützt.

## 4. Fahrzeugbilder verwenden

1. Öffne **Fahrzeug → Galerie**.
2. Klicke auf **Bilder auswählen**. Du kannst mehrere Bilder zugleich auswählen: JPG, PNG oder WebP, jeweils höchstens **4 MiB**. Normale Fotos mit Hintergrund sind geeignet.
3. Prüfe die Vorschauen. Mit **Auswahl entfernen** kannst du einzelne Bilder vor dem Speichern abwählen.
4. Klicke auf **Bilder speichern**.
5. Wähle am gewünschten Bild **Als Standardfoto verwenden**.
6. Öffne **Übersicht**. Das Standardfoto steht groß in der Pinnwand. Andere Fotos folgen nach Uploaddatum, neueste zuerst. Neue Uploads ändern die Standardauswahl nicht.

Am Desktop erscheinen bis zu zehn, auf schmalen Displays bis zu vier Fotos. „+ … weitere“ führt zur vollständigen Galerie. Ein Klick auf ein Foto öffnet das Original groß. Bilder werden vollständig innerhalb ihrer Rahmen dargestellt; dadurch können bei unterschiedlichen Formaten freie Flächen entstehen. Es gibt keine automatische Bewegung.

Bestehende Fotodokumente werden übernommen. Rechnungen und Belegscans bleiben in der Dokumentablage. Fotos erzeugen weder Ausgaben noch Arbeiten.

## 5. Eigene Werkstatt hinterlegen

1. Öffne **Fahrzeug → Einstellungen → Werkstätten**.
2. Klicke auf **Werkstatt hinzufügen** und trage einen Namen ein, etwa `Meine Garage`. Eine Adresse ist optional.
3. Speichere und wähle **Für Eigenleistung**.

Du kannst weitere Werkstätten verwalten. Bei **Selbst gemacht / repariert** wird der Eigenleistungsstandard automatisch ausgewählt. Der Verkäufer einer Materialrechnung ist ein separates Feld. Ein gespeicherter Arbeitseintrag behält die damalige Kopie von Werkstattname und Adresse, auch wenn du das Profil später änderst oder archivierst.

## 6. Einen Beleg einlesen

1. Öffne **Erfassen → Beleg einlesen**.
2. Wähle **Belegart** und **Kategorie**. Bei Wartung oder Reparatur wird zusätzlich eine verknüpfte Arbeit vorbereitet. Ausgabe und Arbeit lassen sich einzeln abwählen.
3. Wähle gegebenenfalls Durchführung und Werkstatt.
4. Wähle **einen** Beleg: PDF, JPG, PNG oder WebP, maximal **4 MiB**. Eine PDF darf mehrere Seiten enthalten.
5. Klicke auf **Beleg auslesen**. Eine PDF mit Text wird direkt gelesen; Scans und Fotos werden mit OCR erkannt. Fortschritt und Abbruch stehen zur Verfügung.
6. Vergleiche die vorgeschlagenen Angaben mit der Belegvorschau. Prüfe insbesondere Datum, Rechnungsnummer, Verkäufer, Währung, Rechnungsbetrag, Mengen, Teilenummern, Einzelpreise, Positionsbeträge und Netto-/Bruttobasis.
7. Ergänze unbekannte Werte nur, wenn du sie bestätigen kannst. Leere Felder bedeuten weiterhin „unbekannt“. Bereits manuell korrigierte Felder und Positionen bleiben bei **Erneut auslesen** erhalten. Die Auswahl einer anderen Datei beginnt einen neuen Beleg.
8. Bestätige **Datum der Arbeit** und **Arbeit wurde tatsächlich erledigt** separat. Ohne Bestätigung bleibt die Arbeit geplant; das Rechnungsdatum wird nicht als Arbeitsdatum übernommen.
9. Klicke erst nach deiner Prüfung auf **Geprüft speichern**. Jetzt wird das Original hochgeladen und gemeinsam mit den bestätigten Einträgen verknüpft.

Für die Kosten zählt ausschließlich der Rechnungsbetrag. Positionsbeträge und verknüpfte Arbeiten werden nicht nochmals addiert. Einzelpreise können bis zu sechs Nachkommastellen haben; Positions- und Rechnungsbeträge werden in ganzen Cent gespeichert.

Die Erkennung ist auf gedruckte deutsche Belege ausgerichtet. Unterschiedliche Tabellenlayouts, schlechte Fotos und Handschrift können unvollständige Ergebnisse liefern. OCR erkennt Text, bestätigt aber keine fachliche Richtigkeit. Geschützte oder unlesbare Dateien können manuell erfasst werden. **Manuell** und **Aus ChatGPT** bleiben verfügbar; der verbindliche JSON-Vertrag v1 hat keine neuen Pflichtfelder.

## Wo die Daten liegen und was kostenlos ist

- **Google Sheets:** Fahrzeug, Bildverweise und Standardauswahl, Ausgaben, Positionen, Arbeitseinträge und Werkstattprofile.
- **Google Drive:** unveränderte Originalbilder, Belege und Sicherungen im jeweiligen privaten Konto.
- **Browser:** Auslesen des ausgewählten Belegs und vorübergehende Vorschauen. Fahrzeugvorschauen werden innerhalb derselben Sitzung wiederverwendet, höchstens zwei gleichzeitig geladen und beim Abmelden oder Kontowechsel verworfen. Sie werden nicht als öffentliche Website-Dateien gespeichert.
- **Website:** PDF.js, Tesseract.js, WebAssembly und deutsche/englische Sprachdaten. Beim ersten OCR-Aufruf werden diese Dateien von derselben Website geladen. Die beiden komprimierten Sprachdateien benötigen zusammen ungefähr 4,3 MB; der Browser kann sie lokal zwischenspeichern. Auf langsameren Geräten kann die erste Erkennung länger dauern.

Es gibt keinen zusätzlichen OCR-Anbieter, API-Schlüssel oder kostenpflichtigen KI-Aufruf. Vor **Geprüft speichern** verlässt der ausgewählte Beleg den Browser nicht. Bei der anschließenden Speicherung gilt der vorhandene autorisierte Weg über den Cloudflare-Anmeldedienst zu Google. Dessen bestehende Kontingente sowie Google-Speichergrenzen bleiben bestehen.

## Kurzer Funktionstest nach Veröffentlichung

1. Ein Foto in die Galerie laden und als Standard wählen. Übersicht öffnen, Foto vergrößern und Seite neu laden.
2. Eigenleistungswerkstatt speichern. In der Belegerfassung „selbst gemacht“ wählen und die Vorauswahl prüfen.
3. Einen gut lesbaren Beleg auslesen, einen Vorschlag korrigieren und speichern. In der Historie Beleg, Positionen, Werkstatt und verknüpfte Arbeit prüfen.
4. In der Übersicht kontrollieren, dass nur der Rechnungsbetrag zählt.
5. Einen vollständigen Export erstellen. Ein zweites echtes Konto und eine echte Wiederherstellung separat prüfen; die lokalen Tests ersetzen diese Kontotests nicht.
