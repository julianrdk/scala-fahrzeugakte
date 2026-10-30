# Tankstellensuche

Die Einrichtung folgt [Umstellung auf Cloudflare](UMSTELLUNG_CLOUDFLARE.md). Der gemeinsame Worker benötigt TANKERKOENIG_API_KEY als Secret; die Oberfläche enthält ihn nicht. Cachetabellen und globale Aufrufgrenzen liegen mit den Fahrzeugdaten in DATA_DB. Vor dem Stilllegen der alten Datenbank werden ihre Cachetabellen übernommen.

Im Tab Tankstellen erscheint die Karte sofort und fragt die Standortfreigabe an. Bei abgelehnter Freigabe bleibt die Deutschlandansicht verfügbar. Eine deutsche PLZ mit Enter oder „Ort anzeigen“ positioniert nur die Karte. Verschieben und Zoomen bestimmen den Suchmittelpunkt, den das Kreuz in der Kartenmitte kennzeichnet. Erst **Suchen** fragt Preise ab; eine eingegebene, noch nicht angewendete PLZ wird zuvor aufgelöst. Standort, Kartenbewegungen und Filteränderungen starten keine Preisabfrage.

Liste und Popups zeigen immer E5, E10 und Diesel, nach Entfernung sortiert. Der Umkreis beträgt zunächst 10 km; 5 und 25 km sind ebenfalls wählbar. Eine Preisantwort verschiebt die Karte nicht. Standortmarkierung und Suchmittelpunkt sind unabhängig.

Der Browser sendet den Suchpunkt an die angemeldete eigene API; diese rundet Koordinaten auf drei Nachkommastellen. `POST /api/v3/fuel/location` löst ausschließlich die PLZ auf; `POST /api/v3/fuel/search` erhält Koordinaten. Tankerkönig liefert Preise, OpenStreetMap die Kartenkacheln und Nominatim den PLZ-Mittelpunkt. Route öffnet Google Maps erst beim Anklicken. Ohne Schlüssel bleibt der externe Suchlink verfügbar.

D1 hält regionale Ergebnisse drei Minuten, PLZ-Mittelpunkte einen Tag und gemeinsame Zeitgrenzen für Anbieteraufrufe vor. Die Cachetabellen enthalten keine Konto-ID. Der Suchschlüssel wird gehasht; das ist keine Anonymisierung der an den Anbieter übertragenen Ortsangabe. Eine globale Begrenzung von mindestens 61 Sekunden zwischen Tankerkönig-Aufrufen bleibt erhalten.

Die Suche erfordert eine gültige Clerk-Sitzung und bei Schreibanfragen die eigene Website-Origin. Es werden keine Google-Tokens verwendet. Fehler, offene Wartezeit und externe Suche bleiben sichtbar.

Die Sicherheitsrichtlinie erlaubt den tatsächlich verwendeten Kachelhost `https://tile.openstreetmap.org`. Nur Kachelbilder verwenden `strict-origin-when-cross-origin`; die sonstige Herkunftsrichtlinie bleibt `no-referrer`. Ein einzelner Kachelfehler verursacht keine dauerhafte Warnung. Bei einem ausgefallenen Kachelsatz lädt „Erneut laden“ ausschließlich die Karte erneut und verbraucht kein Tankerkönig-Kontingent.
