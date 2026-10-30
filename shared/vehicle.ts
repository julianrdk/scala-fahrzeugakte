import { editEntity, fail } from "./logic";
import type { State, Vehicle } from "./types";
export type VehicleCreation = Pick<Vehicle, "manufacturer" | "model"> &
  Partial<
    Pick<
      Vehicle,
      "year" | "engine" | "fuel_type" | "power_kw" | "catalog_reference"
    >
  >;

export const vehicleName = (vehicle: Vehicle) =>
  [vehicle.manufacturer, vehicle.model].filter(Boolean).join(" ");
export const hasVehicle = (state: State) =>
  Boolean(
    state.Vehicles[0]?.manufacturer?.trim() && state.Vehicles[0]?.model?.trim(),
  );
export function addVehicle(
  state: State,
  input: {
    manufacturer?: unknown;
    model?: unknown;
    year?: unknown;
    engine?: unknown;
    fuel_type?: unknown;
    power_kw?: unknown;
    catalog_reference?: unknown;
  },
  at: string,
) {
  if (
    typeof input.manufacturer !== "string" ||
    !input.manufacturer.trim() ||
    typeof input.model !== "string" ||
    !input.model.trim()
  )
    fail("Hersteller und Modell fehlen.");
  const patch = {
    manufacturer: input.manufacturer.trim(),
    model: input.model.trim(),
    year:
      typeof input.year === "string" && input.year.trim()
        ? input.year.trim()
        : null,
    ...(input.engine !== undefined ? { engine: input.engine } : {}),
    ...(input.fuel_type !== undefined ? { fuel_type: input.fuel_type } : {}),
    ...(input.power_kw !== undefined ? { power_kw: input.power_kw } : {}),
    ...(input.catalog_reference !== undefined
      ? { catalog_reference: input.catalog_reference }
      : {}),
  };
  if (hasVehicle(state)) {
    const v = state.Vehicles[0];
    if (
      v.manufacturer === patch.manufacturer &&
      v.model === patch.model &&
      v.year === patch.year
    )
      return state;
    fail(
      "Ein Fahrzeug ist bereits angelegt. Bitte die Fahrzeugdaten bearbeiten.",
    );
  }
  return editEntity(
    state,
    "Vehicles",
    state.Vehicles[0].id,
    state.Vehicles[0].revision,
    patch,
    at,
  );
}
