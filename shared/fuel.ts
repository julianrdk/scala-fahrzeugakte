export type FuelGrade = "e5" | "e10" | "diesel";
export type FuelPoint = { lat: number; lng: number; label: string };
export type FuelQuery = { postalCode: string } | { lat: number; lng: number };
export type FuelStation = {
  id: string;
  name: string;
  brand: string;
  street: string;
  houseNumber: string;
  postCode: string;
  place: string;
  lat: number;
  lng: number;
  distance: number;
  isOpen: boolean;
  prices: Record<FuelGrade, number | null>;
};
export type FuelResult = {
  center: FuelPoint;
  stations: FuelStation[];
  fetchedAt: string;
  cached: boolean;
};
export type FuelStatus = { enabled: boolean; reason?: "key" | "database" };
export interface FuelService {
  fuelStatus(): Promise<FuelStatus>;
  searchFuel(query: FuelQuery, signal?: AbortSignal): Promise<FuelResult>;
}
export class FuelSearchError extends Error {
  constructor(
    message: string,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
export function fuelPrice(value: number | null | undefined) {
  return value == null
    ? "–"
    : value.toLocaleString("de-DE", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      }) + " €";
}
export function matchingStations(
  stations: FuelStation[],
  grade: FuelGrade | "all",
  radius: number,
  openOnly: boolean,
) {
  return stations
    .filter(
      (x) =>
        x.distance <= radius &&
        (!openOnly || x.isOpen) &&
        (grade === "all" || x.prices[grade] !== null),
    )
    .sort((a, b) =>
      grade === "all"
        ? a.distance - b.distance
        : (a.prices[grade] ?? Infinity) - (b.prices[grade] ?? Infinity) ||
          a.distance - b.distance,
    );
}
