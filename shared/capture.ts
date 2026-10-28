import type {
  CaptureMetadata,
  ImportPackage,
  PositionPrice,
  Settings,
  State,
  WorkshopSnapshot,
} from "./types";

function invalid(message: string): never {
  throw Error(message);
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((k) => !allowed.includes(k)))
    invalid("Unbekannte Zusatzangabe.");
}
const identifier = /^[A-Za-z0-9_-]{1,100}$/;
export function metadataValue<T>(
  map: Record<string, T> | undefined,
  ref: string,
): T | undefined {
  return map && Object.prototype.hasOwnProperty.call(map, ref)
    ? map[ref]
    : undefined;
}
export function exactDecimal(value: string): string | null {
  const text = value.trim().replace(",", ".");
  if (!text) return null;
  if (!/^-?\d{1,10}(?:\.\d{1,6})?$/.test(text))
    invalid(
      "Einzelpreis bitte als Zahl mit höchstens sechs Nachkommastellen eingeben.",
    );
  return text.replace(/^(-?)0+(?=\d)/, "$1");
}
export function validatePrices(
  value: unknown,
  length: number,
): asserts value is PositionPrice[] {
  if (!Array.isArray(value) || value.length !== length || length > 100)
    invalid("Positionspreise passen nicht zu den Rechnungspositionen.");
  for (const row of value) {
    if (!object(row)) invalid("Positionspreis ungültig.");
    keys(row, ["unit_price", "total_cents", "basis"]);
    if (
      row.unit_price !== null &&
      (typeof row.unit_price !== "string" ||
        exactDecimal(row.unit_price) !== row.unit_price)
    )
      invalid("Einzelpreis ungültig.");
    if (
      row.total_cents !== null &&
      (!Number.isSafeInteger(row.total_cents) ||
        Math.abs(row.total_cents as number) > 1e10)
    )
      invalid("Positionsbetrag muss in ganzen Cent angegeben sein.");
    if (!["net", "gross", "unknown"].includes(String(row.basis)))
      invalid("Preisbasis ungültig.");
  }
}
export function validateWorkshopSettings(settings: Settings) {
  const rows = settings.workshops ?? [];
  if (!Array.isArray(rows) || rows.length > 50)
    invalid("Bitte höchstens 50 Werkstätten speichern.");
  const ids = new Set<string>();
  for (const row of rows) {
    if (!object(row)) invalid("Werkstatt ungültig.");
    keys(row, ["id", "name", "address", "archived"]);
    if (
      typeof row.id !== "string" ||
      !identifier.test(row.id) ||
      ids.has(row.id) ||
      typeof row.name !== "string" ||
      !row.name.trim() ||
      row.name.length > 120 ||
      typeof row.address !== "string" ||
      row.address.length > 500 ||
      typeof row.archived !== "boolean"
    )
      invalid(
        "Werkstatt benötigt einen eindeutigen Namen und gültige Angaben.",
      );
    ids.add(row.id);
  }
  if (
    settings.self_workshop_id != null &&
    !rows.some((x) => x.id === settings.self_workshop_id && !x.archived)
  )
    invalid("Standard für Eigenleistung muss eine aktive Werkstatt sein.");
}
export function workshopSnapshot(
  settings: Settings,
  id: string | null,
): WorkshopSnapshot | null {
  if (id === null) return null;
  const profile =
    settings.workshops?.find((x) => x.id === id && !x.archived) ??
    invalid("Die ausgewählte Werkstatt ist nicht mehr verfügbar.");
  return {
    profile_id: profile.id,
    name: profile.name,
    address: profile.address,
  };
}
export function validateSnapshot(value: unknown) {
  if (value == null) return;
  if (!object(value)) invalid("Werkstattangabe ungültig.");
  keys(value, ["profile_id", "name", "address"]);
  if (
    typeof value.profile_id !== "string" ||
    !identifier.test(value.profile_id) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 120 ||
    typeof value.address !== "string" ||
    value.address.length > 500
  )
    invalid("Werkstattangabe ungültig.");
}
export function validateCapture(
  value: unknown,
  p: ImportPackage,
  s: State,
): CaptureMetadata | undefined {
  if (value === undefined) return undefined;
  if (!object(value)) invalid("Zusatzangaben ungültig.");
  keys(value, ["workshops_by_work_ref", "prices_by_expense_ref"]);
  for (const field of [
    "workshops_by_work_ref",
    "prices_by_expense_ref",
  ] as const) {
    const map = value[field];
    if (map === undefined) continue;
    if (!object(map)) invalid("Zuordnung ungültig.");
    for (const [ref, item] of Object.entries(map)) {
      if (!identifier.test(ref)) invalid("Referenz ungültig.");
      if (field === "workshops_by_work_ref") {
        if (
          !p.work.some((x) => x.ref === ref) ||
          (item !== null && typeof item !== "string")
        )
          invalid("Werkstattzuordnung passt zu keiner Arbeit.");
        workshopSnapshot(s.Settings[0], item as string | null);
      } else {
        const expense =
          p.expenses.find((x) => x.ref === ref) ??
          invalid("Positionspreise passen zu keiner Ausgabe.");
        validatePrices(item, expense.items?.length ?? 0);
      }
    }
  }
  return value as CaptureMetadata;
}
export function validateExtendedState(s: State) {
  validateWorkshopSettings(s.Settings[0]);
  for (const e of s.Expenses)
    if (e.position_prices !== undefined)
      validatePrices(e.position_prices, e.items?.length ?? 0);
  for (const w of s.Work) validateSnapshot(w.workshop_snapshot);
}
