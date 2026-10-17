# JSON-Vertrag v1

Format-ID `vehicle-record-import`, `schema_version: 1`. Top-Level-Felder: `format`, `schema_version`, `import_id` (String oder null), `vehicle_label` (String oder null), `documents`, `expenses`, `work`, `reminders`, `warnings`. Alle Arrays vorhanden, auch wenn leer. Unbekannte fachliche Werte sind null. `warnings` enthält Strings für offene Angaben. Im Import keine dauerhaften Drive-IDs, Backend-IDs, berechneten Prüfsummen oder Zugangsdaten von ChatGPT verlangen.

Dokumentfelder: `ref` (im Paket eindeutig), `source_filename` (genauer sichtbarer Dateiname oder null), `title`, `document_type` (`invoice`, `receipt`, `contract`, `approval`, `inspection`, `service_history`, `photo`, `other`). Optional `page_numbers` als 1-basierte Seitenliste. Seitenangabe beschreibt den Bezug, nicht das Zerschneiden des Originals.

Ausgabenfelder: `ref`, `title`, `category`, `date`, `odometer_km`, `amount_cents`, `currency`, `vendor`, `invoice_number`, `document_refs`, `notes`. `category` ist eine der oben genannten deutschen Hauptkategorien; unbekannt null und Vorschau zur Auswahl. `amount_cents` ist Integer oder null; Erstattung negativ. `currency` normalerweise EUR, fremde Währungen nicht still umrechnen. Optional `fuel` mit `liters`, `fuel_type`, `full_tank`, `missed_previous_fillup`, `station_name`; unbekannte Felder null. Optional `items` mit Beschreibung, Teilenummer, Menge und Einheit; Positionen werden nicht zusätzlich zu `amount_cents` summiert. Einnahme optional mit `cashflow_type: "income"`, sonst Standard `expense`; Rückerstattung als negative expense, Verkauf als positive income.

Arbeitsfelder: `ref`, `title`, `kind` (`maintenance`, `repair`, `modification`, `inspection`, `other`), `status` (`completed`, `planned`), `date`, `odometer_km`, `performed_by` (`self`, `workshop`, `unknown`), `description`, `expense_refs`, `document_refs`. Optional `parts` mit `description`, `part_number`, `quantity`, `unit`, `specification`; optionale `estimated_cost_cents` gilt nur als Planung. Eine durchgeführte Arbeit ohne Kosten hat keine neuen Ausgaben. Optional `modification_details` mit Hersteller, Teilenummer, Genehmigungsnummer und bestätigtem Ein-/Ausbaustatus. An einem existierenden Eintrag kann der Nutzer in der Vorschau eine Ausgabe/Arbeit verknüpfen; ChatGPT erfindet dafür keine ID.

Erinnerungsfelder: `ref`, `title`, `work_type`, `due_date`, `due_odometer_km`, `repeat_months`, `repeat_km`, `lead_days`, `lead_km`, `email_enabled`, `basis_work_ref`, `notes`. Alle Intervalle nur aus ausdrücklich genannten Vorgaben oder bestätigter Quelle. `email_enabled` null, wenn nicht ausdrücklich im aktuellen Auftrag festgelegt. Nutzer bestätigt neue Regeln in der Vorschau. Globale aktivierte E-Mail-Einstellungen allein dürfen nicht aus einer Rechnung beliebige Wartungsregeln erzeugen.

Beispiel mit frei erfundenen Daten (nicht in die echte Akte importieren):

```json
{
  "format": "vehicle-record-import",
  "schema_version": 1,
  "import_id": null,
  "vehicle_label": "Škoda Scala",
  "documents": [
    {"ref": "doc1", "source_filename": "Rechnung.pdf", "title": "Öl und Filter – Beispielrechnung", "document_type": "invoice"}
  ],
  "expenses": [
    {
      "ref": "expense1", "title": "Öl und Ölfilter", "category": "Wartung & Reparatur",
      "date": "2026-10-10", "odometer_km": null, "amount_cents": 6500, "currency": "EUR",
      "vendor": "Beispielhändler", "invoice_number": "BEISPIEL-123",
      "document_refs": ["doc1"], "notes": "Kaufdatum laut Beispielrechnung."
    }
  ],
  "work": [
    {
      "ref": "work1", "title": "Öl und Ölfilter gewechselt", "kind": "maintenance", "status": "completed",
      "date": "2026-10-17", "odometer_km": 83200, "performed_by": "self",
      "description": "Durchführung laut Nutzer; keine Menge oder Freigabe angegeben.",
      "expense_refs": ["expense1"], "document_refs": ["doc1"]
    }
  ],
  "reminders": [],
  "warnings": ["Ölspezifikation und tatsächlich eingefüllte Menge nicht angegeben."]
}
```
