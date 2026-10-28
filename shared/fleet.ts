import type { Settings, State, Table, Vehicle } from "./types";
export type VehicleSummary = {
  id: string;
  vehicle: Vehicle;
  revision: number;
  generation: string;
};
export type FleetBootstrap = {
  vehicles: VehicleSummary[];
  settings: Settings;
  settingsRevision: number;
  status: Record<string, any>;
};
export type Changes = Partial<{ [K in Table]: State[K] }>;
export type MutationReply = {
  result: any;
  revision: number;
  settingsRevision: number;
  changes: Changes;
  removed?: Partial<Record<Table, string[]>>;
  vehicle?: VehicleSummary;
  settings?: Settings;
};
export type PageCursor = { date: string; id: string };
export type PageInfo = {
  table: Table;
  cursor: string | null;
  hasMore: boolean;
  filter?: string;
};
export type HistoryFilter = {
  search: string;
  category: string;
  from: string;
  to: string;
  proof: "all" | "with" | "missing";
  showArchived: boolean;
  showVoided: boolean;
};
export const emptyHistoryFilter: HistoryFilter = {
  search: "",
  category: "",
  from: "",
  to: "",
  proof: "all",
  showArchived: false,
  showVoided: false,
};
export type VehicleView = {
  state: State;
  revision: number;
  settingsRevision: number;
  status: Record<string, any>;
  pages: PageInfo[];
  dashboard?: any;
};
export const sharedSettingFields = [
  "external_fuel_url",
  "email_enabled",
  "prompt_templates",
  "backup_retention",
  "workshops",
  "self_workshop_id",
];
export function selectedVehicle(
  vehicles: VehicleSummary[],
  preferred: string | null,
) {
  return (
    vehicles.find((v) => v.id === preferred)?.id ??
    vehicles.find((v) => !v.vehicle.archived)?.id ??
    vehicles[0]?.id ??
    null
  );
}
