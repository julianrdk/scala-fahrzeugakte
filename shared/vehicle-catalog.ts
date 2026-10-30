export type KbaTypeKey = { manufacturer: string; tsn: string; hsn?: string };
export type CatalogReference = {
  source: "kba";
  as_of: string;
  make: string;
  model: string;
  variant: string | null;
  types: KbaTypeKey[];
};
export type CatalogVariant = {
  id: string;
  fuel_type: string | null;
  power_kw: number | null;
  references: KbaTypeKey[];
};
export type CatalogModel = {
  id: string;
  label: string;
  variants: CatalogVariant[];
};
export type CatalogMake = {
  version: 1;
  as_of: string;
  id: string;
  label: string;
  aliases: string[];
  models: CatalogModel[];
};
export type CatalogMakeEntry = Pick<CatalogMake, "id" | "label" | "aliases"> & {
  file: string;
  sha256: string;
};
export type CatalogIndex = {
  version: 1;
  as_of: string;
  source: { name: string; url: string; sha256: string }[];
  licence: { label: string; url: string };
  attribution: string;
  counts: { makes: number; models: number; variants: number };
  makes: CatalogMakeEntry[];
};
export const catalogSearch = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
export const variantLabel = (variant: CatalogVariant) =>
  [
    variant.fuel_type,
    variant.power_kw === null
      ? null
      : variant.power_kw.toLocaleString("de-DE") + " kW",
  ]
    .filter(Boolean)
    .join(", ");

export function validCatalogReference(
  value: unknown,
): value is CatalogReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as CatalogReference;
  return (
    Object.keys(v).every((k) =>
      ["source", "as_of", "make", "model", "variant", "types"].includes(k),
    ) &&
    v.source === "kba" &&
    typeof v.as_of === "string" &&
    /^20\d{2}-01-01$/.test(v.as_of) &&
    typeof v.make === "string" &&
    /^[a-z0-9]{1,100}$/.test(v.make) &&
    typeof v.model === "string" &&
    v.model.length > 0 &&
    v.model.length <= 200 &&
    (v.variant === null ||
      (typeof v.variant === "string" && /^[a-f0-9]{16}$/.test(v.variant))) &&
    Array.isArray(v.types) &&
    v.types.length <= 500 &&
    v.types.every(
      (t) =>
        t &&
        typeof t === "object" &&
        !Array.isArray(t) &&
        Object.keys(t).every((k) =>
          ["manufacturer", "tsn", "hsn"].includes(k),
        ) &&
        typeof t.manufacturer === "string" &&
        t.manufacturer.length > 0 &&
        t.manufacturer.length <= 200 &&
        typeof t.tsn === "string" &&
        /^[A-Z0-9]{3}$/.test(t.tsn) &&
        (t.hsn === undefined ||
          (typeof t.hsn === "string" && /^\d{4}$/.test(t.hsn))),
    )
  );
}
