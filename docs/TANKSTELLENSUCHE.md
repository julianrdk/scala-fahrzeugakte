# Tankstellensuche

Die Einrichtung folgt [Umstellung auf Cloudflare](UMSTELLUNG_CLOUDFLARE.md). Der gemeinsame Worker benötigt TANKERKOENIG_API_KEY als Secret; die Oberfläche enthält ihn nicht. Cachetabellen und globale Aufrufgrenzen liegen mit den Fahrzeugdaten in DATA_DB. Vor dem Stilllegen der alten Datenbank werden ihre Cachetabellen übernommen.

Im Tab Tankstellen kann der Standort freigegeben oder eine deutsche PLZ eingegeben werden. Erst die erteilte Browserfreigabe erlaubt den Standortzugriff. Der Browser sendet den Suchpunkt an die angemeldete eigene API; diese rundet GPS-Koordinaten auf drei Nachkommastellen. Tankerkönig liefert Preise, OpenStreetMap die Kartenkacheln und Nominatim den PLZ-Mittelpunkt. Route öffnet Google Maps erst beim Anklicken. Ohne Schlüssel bleibt der externe Suchlink verfügbar.

D1 hält regionale Ergebnisse drei Minuten, PLZ-Mittelpunkte einen Tag und gemeinsame Zeitgrenzen für Anbieteraufrufe vor. Die Cachetabellen enthalten keine Konto-ID. Der Suchschlüssel wird gehasht; das ist keine Anonymisierung der an den Anbieter übertragenen Ortsangabe. Eine globale Begrenzung von mindestens 61 Sekunden zwischen Tankerkönig-Aufrufen bleibt erhalten.

Die Suche erfordert eine gültige Clerk-Sitzung und bei Schreibanfragen die eigene Website-Origin. Es werden keine Google-Tokens verwendet. Fehler, offene Wartezeit und externe Suche bleiben sichtbar.
