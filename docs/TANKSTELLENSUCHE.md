# Tankstellenkarte einrichten

Stand: 26. Oktober 2026. Die Erweiterung ist lokal vorbereitet. Sie ist erst nach deinem Commit und Push auf der Website verfügbar. Für die Livepreise sind zusätzlich die folgenden zwei Einrichtungsschritte erforderlich. Dein Google Apps Script muss dafür nicht neu bereitgestellt werden.

## 1. Kostenlosen Schlüssel beantragen

1. Öffne die [Tankerkönig-Registrierung](https://onboarding.tankerkoenig.de/).
2. Trage deine eigenen Angaben ein. Beschreibe das Projekt beispielsweise so: „Private Fahrzeugakte mit Tankstellensuche für angemeldete Nutzer: https://car.jurodak.com. Umkreissuche nach Standort oder PLZ, Anzeige von E5, E10 und Diesel.“ Wähle die zur Website passende Kategorie.
3. Prüfe und bestätige die Bedingungen selbst. Tankerkönig prüft die Anmeldung manuell und schickt den persönlichen Schlüssel anschließend per E-Mail. Eine feste Bearbeitungsdauer nennt das Formular nicht.

Die aktuelle API ist kostenlos. Die [offizielle Dokumentation](https://creativecommons.tankerkoenig.de/) begrenzt die freie Umkreissuche auf 25 km und einen Anbieteraufruf pro Minute. Diese Grenze teilt sich die gesamte Website. Viele gleichzeitige Nutzer mit verschiedenen Suchorten können deshalb Wartezeiten sehen. Es gibt keine garantierte Verfügbarkeit. Ein Demo-Schlüssel liefert keine echten Preise und wird von dieser App bewusst nicht akzeptiert.

## 2. Schlüssel bei Cloudflare speichern

Den Schlüssel bitte weder in den Chat noch in GitHub oder eine Projektdatei kopieren.

1. Öffne das [Cloudflare-Dashboard](https://dash.cloudflare.com/).
2. Gehe zu **Workers & Pages** und öffne das bestehende **Pages-Projekt `scala-fahrzeugakte`**. Nicht den separaten Tagesprüfungs-Worker auswählen.
3. Öffne **Settings → Variables and Secrets**. Falls eine Umgebungsauswahl erscheint, wähle **Production**.
4. Füge einen Eintrag vom Typ **Secret** hinzu: Name **`TANKERKOENIG_API_KEY`**, Wert dein persönlicher Schlüssel aus der E-Mail. Speichern.

Die bestehenden Google-Secrets und die Bindung `DB` bleiben erhalten. Die neue Version liest den Schlüssel ausschließlich im Cloudflare-Dienst. Er ist weder im Browser-Bundle noch in API-Antworten enthalten.

## 3. Bestehende Datenbank ergänzen

1. Öffne in Cloudflare **Storage & databases → D1 SQL Database** und die vorhandene Datenbank **`fahrzeugakte-anmeldung`**.
2. Öffne **Console**.
3. Öffne lokal die Datei [auth/migrations/0002-fuel.sql](../auth/migrations/0002-fuel.sql), kopiere ihren vollständigen Inhalt in das SQL-Eingabefeld und führe ihn aus.

Die Datei legt nur `fuel_cache`, den zugehörigen Ablaufindex und `fuel_limits` an. Sie löscht oder überschreibt keine bestehenden Konten oder Sitzungen. Sie kann bei Bedarf erneut ausgeführt werden. Keine neue Datenbank erstellen, die vorhandene Bindung `DB` verwenden. Für eine komplett neue Installation enthält `auth/schema.sql` bereits alle Tabellen.

## 4. Änderungen prüfen und veröffentlichen

Die beiden Einrichtungsschritte können vor dem Push erledigt werden; die bisherige Website verwendet die neuen Tabellen und den neuen Schlüssel noch nicht.

1. Öffne dieses Repository in **GitHub Desktop** und prüfe die Änderungen.
2. Als Summary eignet sich: **Eingabehilfen und Tankstellensuche mit Karte ergänzen**.
3. Erstelle den Commit und klicke auf **Push origin**, wenn du veröffentlichen möchtest. Der Push auf `main` startet die vorhandene GitHub-Pages-Veröffentlichung und die Cloudflare-Git-Bereitstellung.
4. Warte, bis beide Bereitstellungen erfolgreich sind. Falls Cloudflare eine neue Secret-Konfiguration erst mit einem neuen Build übernimmt, muss die neue Bereitstellung nach dem Speichern des Secrets erfolgen. Kein zusätzlicher Apps-Script-Deploy erforderlich.
5. Öffne [car.jurodak.com](https://car.jurodak.com), melde dich an und klicke auf **Tankstellen**.

## 5. Einmal ausprobieren

- Beim Öffnen wird die Standortermittlung angefragt. Erlaube sie, wenn du Tankstellen um deinen aktuellen Standort sehen möchtest. Ohne Freigabe bleibt die PLZ-Suche verfügbar. Der Browser bestimmt, ob er die Erlaubnis erneut abfragt.
- Alternativ eine fünfstellige deutsche PLZ eingeben und **Suchen** wählen. Der Suchpunkt ist dann ein Mittelpunkt des PLZ-Gebiets, keine genaue Adresse.
- Zu Beginn werden alle Kraftstoffe angezeigt. Kraftstoff, Umkreis und „Nur geöffnet“ lassen sich ändern. Bei einem ausgewählten Kraftstoff stehen die günstigsten passenden Stationen zuerst, bei allen Kraftstoffen die nächstgelegenen.
- Ein Klick auf eine Tankstelle in der Liste öffnet sie auf der Karte. **Route** öffnet Google Maps erst beim Anklicken.
- Preise haben drei Nachkommastellen. Ein Strich bedeutet, dass kein gültiger Preis vorliegt. Die angegebene Abrufzeit ist nicht der Zeitpunkt der letzten Preisänderung.
- Für eine neue Region kann wegen der gemeinsamen Anbietergrenze eine kurze Wartezeit nötig sein. Die App zeigt sie an; ein automatischer erneuter Abruf erfolgt nicht. Kraftstoff- und Umkreisfilter verwenden bereits geladene Daten.
- Falls keine Livepreise eingerichtet sind oder ein Anbieter ausfällt, bleibt **Externe Tankpreis-Seite** erreichbar. Fehlende Einrichtung wird angezeigt; es werden keine Testpreise als Livepreise ausgegeben.

## Speicherung und externe Dienste

Fahrzeugakte, Ausgaben und Belege bleiben wie bisher in deinen privaten Google-Dateien. Die Tankstellensuche schreibt keine Standortdaten oder Preise in Google Sheets.

Die Suche ist an eine gültige Anmeldung, die eigene Website-Origin und bei Suchanfragen den CSRF-Wert gebunden. Sie sendet keine Google-Tokens an die Karten- oder Preisanbieter. Der Browser übermittelt den für die Suche freigegebenen Standort an den Cloudflare-Dienst. Vor dem Weiterleiten an Tankerkönig wird ein GPS-Suchpunkt auf drei Nachkommastellen gerundet, ungefähr 100 Meter. Das ist weiterhin eine Ortsangabe, keine Anonymisierung. Bei PLZ-Suche erhält Nominatim die eingegebene PLZ.

Cloudflare D1 speichert öffentliche regionale Tankstellenergebnisse drei Minuten lang, PLZ-Mittelpunkte einen Tag und gemeinsame Zeitgrenzen für Anbieteraufrufe. Die Cachetabellen enthalten keine Konto-ID. GPS-Suchpunkte stehen nicht im Klartext im Cache-Schlüssel; dieser wird gehasht. Abgelaufene Cacheeinträge werden bei erfolgreichen neuen Anbieterabfragen bereinigt. Es entsteht keine Zuordnung der Suchhistorie zu einem Google-Konto.

Die Kartenkacheln lädt der Browser direkt von OpenStreetMap. Dabei erhält der Kartenanbieter übliche Verbindungsdaten und die angefragten Kartenausschnitte. Die Quellenhinweise zu OpenStreetMap und Tankerkönig/MTS-K bleiben sichtbar.

Verwendete Dienste und Regeln: [Tankerkönig API und CC BY 4.0](https://creativecommons.tankerkoenig.de/), [OpenStreetMap-Kartenkacheln](https://operations.osmfoundation.org/policies/tiles/), [Nominatim-Suche](https://operations.osmfoundation.org/policies/nominatim/). PLZ-Abfragen erfolgen nur nach einer ausdrücklichen Suche, ohne automatische Vorschlagsabfragen, mit Cache und gemeinsamer Begrenzung auf höchstens einen neuen Geocoder-Aufruf je 1,1 Sekunden. Der Geocoder kann bei Bedarf über die optionale Cloudflare-Variable `FUEL_GEOCODER_URL` auf einen anderen kompatiblen HTTPS-Suchendpunkt umgestellt werden, ohne den Quellcode zu ändern. Normalerweise muss diese Variable nicht gesetzt werden.

Die lokale Browserprüfung verwendet ausdrücklich gekennzeichnete Testpreise. Echte Livepreise und die tatsächliche Standortfreigabe auf deiner Website müssen nach der Einrichtung noch geprüft werden.
