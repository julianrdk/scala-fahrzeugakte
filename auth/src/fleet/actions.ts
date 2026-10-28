import { sharedSettingFields, type MutationReply } from "../../../shared/fleet";
import {
  canonical,
  clone,
  commitImport,
  completeReminder,
  editEntity,
  emptyState,
  fingerprint,
  meta,
  tables,
  validateState,
} from "../../../shared/logic";
import type { State, Table } from "../../../shared/types";
import { addVehicle } from "../../../shared/vehicle";
import { objectRecord } from "../v2/store";
import { problem, storage, type Statement, type V2Env } from "../v2/types";
import {
  asSummary,
  baseState,
  changedRows,
  entityInsert,
  now,
  priorReceipt,
  rows,
  transact,
  vehicle,
  type FleetAccount,
  type VehicleRow,
} from "./store";

const businessTables = [
  "Expenses",
  "Work",
  "Documents",
  "Reminders",
  "Vehicles",
  "Settings",
] as Table[];
async function addRows(
  env: V2Env,
  a: FleetAccount,
  v: VehicleRow,
  s: State,
  t: Table,
  ids: string[],
) {
  const known = new Set(s[t].map((r) => r.id)),
    missing = [...new Set(ids)].filter((id) => !known.has(id));
  if (missing.length)
    (s[t] as any[]).push(
      ...(await rows(
        env,
        a,
        v,
        t,
        " AND id IN (SELECT value FROM json_each(?))",
        [JSON.stringify(missing)],
      )),
    );
}
async function closure(env: V2Env, a: FleetAccount, v: VehicleRow, s: State) {
  await addRows(
    env,
    a,
    v,
    s,
    "Work",
    s.Reminders.flatMap((r) => (r.basis_work_ref ? [r.basis_work_ref] : [])),
  );
  await addRows(
    env,
    a,
    v,
    s,
    "Expenses",
    s.Work.flatMap((w) => w.expense_refs),
  );
  await addRows(
    env,
    a,
    v,
    s,
    "Documents",
    [...s.Expenses, ...s.Work]
      .flatMap((e) => e.document_refs)
      .concat(s.Vehicles[0].photo_id ? [s.Vehicles[0].photo_id] : []),
  );
  const ids = [...s.Expenses, ...s.Work].map((e) => e.id);
  if (ids.length)
    s.DocumentLinks = await rows(
      env,
      a,
      v,
      "DocumentLinks",
      " AND json_extract(payload,'$.entity_id') IN (SELECT value FROM json_each(?))",
      [JSON.stringify(ids)],
    );
}
export async function dependencies(
  env: V2Env,
  a: FleetAccount,
  v: VehicleRow,
  name: string,
  arg: any,
) {
  const s = baseState(a, v);
  if (name === "edit") {
    if (!businessTables.includes(arg.table))
      problem(400, "Bereich kann nicht bearbeitet werden.");
    if (!["Vehicles", "Settings"].includes(arg.table))
      await addRows(env, a, v, s, arg.table, [arg.id]);
    if (arg.table === "Work")
      await addRows(env, a, v, s, "Expenses", arg.patch?.expense_refs ?? []);
    if (arg.table === "Expenses") {
      s.Work = await rows(
        env,
        a,
        v,
        "Work",
        " AND EXISTS(SELECT 1 FROM json_each(json_extract(payload,'$.expense_refs')) WHERE value=?)",
        [arg.id],
      );
      if (arg.patch?.refund_of_id)
        await addRows(env, a, v, s, "Expenses", [arg.patch.refund_of_id]);
    }
    if (arg.patch?.photo_id)
      await addRows(env, a, v, s, "Documents", [arg.patch.photo_id]);
    if (arg.patch?.document_refs)
      await addRows(env, a, v, s, "Documents", arg.patch.document_refs);
  } else if (name === "completeReminder") {
    await addRows(env, a, v, s, "Reminders", [arg.id]);
    await addRows(env, a, v, s, "Work", [arg.work_id]);
  } else if (name === "attachDocument") {
    await addRows(env, a, v, s, "Documents", [arg.id]);
    await addRows(env, a, v, s, "Uploads", [arg.upload_id]);
  } else if (name === "commit") {
    const p = arg.package;
    if (!p || !Array.isArray(p.expenses) || !Array.isArray(p.documents))
      problem(400, "Importpaket fehlt.");
    await addRows(
      env,
      a,
      v,
      s,
      "Uploads",
      Object.values(arg.documents ?? {}) as string[],
    );
    await addRows(
      env,
      a,
      v,
      s,
      "Documents",
      Object.values(arg.documents ?? {}) as string[],
    );
    const hashes = s.Uploads.map((u) => u.sha256).concat(
      s.Documents.flatMap((d) => (d.sha256 ? [d.sha256] : [])),
    );
    if (hashes.length)
      s.Documents.push(
        ...(
          await rows(
            env,
            a,
            v,
            "Documents",
            " AND json_extract(payload,'$.sha256') IN (SELECT value FROM json_each(?))",
            [JSON.stringify(hashes)],
          )
        ).filter((d) => !s.Documents.some((x) => x.id === d.id)),
      );
    s.Expenses = await rows(
      env,
      a,
      v,
      "Expenses",
      " AND json_extract(payload,'$.voided')=0 AND (EXISTS(SELECT 1 FROM json_each(?) p WHERE json_extract(payload,'$.amount_cents') IS json_extract(p.value,'$.amount_cents') AND json_extract(payload,'$.currency') IS json_extract(p.value,'$.currency') AND lower(trim(json_extract(payload,'$.vendor')))=lower(trim(json_extract(p.value,'$.vendor'))) AND ((json_extract(p.value,'$.invoice_number') IS NOT NULL AND json_extract(payload,'$.invoice_number')=json_extract(p.value,'$.invoice_number')) OR (json_extract(p.value,'$.date') IS NOT NULL AND json_extract(payload,'$.date')=json_extract(p.value,'$.date')))) OR EXISTS(SELECT 1 FROM json_each(json_extract(payload,'$.document_refs')) WHERE value IN (SELECT value FROM json_each(?))))",
      [
        JSON.stringify(p.expenses),
        JSON.stringify(s.Documents.map((d) => d.id)),
      ],
    );
    await addRows(
      env,
      a,
      v,
      s,
      "Expenses",
      Object.values(arg.links ?? {}).flat() as string[],
    );
    s.Imports = await rows(
      env,
      a,
      v,
      "Imports",
      " AND json_extract(payload,'$.fingerprint')=?",
      [fingerprint(p)],
    );
    await addRows(env, a, v, s, "Operations", [arg.operation_id]);
  }
  await closure(env, a, v, s);
  return s;
}
export async function accountAction(
  env: V2Env,
  a: FleetAccount,
  name: string,
  arg: any,
  operation: string,
): Promise<MutationReply> {
  const prior = await priorReceipt(env, a.owner, "account", operation, {
    name,
    arg,
  });
  if (prior.result) return prior.result;
  const { db } = storage(env);
  let reply: MutationReply = {
      result: { ok: true },
      revision: 0,
      settingsRevision: a.revision + 1,
      changes: {},
    },
    commands: Statement[] = [];
  if (name === "createVehicle") {
    const state = addVehicle(emptyState(), arg, now()),
      id = crypto.randomUUID(),
      generation = crypto.randomUUID(),
      v = state.Vehicles[0];
    v.id = id;
    v.vehicle_id = id;
    commands.push(
      db
        .prepare(
          "INSERT INTO fleet_vehicles(owner,fleet_generation,id,generation,payload) VALUES(?,?,?,?,?)",
        )
        .bind(a.owner, a.generation, id, generation, JSON.stringify(v)),
    );
    reply.vehicle = { id, vehicle: v, revision: 1, generation };
    reply.revision = 1;
    reply.result = { ok: true, id };
  } else if (name === "settings") {
    if (
      !arg.patch ||
      Object.keys(arg.patch).some((k) => !sharedSettingFields.includes(k))
    )
      problem(400, "Ungültige gemeinsame Einstellung.");
    const s = emptyState();
    s.Settings = [{ ...JSON.parse(a.settings), revision: a.revision }];
    const after = editEntity(
      s,
      "Settings",
      s.Settings[0].id,
      arg.revision,
      arg.patch,
      now(),
    );
    reply.settings = after.Settings[0];
    commands.push(
      db
        .prepare("UPDATE fleet_accounts SET settings=? WHERE owner=?")
        .bind(JSON.stringify(reply.settings), a.owner),
    );
  } else problem(400, "Kontoaktion unbekannt.");
  commands.push(
    db
      .prepare("UPDATE fleet_accounts SET revision=revision+1 WHERE owner=?")
      .bind(a.owner),
  );
  return transact(
    env,
    a,
    null,
    arg.expected_revision,
    operation,
    prior.fingerprint,
    reply,
    commands,
  );
}
export async function mutate(
  env: V2Env,
  a: FleetAccount,
  id: string,
  name: string,
  arg: any,
  operation: string,
): Promise<MutationReply> {
  const v = await vehicle(env, a, id, name !== "archive"),
    prior = await priorReceipt(env, a.owner, "vehicle:" + id, operation, {
      name,
      arg,
    });
  if (prior.result) return prior.result;
  if (!Number.isInteger(arg.expected_revision))
    problem(400, "Fahrzeugrevision fehlt.");
  const { db } = storage(env),
    commands: Statement[] = [],
    reply: MutationReply = {
      result: { ok: true },
      revision: v.revision + 1,
      settingsRevision: a.revision,
      changes: {},
    };
  if (name === "archive") {
    if (typeof arg.archived !== "boolean") problem(400, "Archivstatus fehlt.");
    const data = JSON.parse(v.payload);
    data.archived = arg.archived;
    data.revision++;
    data.updated_at = now();
    reply.vehicle = {
      ...asSummary(v),
      vehicle: data,
      revision: reply.revision,
    };
    commands.push(
      db
        .prepare(
          "UPDATE fleet_vehicles SET payload=? WHERE owner=? AND fleet_generation=? AND id=?",
        )
        .bind(JSON.stringify(data), a.owner, a.generation, id),
    );
  } else {
    const before = await dependencies(env, a, v, name, arg);
    let next = clone(before);
    const at = now();
    switch (name) {
      case "edit":
        if (
          arg.table === "Settings" &&
          Object.keys(arg.patch ?? {}).some((k) => k !== "hidden_categories")
        )
          problem(400, "Gemeinsame Einstellungen bitte im Konto ändern.");
        if (arg.table === "Vehicles" && arg.id !== v.id)
          problem(404, "Fahrzeug fehlt.");
        if (arg.table === "Work") {
          // Include allocations of other works sharing one of this work's invoices.
          const expenseIds = [
            ...new Set([
              ...before.Work.flatMap((w) => w.expense_refs),
              ...(arg.patch?.expense_refs ?? []),
            ]),
          ];
          if (expenseIds.length) {
            const linked = await rows(
              env,
              a,
              v,
              "Work",
              " AND EXISTS(SELECT 1 FROM json_each(json_extract(payload,'$.expense_refs')) WHERE value IN (SELECT value FROM json_each(?)))",
              [JSON.stringify(expenseIds)],
            );
            for (const w of linked)
              if (!before.Work.some((x) => x.id === w.id)) before.Work.push(w);
            await closure(env, a, v, before);
          }
        }
        next = editEntity(
          before,
          arg.table,
          arg.id,
          arg.revision,
          arg.patch,
          at,
        );
        if (
          arg.table === "Vehicles" &&
          (!next.Vehicles[0].manufacturer.trim() ||
            !next.Vehicles[0].model.trim())
        )
          problem(400, "Hersteller und Modell bitte angeben.");
        break;
      case "commit": {
        for (const u of before.Uploads) {
          const o = await objectRecord(env, a.owner, u.sha256);
          if (
            o?.status !== "ready" ||
            o.role !== "original" ||
            o.size !== u.size
          )
            problem(409, "Bestätigtes Original fehlt.");
        }
        const output = commitImport(before, arg, at);
        next = output.state;
        reply.result = output.result;
        break;
      }
      case "odometer":
        next.Odometer.push({
          ...meta(arg.id, at, id),
          date: arg.date,
          km: arg.km,
          confirmed: true,
          note: arg.note ?? null,
        });
        validateState(next);
        break;
      case "completeReminder": {
        const r =
          next.Reminders.find((x) => x.id === arg.id) ??
          problem(404, "Termin fehlt.");
        if (r.completed_work_id !== arg.work_id && r.revision !== arg.revision)
          problem(409, "Konflikt: Termin geändert.");
        completeReminder(next, arg.id, arg.work_id, at);
        validateState(next);
        break;
      }
      case "attachDocument": {
        const d =
            next.Documents.find((x) => x.id === arg.id) ??
            problem(404, "Dokument fehlt."),
          u =
            next.Uploads.find((x) => x.id === arg.upload_id) ??
            problem(404, "Upload fehlt.");
        if (d.revision !== arg.revision || !d.missing)
          problem(409, "Konflikt: Dokument geändert.");
        const o = await objectRecord(env, a.owner, u.sha256);
        if (o?.status !== "ready" || o.size !== u.size)
          problem(409, "Original fehlt.");
        Object.assign(d, {
          drive_id: u.drive_id,
          sha256: u.sha256,
          size: u.size,
          mime: u.mime,
          source_filename: u.source_filename,
          missing: false,
          revision: d.revision + 1,
          updated_at: at,
        });
        break;
      }
      case "smoke":
        next.AuditLog.push({
          ...meta(operation, at, id),
          entity_id: id,
          action: "connection-probe",
          before: null,
          after: { verified: true },
        });
        break;
      default:
        problem(400, "Aktion nicht unterstützt.");
    }
    for (const t of tables) for (const r of next[t]) r.vehicle_id = id;
    const delta = changedRows(before, next);
    reply.changes = delta.changes;
    reply.removed = delta.removed;
    for (const [kind, values] of Object.entries(delta.changes))
      for (const row of values)
        commands.push(entityInsert(env, a, v, kind as Table, row));
    for (const [kind, ids] of Object.entries(delta.removed))
      commands.push(
        db
          .prepare(
            "DELETE FROM fleet_entities WHERE owner=? AND vehicle=? AND generation=? AND kind=? AND id IN (SELECT value FROM json_each(?))",
          )
          .bind(a.owner, id, v.generation, kind, JSON.stringify(ids)),
      );
    if (canonical(before.Vehicles) !== canonical(next.Vehicles)) {
      reply.vehicle = {
        ...asSummary(v),
        vehicle: next.Vehicles[0],
        revision: reply.revision,
      };
      commands.push(
        db
          .prepare(
            "UPDATE fleet_vehicles SET payload=? WHERE owner=? AND fleet_generation=? AND id=?",
          )
          .bind(JSON.stringify(next.Vehicles[0]), a.owner, a.generation, id),
      );
    }
    if (arg.table === "Settings") {
      commands.push(
        db
          .prepare(
            "UPDATE fleet_vehicles SET preferences=? WHERE owner=? AND fleet_generation=? AND id=?",
          )
          .bind(
            JSON.stringify({
              hidden_categories: next.Settings[0].hidden_categories,
            }),
            a.owner,
            a.generation,
            id,
          ),
      );
      reply.changes.Settings = [{ ...next.Settings[0], revision: a.revision }];
    }
  }
  commands.push(
    db
      .prepare(
        "UPDATE fleet_vehicles SET revision=revision+1 WHERE owner=? AND fleet_generation=? AND id=?",
      )
      .bind(a.owner, a.generation, id),
  );
  return transact(
    env,
    a,
    v,
    arg.expected_revision,
    operation,
    prior.fingerprint,
    reply,
    commands,
  );
}
