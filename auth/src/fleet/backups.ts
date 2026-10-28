import {
  canonical,
  clone,
  hash,
  tables,
  validateState,
} from "../../../shared/logic";
import type { State } from "../../../shared/types";
import {
  problem,
  storage,
  type Statement,
  type StoredObject,
  type V2Env,
} from "../v2/types";
import {
  fullState,
  now,
  priorReceipt,
  transact,
  vehicle,
  vehicles,
  type FleetAccount,
  type VehicleRow,
} from "./store";

export type AccountBackup = {
  format: "vehicle-account-backup";
  schema_version: 2;
  settings: State["Settings"][0];
  vehicles: State[];
};
export async function exportMetadata(env: V2Env, a: FleetAccount, id?: string) {
  if (id) return fullState(env, a, await vehicle(env, a, id));
  const states: State[] = [];
  for (const v of await vehicles(env, a))
    states.push(await fullState(env, a, v));
  return {
    format: "vehicle-account-backup",
    schema_version: 2,
    settings: JSON.parse(a.settings),
    vehicles: states,
  } satisfies AccountBackup;
}
type Restore = {
  owner: string;
  id: string;
  vehicle: string | null;
  generation: string;
  source_hash: string;
  status: string;
  settings: string;
  base_heads: string;
  base_revision: number;
};
async function target(env: V2Env, a: FleetAccount, id: string) {
  const r = await storage(env)
    .db.prepare("SELECT * FROM fleet_restores WHERE owner=? AND id=?")
    .bind(a.owner, id)
    .first<Restore>();
  if (!r) problem(404, "Wiederherstellung gehört nicht zu diesem Konto.");
  return r;
}
export async function restoreStart(
  env: V2Env,
  a: FleetAccount,
  selected: string | null,
  input: State | AccountBackup,
) {
  const account =
    input && "format" in input && input.format === "vehicle-account-backup";
  if (account && selected)
    problem(
      400,
      "Kontosicherung bitte über die Kontowiederherstellung öffnen.",
    );
  const data = account ? (input as AccountBackup).vehicles : [input as State];
  if (!Array.isArray(data) || !data.length || data.length > 100)
    problem(400, "Sicherung enthält keine gültigen Fahrzeuge.");
  const settings = account
      ? (input as AccountBackup).settings
      : JSON.parse(a.settings),
    ids = new Set<string>();
  for (const s of data) {
    validateState(s);
    const id = s.Vehicles[0].id;
    if (ids.has(id)) problem(400, "Fahrzeug-ID mehrfach vorhanden.");
    ids.add(id);
  }
  const check = clone(data[0]);
  check.Settings = [settings];
  validateState(check);
  const fp = hash(canonical(input)),
    { db } = storage(env),
    previous = await db
      .prepare(
        "SELECT id FROM fleet_restores WHERE owner=? AND vehicle IS ? AND source_hash=?",
      )
      .bind(a.owner, selected, fp)
      .first<{ id: string }>();
  if (previous) return { ...previous, vehicleId: selected };
  const id = crypto.randomUUID(),
    generation = "restore-" + id,
    staging = "staging-" + id,
    heads = Object.fromEntries(
      (await vehicles(env, a)).map((v) => [v.id, v.revision]),
    ),
    commands: Statement[] = [];
  for (const original of data) {
    const source = clone(original),
      vehicleId = selected ?? source.Vehicles[0].id,
      v = source.Vehicles[0];
    if (selected) await vehicle(env, a, selected);
    v.id = vehicleId;
    v.vehicle_id = vehicleId;
    source.Uploads = [];
    for (const t of tables) for (const r of source[t]) r.vehicle_id = vehicleId;
    const row: VehicleRow = {
      owner: a.owner,
      fleet_generation: staging,
      id: vehicleId,
      generation,
      revision: 1,
      payload: JSON.stringify(v),
      preferences: JSON.stringify({
        hidden_categories: source.Settings[0].hidden_categories,
      }),
    };
    commands.push(
      db
        .prepare(
          "INSERT INTO fleet_vehicles(owner,fleet_generation,id,generation,payload,preferences) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          a.owner,
          staging,
          vehicleId,
          generation,
          row.payload,
          row.preferences,
        ),
    );
    for (const d of source.Documents) {
      d.drive_id = null;
      d.missing = true;
    }
    for (const kind of tables.filter(
      (k) => !["Settings", "Vehicles"].includes(k),
    ))
      for (let n = 0; n < source[kind].length; n += 100) {
        const chunk = source[kind]
          .slice(n, n + 100)
          .map((r) => ({ id: r.id, payload: JSON.stringify(r) }));
        commands.push(
          db
            .prepare(
              "INSERT INTO fleet_entities(owner,vehicle,generation,kind,id,payload) SELECT ?,?,?,?,json_extract(value,'$.id'),json_extract(value,'$.payload') FROM json_each(?)",
            )
            .bind(a.owner, vehicleId, generation, kind, JSON.stringify(chunk)),
        );
      }
  }
  commands.push(
    db
      .prepare(
        "INSERT INTO fleet_restores(owner,id,vehicle,generation,source_hash,created_at,settings,base_heads,base_revision) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        a.owner,
        id,
        selected,
        generation,
        fp,
        now(),
        JSON.stringify(settings),
        JSON.stringify(heads),
        a.revision,
      ),
  );
  try {
    await db.batch(commands);
  } catch (error) {
    const raced = await db
      .prepare(
        "SELECT id FROM fleet_restores WHERE owner=? AND vehicle IS ? AND source_hash=?",
      )
      .bind(a.owner, selected, fp)
      .first<{ id: string }>();
    if (raced) return { ...raced, vehicleId: selected };
    throw error;
  }
  return { id, vehicleId: selected };
}
export async function restorePreview(env: V2Env, a: FleetAccount, id: string) {
  const r = await target(env, a, id),
    { db } = storage(env),
    staged = (
      await db
        .prepare(
          "SELECT * FROM fleet_vehicles WHERE owner=? AND fleet_generation=? ORDER BY id",
        )
        .bind(a.owner, "staging-" + id)
        .all<VehicleRow>()
    ).results,
    missing: string[] = [],
    states: State[] = [];
  const receipts = await db
      .prepare(
        "SELECT id,sha256,size,mime,role FROM record_objects WHERE owner=? AND status='ready'",
      )
      .bind(a.owner)
      .all<StoredObject>(),
    objects = new Map(receipts.results.map((o) => [o.id, o]));
  for (const v of staged) {
    const s = await fullState(env, { ...a, settings: r.settings }, v);
    for (const d of s.Documents) {
      if (!d.sha256) continue;
      const o = objects.get(d.sha256);
      if (
        !o ||
        o.role !== "original" ||
        o.sha256 !== d.sha256 ||
        o.size !== d.size ||
        o.mime !== d.mime ||
        d.missing
      )
        missing.push(d.title);
      if (
        d.mime?.startsWith("image/") &&
        objects.get("thumb-" + d.sha256)?.role !== "thumbnail"
      )
        missing.push(d.title + " (Vorschau)");
    }
    states.push(s);
  }

  return {
    id,
    state: states[0],
    states,
    missing,
    scope: r.vehicle ? "vehicle" : "account",
    status: r.status,
  };
}
export async function restoreSwitch(
  env: V2Env,
  a: FleetAccount,
  id: string,
  confirm: boolean,
  operation: string,
) {
  if (!confirm) problem(400, "Ausdrückliche Bestätigung fehlt.");
  const r = await target(env, a, id),
    scope = r.vehicle ? "vehicle:" + r.vehicle : "account",
    prior = await priorReceipt(env, a.owner, scope, operation, { restore: id });
  if (prior.result) return prior.result;
  const preview = await restorePreview(env, a, id);
  if (preview.missing.length) problem(409, "Originaldateien fehlen.");
  if (!preview.states.length) problem(400, "Wiederherstellung ist leer.");
  const { db } = storage(env),
    commands: Statement[] = [],
    heads = JSON.parse(r.base_heads),
    reply = {
      result: { ok: true, reload: true },
      revision: 0,
      settingsRevision: a.revision,
      changes: {},
    };
  let v: VehicleRow | null = null;
  if (r.vehicle) {
    v = await vehicle(env, a, r.vehicle);
    const source = preview.state;
    commands.push(
      db
        .prepare(
          "UPDATE fleet_vehicles SET generation=?,payload=?,preferences=?,revision=revision+1 WHERE owner=? AND fleet_generation=? AND id=?",
        )
        .bind(
          r.generation,
          JSON.stringify(source.Vehicles[0]),
          JSON.stringify({
            hidden_categories: source.Settings[0].hidden_categories,
          }),
          a.owner,
          a.generation,
          v.id,
        ),
    );
    reply.revision = v.revision + 1;
  } else {
    for (const current of await vehicles(env, a)) {
      if (heads[current.id] !== current.revision)
        problem(
          409,
          "Konflikt: Ein Fahrzeug wurde seit Beginn der Übernahme geändert.",
        );
      const nonce = crypto.randomUUID();
      commands.push(
        db
          .prepare(
            "INSERT INTO fleet_guards(nonce,owner,vehicle,expected) VALUES(?,?,?,?)",
          )
          .bind(nonce, a.owner, current.id, current.revision),
        db.prepare("DELETE FROM fleet_guards WHERE nonce=?").bind(nonce),
      );
    }
    commands.push(
      db
        .prepare(
          "UPDATE fleet_accounts SET generation=?,settings=?,revision=revision+1 WHERE owner=?",
        )
        .bind("staging-" + id, r.settings, a.owner),
    );
    reply.settingsRevision = a.revision + 1;
  }
  commands.push(
    db
      .prepare(
        "UPDATE fleet_restores SET status='active' WHERE owner=? AND id=?",
      )
      .bind(a.owner, id),
  );
  return transact(
    env,
    a,
    v,
    r.vehicle ? heads[r.vehicle] : r.base_revision,
    operation,
    prior.fingerprint,
    reply,
    commands,
  );
}
