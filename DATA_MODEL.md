# Datenmodell

Jede Fachzeile gehört dem angemeldeten Clerk-Konto und einem Fahrzeug. Besitzerkennungen werden ausschließlich aus dem geprüften Sitzungstoken übernommen.

fleet_accounts enthält gemeinsame Einstellungen und deren Revision; fleet_vehicles enthält Fahrzeugdaten, die aktive Generation, eigene Revision und ausgeblendete Kategorien. fleet_entities hat den Schlüssel owner/vehicle/generation/kind/id und indizierte Datums-/Dokumentabfragen. Die Daten einer einzelnen Fahrzeugansicht behalten State v1, damit die geprüften Fachregeln weiterverwendet werden.

Atomare fleet_guards prüfen Revisionen. fleet_receipts hält Vorgangskennung, Fingerprint und bestätigte Antwort gemeinsam mit der Änderung fest. fleet_restores hält zunächst getrennte Generationen. Alte record_entities bleiben bei der Migration erhalten.

record_objects und record_usage reservieren Dateien atomar vor R2-Schreibzugriffen. Dateien gehören nur dem Konto; der Zugriff verlangt zusätzlich eine Dokumentzuordnung im angegebenen Fahrzeug. Ganze Cent und exakte Einzelpreis-Dezimalwerte bleiben erhalten. Werkstatteinträge enthalten historische Kopien.

Die API unter /api/v3 liefert einen kompakten Einstieg, Fahrzeugansichten und Seiten von 50 Einträgen; Änderungen liefern geänderte Zeilen und Revisionen. /account/… betrifft ausdrücklich gemeinsame Einstellungen, Kontoexport und Kontowiederherstellung. /vehicles/:id/… prüft die Fahrzeugzugehörigkeit für jeden Zugriff. Keine Konto-ID aus dem Browser wählt einen anderen Besitzer aus.
