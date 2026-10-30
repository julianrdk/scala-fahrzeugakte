import type {
  CatalogIndex,
  CatalogMake,
  CatalogMakeEntry,
} from "../shared/vehicle-catalog";
import { validCatalogReference } from "../shared/vehicle-catalog";
const base = import.meta.env.BASE_URL + "vehicle-catalog/";
let index: CatalogIndex | undefined;
const makes = new Map<string, CatalogMake>();
async function json(
  file: string,
  signal: AbortSignal,
  cache: RequestCache = "default",
) {
  try {
    const response = await fetch(base + file, {
      signal,
      cache,
      credentials: "omit",
    });
    if (
      !response.ok ||
      !response.headers.get("Content-Type")?.includes("application/json")
    )
      throw Error("Fahrzeugkatalog nicht verfügbar.");
    return await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    throw Error("Fahrzeugkatalog nicht verfügbar.");
  }
}
export async function loadCatalog(signal: AbortSignal): Promise<CatalogIndex> {
  if (index) return index;
  const value = (await json("index.json", signal, "no-cache")) as CatalogIndex;
  if (
    value?.version !== 1 ||
    !Array.isArray(value.makes) ||
    !/^20\d{2}-01-01$/.test(value.as_of) ||
    !value.makes.every(
      (m) =>
        m &&
        typeof m.id === "string" &&
        /^[a-z0-9]+$/.test(m.id) &&
        typeof m.label === "string" &&
        m.label.length > 0 &&
        Array.isArray(m.aliases) &&
        m.aliases.every((a) => typeof a === "string") &&
        typeof m.file === "string" &&
        /^[a-z0-9]+\.[a-f0-9]{12}\.json$/.test(m.file),
    )
  )
    throw Error("Fahrzeugkatalog nicht verfügbar.");
  index = value;
  return value;
}
export async function loadMake(
  entry: CatalogMakeEntry,
  asOf: string,
  signal: AbortSignal,
): Promise<CatalogMake> {
  if (!/^[a-z0-9]+\.[a-f0-9]{12}\.json$/.test(entry.file))
    throw Error("Ungültige Katalogdatei.");
  const cached = makes.get(entry.file);
  if (cached) return cached;
  let value: CatalogMake;
  try {
    value = (await json(entry.file, signal)) as CatalogMake;
    if (
      value?.version !== 1 ||
      value.id !== entry.id ||
      value.as_of !== asOf ||
      !Array.isArray(value.models) ||
      !value.models.every(
        (m) =>
          m &&
          typeof m.id === "string" &&
          typeof m.label === "string" &&
          m.label.length > 0 &&
          Array.isArray(m.variants) &&
          m.variants.every(
            (v) =>
              v &&
              (v.fuel_type === null ||
                (typeof v.fuel_type === "string" &&
                  v.fuel_type.length <= 100)) &&
              (v.power_kw === null ||
                (typeof v.power_kw === "number" &&
                  Number.isFinite(v.power_kw) &&
                  v.power_kw > 0 &&
                  v.power_kw <= 10000)) &&
              validCatalogReference({
                source: "kba",
                as_of: asOf,
                make: entry.id,
                model: m.label,
                variant: v.id,
                types: v.references,
              }),
          ),
      )
    )
      throw Error("Fahrzeugkatalog nicht verfügbar.");
  } catch (error) {
    // An open page may still refer to files from an earlier deployment.
    // A deliberate retry must be able to retrieve the new manifest.
    if (!signal.aborted) index = undefined;
    throw error;
  }
  // Only public reference data; no account data belongs in this shared cache.
  makes.set(entry.file, value);
  return value;
}
