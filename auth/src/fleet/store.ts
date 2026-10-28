import type {
  Changes,
  MutationReply,
  VehicleSummary,
} from "../../../shared/fleet";
import {
  canonical,
  emptyState,
  hash,
  tables,
  validateState,
} from "../../../shared/logic";
import type { State, Table } from "../../../shared/types";
import { hasVehicle } from "../../../shared/vehicle";
import { readState } from "../v2/store";
import { problem, storage, type Statement, type V2Env } from "../v2/types";
import { nextRun } from "./time";

export type FleetAccount = {
  owner: string;
  revision: number;
  generation: string;
  settings: string;
  migrated_at: string;
};
export type VehicleRow = {
  owner: string;
  fleet_generation: string;
  id: string;
  generation: string;
  revision: number;
  payload: string;
  preferences: string;
};
export const now = () => new Date().toISOString();
export const asSummary = (v: VehicleRow): VehicleSummary => ({
  id: v.id,
  vehicle: JSON.parse(v.payload),
  revision: v.revision,
  generation: v.generation,
});
export async function fleetAccount(env: V2Env, owner: string) {
  return storage(env)
    .db.prepare("SELECT * FROM fleet_accounts WHERE owner=?")
    .bind(owner)
    .first<FleetAccount>();
}

// Explicitly called by the migration command, never implicitly on an ordinary read.
export async function migrateLegacy(env: V2Env, owner: string) {
  if (await fleetAccount(env, owner)) return;
  const { state, account: a } = await readState(env, owner);
  validateState(state);
  const { db } = storage(env),
    generation = crypto.randomUUID(),
    v = state.Vehicles[0],
    settings = state.Settings[0],
    at = now();
  const commands: Statement[] = [
    db
      .prepare(
        "INSERT OR IGNORE INTO fleet_accounts(owner,generation,settings,migrated_at) VALUES(?,?,?,?)",
      )
      .bind(owner, generation, JSON.stringify(settings), at),
  ];
  if (hasVehicle(state)) {
    commands.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO fleet_vehicles(owner,fleet_generation,id,generation,payload,preferences) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          owner,
          generation,
          v.id,
          generation,
          JSON.stringify(v),
          JSON.stringify({ hidden_categories: settings.hidden_categories }),
        ),
    );
    for (const kind of tables.filter(
      (t) => !["Vehicles", "Settings"].includes(t),
    )) {
      for (let i = 0; i < state[kind].length; i += 100) {
        const rows = state[kind].slice(i, i + 100).map((row) => ({
          id: row.id,
          payload: JSON.stringify({ ...row, vehicle_id: v.id }),
        }));
        commands.push(
          db
            .prepare(
              "INSERT OR IGNORE INTO fleet_entities(owner,vehicle,generation,kind,id,payload) SELECT ?,?,?,?,json_extract(value,'$.id'),json_extract(value,'$.payload') FROM json_each(?)",
            )
            .bind(owner, v.id, generation, kind, JSON.stringify(rows)),
        );
      }
    }
  }
  commands.push(
    db
      .prepare(
        "INSERT OR IGNORE INTO fleet_jobs(owner,next_run,last_run,last_backup,last_error) VALUES(?,?,?,?,?)",
      )
      .bind(
        owner,
        nextRun(Date.now()),
        a.last_run,
        a.last_backup,
        a.last_error,
      ),
  );
  await db.batch(commands);
}
export async function createFleet(env: V2Env, owner: string) {
  const { db } = storage(env),
    settings = emptyState().Settings[0];
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO fleet_accounts(owner,generation,settings,migrated_at) VALUES(?,?,?,?)",
      )
      .bind(owner, crypto.randomUUID(), JSON.stringify(settings), now()),
    db
      .prepare("INSERT OR IGNORE INTO fleet_jobs(owner,next_run) VALUES(?,?)")
      .bind(owner, nextRun(Date.now())),
  ]);
}
export async function vehicles(env: V2Env, a: FleetAccount) {
  return (
    await storage(env)
      .db.prepare(
        "SELECT * FROM fleet_vehicles WHERE owner=? AND fleet_generation=? ORDER BY id",
      )
      .bind(a.owner, a.generation)
      .all<VehicleRow>()
  ).results;
}
export async function vehicle(
  env: V2Env,
  a: FleetAccount,
  id: string,
  write = false,
) {
  const v = await storage(env)
    .db.prepare(
      "SELECT * FROM fleet_vehicles WHERE owner=? AND fleet_generation=? AND id=?",
    )
    .bind(a.owner, a.generation, id)
    .first<VehicleRow>();
  if (!v) problem(404, "Fahrzeug gehört nicht zu dieser Akte.");
  if (write && JSON.parse(v.payload).archived)
    problem(
      409,
      "Archiviertes Fahrzeug ist schreibgeschützt. Bitte zuerst reaktivieren.",
    );
  return v;
}
export function baseState(a: FleetAccount, v: VehicleRow): State {
  const s = emptyState();
  s.Vehicles = [JSON.parse(v.payload)];
  s.Settings = [
    {
      ...JSON.parse(a.settings),
      ...JSON.parse(v.preferences),
      revision: a.revision,
      vehicle_id: v.id,
    },
  ];
  return s;
}
export async function rows(
  env: V2Env,
  a: FleetAccount,
  v: VehicleRow,
  kind: Table,
  where = "",
  values: unknown[] = [],
  suffix = "",
) {
  const q =
    "SELECT payload FROM fleet_entities WHERE owner=? AND vehicle=? AND generation=? AND kind=?" +
    where +
    " " +
    suffix;
  return (
    await storage(env)
      .db.prepare(q)
      .bind(a.owner, v.id, v.generation, kind, ...values)
      .all<{ payload: string }>()
  ).results.map((r) => JSON.parse(r.payload));
}
export async function fullState(env: V2Env, a: FleetAccount, v: VehicleRow) {
  const s = baseState(a, v);
  const data = await storage(env)
    .db.prepare(
      "SELECT kind,payload FROM fleet_entities WHERE owner=? AND vehicle=? AND generation=?",
    )
    .bind(a.owner, v.id, v.generation)
    .all<{ kind: Table; payload: string }>();
  for (const r of data.results)
    (s[r.kind] as unknown[]).push(JSON.parse(r.payload));
  validateState(s);
  return s;
}
export function entityInsert(
  env: V2Env,
  a: FleetAccount,
  v: VehicleRow,
  kind: Table,
  row: { id: string },
) {
  return storage(env)
    .db.prepare(
      "INSERT INTO fleet_entities(owner,vehicle,generation,kind,id,payload) VALUES(?,?,?,?,?,?) ON CONFLICT(owner,vehicle,generation,kind,id) DO UPDATE SET payload=excluded.payload",
    )
    .bind(a.owner, v.id, v.generation, kind, row.id, JSON.stringify(row));
}
export async function priorReceipt(
  env: V2Env,
  owner: string,
  scope: string,
  operation: string,
  input: unknown,
) {
  if (!/^[\w-]{8,100}$/.test(operation))
    problem(400, "Vorgangskennung fehlt oder ist ungültig.");
  const fp = hash(canonical(input)),
    old = await storage(env)
      .db.prepare(
        "SELECT fingerprint,result FROM fleet_receipts WHERE owner=? AND scope=? AND operation=?",
      )
      .bind(owner, scope, operation)
      .first<{ fingerprint: string; result: string }>();
  if (old && old.fingerprint !== fp)
    problem(409, "Vorgangskennung gehört zu anderen Angaben.");
  return {
    fingerprint: fp,
    result: old ? (JSON.parse(old.result) as MutationReply) : null,
  };
}
export async function transact(
  env: V2Env,
  a: FleetAccount,
  v: VehicleRow | null,
  expected: number,
  operation: string,
  fingerprint: string,
  reply: MutationReply,
  commands: Statement[],
) {
  const { db } = storage(env),
    nonce = crypto.randomUUID(),
    scope = v ? "vehicle:" + v.id : "account";
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO fleet_guards(nonce,owner,vehicle,expected) VALUES(?,?,?,?)",
        )
        .bind(nonce, a.owner, v?.id ?? null, expected),
      ...commands,
      db
        .prepare(
          "INSERT INTO fleet_receipts(owner,scope,operation,fingerprint,result,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          a.owner,
          scope,
          operation,
          fingerprint,
          JSON.stringify(reply),
          now(),
        ),
      db.prepare("DELETE FROM fleet_guards WHERE nonce=?").bind(nonce),
    ]);
  } catch (error) {
    const old = await db
      .prepare(
        "SELECT fingerprint,result FROM fleet_receipts WHERE owner=? AND scope=? AND operation=?",
      )
      .bind(a.owner, scope, operation)
      .first<{ fingerprint: string; result: string }>();
    if (old?.fingerprint === fingerprint)
      return JSON.parse(old.result) as MutationReply;
    if (String(error).includes("FLEET_CONFLICT"))
      problem(
        409,
        "Konflikt: Dieser Bereich wurde inzwischen geändert. Bitte neu laden und vergleichen.",
        "CONFLICT",
      );
    throw error;
  }
  return reply;
}
export function changedRows(before: State, after: State) {
  const changes: Changes = {},
    removed: Partial<Record<Table, string[]>> = {};
  for (const t of tables) {
    if (t === "Settings" || t === "Vehicles") continue;
    const old = new Map(before[t].map((r) => [r.id, JSON.stringify(r)])),
      next = new Set(after[t].map((r) => r.id));
    const changed = after[t].filter((r) => old.get(r.id) !== JSON.stringify(r));
    if (changed.length) (changes[t] as unknown[]) = changed;
    const missing = before[t].filter((r) => !next.has(r.id)).map((r) => r.id);
    if (missing.length) removed[t] = missing;
  }
  return { changes, removed };
}
