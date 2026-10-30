import {
  cloneElement,
  createContext,
  useContext,
  isValidElement,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

const examples: Record<string, string> = {
  title: "z. B. Motoröl und Ölfilter gekauft",
  Titel: "z. B. Motoröl und Ölfilter gekauft",
  manufacturer: "z. B. Volkswagen",
  Hersteller: "z. B. Volkswagen",
  "Hersteller (Umbau)": "z. B. Hersteller aus der ABE",
  model: "z. B. Golf",
  Modell: "z. B. Golf",
  year: "z. B. 2020",
  Baujahr: "z. B. 2020",
  engine: "z. B. 1,5 l Benzin / Kennbuchstabe laut Unterlagen",
  "Motor / Motorkennbuchstabe":
    "z. B. 1,5 l Benzin / Kennbuchstabe laut Unterlagen",
  vin: "17-stellige FIN aus dem Fahrzeugschein",
  FIN: "17-stellige FIN aus dem Fahrzeugschein",
  plate: "z. B. B-AB 1234",
  Kennzeichen: "z. B. B-AB 1234",
  km: "z. B. 58000",
  purchase_odometer: "z. B. 42000",
  "Kilometer bei Kauf": "z. B. 42000",
  "Kilometerstand (optional)": "z. B. 58000",
  Kilometerstand: "z. B. 58000",
  "Bestätigte Kilometer": "z. B. 58000",
  "Kilometerstand (leer = unbekannt)": "z. B. 58000",
  "Betrag in Cent": "z. B. 4990 für 49,90 €",
  "Oder bei Kilometerstand (optional)": "z. B. 60000",
  "Fällig bei Kilometer": "z. B. 60000",
  amount: "z. B. 49,90",
  "Betrag (optional)": "z. B. 49,90",
  Betrag: "z. B. 49,90",
  currency: "z. B. EUR",
  Währung: "z. B. EUR",
  vendor: "z. B. Autohaus Muster",
  "Händler / Werkstatt": "z. B. Autohaus Muster",
  invoice: "z. B. RE-2026-0142",
  Rechnungsnummer: "z. B. RE-2026-0142",
  liters: "z. B. 42,5",
  Liter: "z. B. 42,5",
  station: "z. B. Aral, Hauptstraße 12",
  Tankstelle: "z. B. Aral, Hauptstraße 12",
  "Tankstelle (optional)": "z. B. Aral, Hauptstraße 12",
  fuel_type: "z. B. Super E10 oder Diesel",
  Kraftstoff: "z. B. Super E10 oder Diesel",
  estimate: "z. B. 150,00",
  "Geschätzte Kosten (nur Planung)": "z. B. 150,00",
  "Kostenschätzung (nur Planung)": "z. B. 150,00",
  part_description: "z. B. Ölfilter",
  description: "z. B. Ölfilter",
  Beschreibung: "z. B. Ölfilter",
  "Teil / Betriebsstoff": "z. B. Ölfilter oder Motoröl",
  part_number: "Teilenummer laut Rechnung oder Verpackung",
  Teilenummer: "Teilenummer laut Rechnung oder Verpackung",
  quantity: "z. B. 1",
  Menge: "z. B. 1",
  unit: "z. B. Stück oder l",
  Einheit: "z. B. Stück oder l",
  spec: "Bestätigte Angabe aus Rechnung oder Herstellerunterlagen",
  specification: "Bestätigte Angabe aus Rechnung oder Herstellerunterlagen",
  "Bestätigte Freigabe / Spezifikation":
    "Bestätigte Angabe aus Rechnung oder Herstellerunterlagen",
  approval: "Nummer aus der ABE oder dem Prüfbericht",
  Genehmigungsnummer: "Nummer aus der ABE oder dem Prüfbericht",
  "Genehmigungsnummer (Umbau)": "Nummer aus der ABE oder dem Prüfbericht",
  notes: "z. B. In Eigenleistung gewechselt; Rechnung liegt bei",
  Notizen: "z. B. In Eigenleistung gewechselt; Rechnung liegt bei",
  note: "z. B. Kilometerstand vom Tacho abgelesen",
  Notiz: "z. B. Kilometerstand vom Tacho abgelesen",
  "Notizen / Material": "z. B. Ölfilter mitwechseln; Material laut Unterlagen",
  "Bestätigte Materialhinweise":
    "z. B. Filter-Teilenummer laut letzter Werkstattrechnung",
  "Arbeit / Termin": "z. B. Ölwechsel oder nächste HU",
  months: "z. B. 12",
  repeat_months: "z. B. 12",
  "Wiederholung Monate": "z. B. 12",
  repeat_days: "z. B. 365",
  "Oder Wiederholung Tage": "z. B. 365",
  repeat_km: "z. B. 15000",
  "Wiederholung Kilometer": "z. B. 15000",
  lead_days: "z. B. 30",
  "Vorlauf Tage": "z. B. 30",
  lead_km: "z. B. 1000",
  "Vorlauf Kilometer": "z. B. 1000",
  "Eigene Arbeitszeit in Minuten (optional)": "z. B. 60",
  Einbaukilometer: "z. B. 58000",
  Ausbaukilometer: "z. B. 80000",
  Anzeigename: "z. B. Rechnung Ölwechsel",
  Stichwort: "z. B. Ölwechsel oder Rechnungsnummer",
  Suchen: "z. B. Rechnung, ABE oder Ölfilter",
  "Externe Tankpreis-Seite": "z. B. https://www.clever-tanken.de/",
};
export function captureExample(kind: string, category: string) {
  if (kind === "work") return "z. B. Ölfilter gewechselt";
  if (kind === "document") return "z. B. Rechnung Ölwechsel oder ABE Felgen";
  const titles: Record<string, string> = {
    Tanken: "z. B. Vollgetankt",
    "Wartung & Reparatur": "z. B. Motoröl und Ölfilter gekauft",
    "Umbauten & Zubehör": "z. B. Dachträger gekauft",
    "Versicherung & Steuer": "z. B. Kfz-Versicherung Jahresbeitrag",
    "Parken & Gebühren": "z. B. Parkticket Innenstadt",
    Pflege: "z. B. Autowäsche",
    "Fahrzeugkauf & Verkauf": "z. B. Kaufpreis des Fahrzeugs",
  };
  return titles[category] ?? "z. B. Fahrzeugzubehör gekauft";
}

const SuggestionContext = createContext<ReadonlySet<string>>(new Set());
export function SuggestedFields({
  labels,
  children,
}: {
  labels: ReadonlySet<string>;
  children: ReactNode;
}) {
  return (
    <SuggestionContext.Provider value={labels}>
      {children}
    </SuggestionContext.Provider>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const suggested = useContext(SuggestionContext).has(label);
  let control = children;
  if (
    isValidElement<InputHTMLAttributes<HTMLInputElement>>(children) &&
    (children.type === "input" || children.type === "textarea")
  ) {
    const props = children.props,
      allowed =
        children.type === "textarea" ||
        !["date", "file", "checkbox", "radio", "hidden"].includes(
          props.type ?? "text",
        );
    const example = examples[label] ?? examples[props.name ?? ""];
    if (
      allowed &&
      example &&
      (!props.placeholder || ["Unbekannt", "0,00"].includes(props.placeholder))
    )
      control = cloneElement(children, { placeholder: example });
  }
  return (
    <label
      className={"field" + (suggested ? " field-suggested" : "")}
      title={suggested ? "Belegvorschlag – bitte prüfen" : undefined}
    >
      <span>{label}</span>
      {control}
      {hint && <small>{hint}</small>}
    </label>
  );
}
