export function normalize(text: string): string;
export function sha256(data: Uint8Array | string): string;
export function sheetRows(
  data: Uint8Array,
  name: string,
): Record<string, string>[];
export function compileCatalog(
  fz2: Record<string, string>[],
  fz6: Record<string, string>[],
  asOf: string,
): {
  makes: Omit<
    import("../shared/vehicle-catalog").CatalogMake,
    "version" | "as_of"
  >[];
  diagnostics: {
    ambiguous: number;
    unlinked: number;
    unknownFuelCodes: string[];
  };
};
