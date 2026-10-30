export const fieldNames: Record<string, string> = {
  $workshop: "Werkstattzuordnung",
  title: "Titel",
  date: "Datum",
  odometer_km: "Kilometerstand",
  amount_cents: "Betrag",
  category: "Kategorie",
  kind: "Arbeitsart",
  status: "Status",
  performed_by: "Durchführung",
  description: "Beschreibung",
  vendor: "Verkäufer",
  invoice_number: "Rechnungsnummer",
  notes: "Notizen",
  items: "Positionen",
  parts: "Teile",
  fuel: "Tankangaben",
  estimated_cost_cents: "Geschätzte Kosten",
  expense_refs: "Verknüpfte Ausgaben",
  currency: "Währung",
  cashflow_type: "Zahlungsrichtung",
  modification_details: "Umbauangaben",
};
export const display = (
  field: string,
  v: unknown,
  workshops: { id: string; name: string }[],
) => {
  if (v == null || v === "") return "Leer";
  if (field.endsWith("_cents") && typeof v === "number")
    return (v / 100).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (field === "$workshop")
    return workshops.find((w) => w.id === v)?.name ?? String(v);
  if (field === "date" && typeof v === "string")
    return v.split("-").reverse().join(".");
  const names: Record<string, string> = {
    completed: "Durchgeführt",
    planned: "Geplant",
    self: "Selbst gemacht",
    workshop: "Werkstatt",
    unknown: "Offen",
    expense: "Ausgabe",
    income: "Einnahme",
    maintenance: "Wartung",
    repair: "Reparatur",
    inspection: "Prüfung",
    modification: "Umbau",
    other: "Sonstiges",
    installed: "Eingebaut",
    removed: "Ausgebaut",
  };
  if (
    ["status", "performed_by", "cashflow_type", "kind"].includes(field) &&
    Object.hasOwn(names, String(v))
  )
    return names[String(v)];
  return typeof v === "object" ? JSON.stringify(v) : String(v);
};
