import { dueStatus } from "../../../shared/logic";
import { putObject } from "../v2/files";
import { verifiedUser } from "../v2/identity";
import { problem, storage, type V2Env } from "../v2/types";
import { fleetAccount, now, vehicles, type FleetAccount } from "./store";
import { nextRun } from "./time";

async function send(
  env: V2Env,
  to: string,
  subject: string,
  text: string,
  key: string,
) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM)
    problem(503, "E-Mail-Versand fehlt.");
  const day = new Date().toISOString().slice(0, 10),
    db = storage(env).db;
  const reserved = await db
    .prepare(
      "INSERT OR IGNORE INTO fleet_mail_budget(day,id) SELECT ?,? WHERE (SELECT COUNT(*) FROM fleet_mail_budget WHERE day=?)<95 RETURNING id",
    )
    .bind(day, key, day)
    .first();
  if (
    !reserved &&
    !(await db
      .prepare("SELECT id FROM fleet_mail_budget WHERE day=? AND id=?")
      .bind(day, key)
      .first())
  )
    problem(429, "Tägliches Versandkontingent dieser App erreicht.");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    redirect: "manual",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
  });
  if (!r.ok) problem(503, "Versand nicht bestätigt.");
  const body = (await r.json()) as { id?: string };
  if (!body.id) problem(503, "Versandbestätigung fehlt.");
}
function operationId(value: string) {
  if (!/^[\w-]{8,100}$/.test(value))
    problem(400, "Vorgangskennung fehlt oder ist ungültig.");
  return value;
}
export async function testMail(
  env: V2Env,
  a: FleetAccount,
  confirm: boolean,
  operation: string = crypto.randomUUID(),
) {
  if (!confirm) problem(400, "Testmail bitte bestätigen.");
  operationId(operation);
  const { db } = storage(env),
    id = "test-" + operation,
    at = Date.now();
  let mail = await db
    .prepare("SELECT * FROM fleet_mail_runs WHERE owner=? AND run_id=?")
    .bind(a.owner, id)
    .first<any>();
  if (!mail) {
    const recipient = await verifiedUser(env, a.owner),
      body =
        "Diese Testmail wurde ausdrücklich angefordert.\n" + env.APP_ORIGIN;
    mail = await db
      .prepare(
        "INSERT OR IGNORE INTO fleet_mail_runs(owner,run_id,recipient,body,status,created_at) SELECT ?,?,?,?,'sending',? WHERE (SELECT COUNT(*) FROM fleet_mail_runs WHERE owner=? AND substr(run_id,1,5)='test-' AND created_at>?)<3 RETURNING *",
      )
      .bind(a.owner, id, recipient, body, at, a.owner, at - 3600000)
      .first<any>();
    if (!mail)
      mail = await db
        .prepare("SELECT * FROM fleet_mail_runs WHERE owner=? AND run_id=?")
        .bind(a.owner, id)
        .first<any>();
    if (!mail) problem(429, "Maximal drei Testmails pro Stunde.");
  }
  if (mail.status === "sent") return { ok: true };
  if (at - mail.created_at > 23 * 3600000)
    problem(409, "Versandausgang unklar. Bitte Resend-Protokoll prüfen.");
  await send(
    env,
    mail.recipient,
    "Fahrzeugakte · Testmail",
    mail.body,
    "test-" + a.owner + "-" + operation,
  );
  await db
    .prepare(
      "UPDATE fleet_mail_runs SET status='sent' WHERE owner=? AND run_id=?",
    )
    .bind(a.owner, id)
    .run();
  return { ok: true };
}
export async function requestBackup(
  env: V2Env,
  a: FleetAccount,
  operation: string = crypto.randomUUID(),
) {
  operationId(operation);
  const { db } = storage(env);
  if (
    await db
      .prepare(
        "SELECT operation FROM fleet_backup_requests WHERE owner=? AND operation=?",
      )
      .bind(a.owner, operation)
      .first()
  )
    return { ok: true, queued: true };
  try {
    await db.batch([
      db
        .prepare(
          "INSERT OR IGNORE INTO fleet_backup_requests(owner,operation,created_at) VALUES(?,?,?)",
        )
        .bind(a.owner, operation, now()),
      db
        .prepare(
          "UPDATE fleet_jobs SET phase='snapshot',cursor=?,run_date=?,next_run=?,last_error=NULL WHERE owner=? AND phase='idle'",
        )
        .bind(
          JSON.stringify({ index: 0, after: "", ordinal: 0, manual: true }),
          crypto.randomUUID(),
          Date.now(),
          a.owner,
        ),
    ]);
  } catch (error) {
    if (String(error).includes("BACKUP_BUSY"))
      problem(409, "Eine Tagesprüfung oder Sicherung läuft bereits.");
    throw error;
  }
  return { ok: true, queued: true };
}

async function reminderStep(
  env: V2Env,
  a: FleetAccount,
  job: any,
  cursor: any,
) {
  const { db } = storage(env),
    selected = await db
      .prepare(
        "SELECT e.vehicle,e.payload,v.payload AS vehicle_payload,(SELECT json_extract(o.payload,'$.km') FROM fleet_entities o WHERE o.owner=e.owner AND o.vehicle=e.vehicle AND o.generation=e.generation AND o.kind='Odometer' AND json_extract(o.payload,'$.confirmed')=1 ORDER BY json_extract(o.payload,'$.date') DESC,id DESC LIMIT 1) AS km FROM fleet_entities e JOIN fleet_vehicles v ON v.owner=e.owner AND v.id=e.vehicle AND v.generation=e.generation AND v.fleet_generation=? WHERE e.owner=? AND e.kind='Reminders' AND json_extract(v.payload,'$.archived')=0 AND (e.vehicle>? OR (e.vehicle=? AND e.id>?)) ORDER BY e.vehicle,e.id LIMIT 50",
      )
      .bind(
        a.generation,
        a.owner,
        cursor.vehicle ?? "",
        cursor.vehicle ?? "",
        cursor.after ?? "",
      )
      .all<any>();
  const commands = [],
    vs = await vehicles(env, a);
  for (const row of selected.results) {
    const r = JSON.parse(row.payload),
      state = dueStatus(r, job.run_date.slice(0, 10), row.km),
      key = r.id + ":" + r.due_date + ":" + r.due_odometer_km + ":" + state;
    if (
      !JSON.parse(a.settings).email_enabled ||
      !r.email_enabled ||
      r.archived ||
      r.voided ||
      !["due", "soon"].includes(state)
    )
      continue;
    const title = JSON.parse(row.vehicle_payload);
    const line =
      [title.manufacturer, title.model].filter(Boolean).join(" ") +
      ": " +
      r.title +
      " · " +
      (r.due_date ?? "") +
      (r.due_odometer_km !== null ? " · " + r.due_odometer_km + " km" : "");
    commands.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO fleet_outbox(owner,run_id,vehicle,rule_key,payload) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM fleet_outbox WHERE owner=? AND vehicle=? AND rule_key=? AND status IN ('sent','sending','uncertain')) AND NOT EXISTS(SELECT 1 FROM fleet_entities WHERE owner=? AND vehicle=? AND generation=? AND kind='NotificationLog' AND json_extract(payload,'$.key')=? AND json_extract(payload,'$.status') IN ('sent','sending','uncertain'))",
        )
        .bind(
          a.owner,
          job.run_date,
          row.vehicle,
          key,
          JSON.stringify({ title: line, key }),
          a.owner,
          row.vehicle,
          key,
          a.owner,
          row.vehicle,
          vs.find((v) => v.id === row.vehicle)!.generation,
          key,
        ),
    );
  }
  const last = selected.results.at(-1),
    next =
      selected.results.length === 50
        ? { vehicle: last.vehicle, after: JSON.parse(last.payload).id }
        : {};
  commands.push(
    db
      .prepare(
        "UPDATE fleet_jobs SET phase=?,cursor=?,next_run=?,lease_until=0 WHERE owner=?",
      )
      .bind(
        selected.results.length === 50 ? "reminders" : "send",
        JSON.stringify(next),
        Date.now(),
        a.owner,
      ),
  );
  await db.batch(commands);
}
async function mailStep(env: V2Env, a: FleetAccount, job: any) {
  const { db } = storage(env);
  let mail = await db
    .prepare("SELECT * FROM fleet_mail_runs WHERE owner=? AND run_id=?")
    .bind(a.owner, job.run_date)
    .first<any>();
  const pending = await db
    .prepare(
      "SELECT payload FROM fleet_outbox WHERE owner=? AND run_id=? ORDER BY vehicle,rule_key LIMIT 201",
    )
    .bind(a.owner, job.run_date)
    .all<{ payload: string }>();
  if (pending.results.length && mail?.status !== "sent") {
    if (!mail) {
      const text =
        pending.results
          .slice(0, 200)
          .map((r) => JSON.parse(r.payload).title)
          .join("\n") +
        (pending.results.length > 200
          ? "\nWeitere Termine in der Fahrzeugakte."
          : "") +
        "\n\n" +
        env.APP_ORIGIN;
      await db.batch([
        db
          .prepare(
            "INSERT INTO fleet_mail_runs(owner,run_id,recipient,body,status,created_at) VALUES(?,?,?,?,'sending',?)",
          )
          .bind(
            a.owner,
            job.run_date,
            await verifiedUser(env, a.owner),
            text,
            Date.now(),
          ),
        db
          .prepare(
            "UPDATE fleet_outbox SET status='sending' WHERE owner=? AND run_id=?",
          )
          .bind(a.owner, job.run_date),
      ]);
      mail = await db
        .prepare("SELECT * FROM fleet_mail_runs WHERE owner=? AND run_id=?")
        .bind(a.owner, job.run_date)
        .first<any>();
    }
    if (Date.now() - mail.created_at > 23 * 3600000) {
      await db
        .prepare(
          "UPDATE fleet_outbox SET status='uncertain' WHERE owner=? AND run_id=?",
        )
        .bind(a.owner, job.run_date)
        .run();
      problem(409, "Versandausgang unklar. Bitte Resend-Protokoll prüfen.");
    }
    await send(
      env,
      mail.recipient,
      "Fahrzeugakte · Wartung",
      mail.body,
      "daily-" + a.owner + "-" + job.run_date,
    );
    await db.batch([
      db
        .prepare(
          "UPDATE fleet_mail_runs SET status='sent' WHERE owner=? AND run_id=?",
        )
        .bind(a.owner, job.run_date),
      db
        .prepare(
          "UPDATE fleet_outbox SET status='sent' WHERE owner=? AND run_id=?",
        )
        .bind(a.owner, job.run_date),
    ]);
    await db
      .prepare(
        "INSERT OR IGNORE INTO fleet_entities(owner,vehicle,generation,kind,id,payload) SELECT o.owner,o.vehicle,v.generation,'NotificationLog','notification-'||o.rowid,json_object('id','notification-'||o.rowid,'vehicle_id',o.vehicle,'revision',1,'created_at',?,'updated_at',?,'archived',json('false'),'voided',json('false'),'key',o.rule_key,'status','sent','message',json_extract(o.payload,'$.title')) FROM fleet_outbox o JOIN fleet_vehicles v ON v.owner=o.owner AND v.id=o.vehicle AND v.fleet_generation=? WHERE o.owner=? AND o.run_id=?",
      )
      .bind(now(), now(), a.generation, a.owner, job.run_date)
      .run();
  }
  await db
    .prepare(
      "UPDATE fleet_jobs SET phase='snapshot',cursor=?,next_run=?,lease_until=0 WHERE owner=?",
    )
    .bind(
      JSON.stringify({ index: 0, after: "", ordinal: 0 }),
      Date.now(),
      a.owner,
    )
    .run();
}
async function backupStep(env: V2Env, a: FleetAccount, job: any, cursor: any) {
  const { db } = storage(env),
    vs = await vehicles(env, a),
    v = vs[cursor.index ?? 0];
  if (!cursor.heads) {
    cursor = {
      ...cursor,
      heads: Object.fromEntries(
        vs.map((v) => [
          v.id,
          { revision: v.revision, generation: v.generation },
        ]),
      ),
      settingsRevision: a.revision,
      backupId: job.run_date + "-" + crypto.randomUUID(),
      createdAt: now(),
    };
    await db
      .prepare("UPDATE fleet_jobs SET cursor=? WHERE owner=?")
      .bind(JSON.stringify(cursor), a.owner)
      .run();
  }
  if (
    cursor.settingsRevision !== a.revision ||
    vs.length !== Object.keys(cursor.heads).length ||
    vs.some(
      (v) =>
        cursor.heads[v.id]?.revision !== v.revision ||
        cursor.heads[v.id]?.generation !== v.generation,
    )
  )
    problem(
      409,
      "Fahrzeug während Sicherung geändert; Sicherung erneut anfordern.",
    );
  const backupId = cursor.backupId;
  if (!v) {
    const chunks = await db
      .prepare(
        "SELECT vehicle,ordinal,object_id FROM fleet_backup_chunks WHERE owner=? AND run_id=? ORDER BY vehicle,ordinal",
      )
      .bind(a.owner, backupId)
      .all();
    const id = "snapshot-manifest-" + backupId,
      manifest = {
        format: "vehicle-account-snapshot",
        schema_version: 2,
        created_at: cursor.createdAt,
        settings: JSON.parse(a.settings),
        vehicles: vs.map((v) => ({
          id: v.id,
          vehicle: JSON.parse(v.payload),
          generation: v.generation,
          revision: v.revision,
          preferences: JSON.parse(v.preferences),
        })),
        chunks: chunks.results,
      };
    await putObject(
      env,
      a.owner,
      id,
      new TextEncoder().encode(JSON.stringify(manifest)),
      "application/json",
      id + ".json",
      "snapshot",
    );
    await db
      .prepare(
        "INSERT OR IGNORE INTO fleet_backup_runs(owner,run_id,object_id,created_at) VALUES(?,?,?,?)",
      )
      .bind(a.owner, backupId, id, manifest.created_at)
      .run();
    await db
      .prepare(
        "UPDATE fleet_jobs SET phase='retention',cursor=?,next_run=?,lease_until=0 WHERE owner=?",
      )
      .bind(
        JSON.stringify({ backupId, createdAt: manifest.created_at }),
        Date.now(),
        a.owner,
      )
      .run();
    return;
  }
  const selected = await db
    .prepare(
      "SELECT kind,id,payload,kind||char(9)||id AS cursor FROM fleet_entities WHERE owner=? AND vehicle=? AND generation=? AND kind||char(9)||id>? ORDER BY kind,id LIMIT 25",
    )
    .bind(a.owner, v.id, v.generation, cursor.after ?? "")
    .all<any>();
  // Snapshot chunks pin the exact generation and vehicle revision. Retry/restart on concurrent edits.
  if (
    cursor.revision !== undefined &&
    (cursor.revision !== v.revision || cursor.generation !== v.generation)
  )
    problem(
      409,
      "Fahrzeug während Sicherung geändert; Sicherung erneut anfordern.",
    );
  for (const row of selected.results.filter((r) => r.kind === "Documents")) {
    const d = JSON.parse(row.payload);
    if (d.sha256 && !d.missing) {
      const o = await db
        .prepare(
          "SELECT size,mime FROM record_objects WHERE owner=? AND id=? AND status='ready'",
        )
        .bind(a.owner, d.sha256)
        .first<any>();
      if (!o || o.size !== d.size || o.mime !== d.mime)
        problem(409, "Originalnachweis für Sicherung fehlt.");
    }
  }
  if (selected.results.length) {
    const id =
      "snapshot-chunk-" + backupId + "-" + v.id + "-" + (cursor.ordinal ?? 0);
    await putObject(
      env,
      a.owner,
      id,
      new TextEncoder().encode(
        JSON.stringify(
          selected.results.map((r) => ({
            kind: r.kind,
            payload: JSON.parse(r.payload),
          })),
        ),
      ),
      "application/json",
      id + ".json",
      "snapshot",
    );
    await db
      .prepare(
        "INSERT OR IGNORE INTO fleet_backup_chunks(owner,run_id,vehicle,ordinal,object_id) VALUES(?,?,?,?,?)",
      )
      .bind(a.owner, backupId, v.id, cursor.ordinal ?? 0, id)
      .run();
  }
  const next =
    selected.results.length === 25
      ? {
          ...cursor,
          after: selected.results.at(-1).cursor,
          ordinal: (cursor.ordinal ?? 0) + 1,
          revision: v.revision,
          generation: v.generation,
        }
      : {
          ...cursor,
          index: (cursor.index ?? 0) + 1,
          after: "",
          ordinal: 0,
          revision: undefined,
          generation: undefined,
        };
  await db
    .prepare(
      "UPDATE fleet_jobs SET cursor=?,next_run=?,lease_until=0 WHERE owner=?",
    )
    .bind(JSON.stringify(next), Date.now(), a.owner)
    .run();
}
async function retentionStep(env: V2Env, a: FleetAccount, cursor: any) {
  const { db, files } = storage(env),
    old = await db
      .prepare(
        "SELECT run_id,object_id FROM fleet_backup_runs WHERE owner=? ORDER BY created_at DESC,run_id DESC LIMIT 1 OFFSET ?",
      )
      .bind(a.owner, JSON.parse(a.settings).backup_retention)
      .first<{ run_id: string; object_id: string }>();
  if (!old) {
    await db
      .prepare(
        "UPDATE fleet_jobs SET phase='idle',cursor=NULL,next_run=?,lease_until=0,last_run=?,last_backup=?,last_error=NULL,attempts=0 WHERE owner=?",
      )
      .bind(nextRun(Date.now()), Date.now(), cursor.createdAt, a.owner)
      .run();
    return;
  }
  const chunks = await db
      .prepare(
        "SELECT object_id FROM fleet_backup_chunks WHERE owner=? AND run_id=? LIMIT 25",
      )
      .bind(a.owner, old.run_id)
      .all<{ object_id: string }>(),
    complete = chunks.results.length < 25,
    ids = [
      ...chunks.results.map((c) => c.object_id),
      ...(complete ? [old.object_id] : []),
    ];
  const objects = await db
    .prepare(
      "SELECT object_key FROM record_objects WHERE owner=? AND role='snapshot' AND id IN (SELECT value FROM json_each(?))",
    )
    .bind(a.owner, JSON.stringify(ids))
    .all<{ object_key: string }>();
  if (objects.results.length)
    await files.delete(objects.results.map((o) => o.object_key));
  const commands = [
    db
      .prepare(
        "DELETE FROM record_objects WHERE owner=? AND role='snapshot' AND id IN (SELECT value FROM json_each(?))",
      )
      .bind(a.owner, JSON.stringify(ids)),
    db
      .prepare(
        "DELETE FROM fleet_backup_chunks WHERE owner=? AND run_id=? AND object_id IN (SELECT value FROM json_each(?))",
      )
      .bind(a.owner, old.run_id, JSON.stringify(ids)),
    db
      .prepare("UPDATE fleet_jobs SET next_run=?,lease_until=0 WHERE owner=?")
      .bind(Date.now(), a.owner),
  ];
  if (complete)
    commands.push(
      db
        .prepare("DELETE FROM fleet_backup_runs WHERE owner=? AND run_id=?")
        .bind(a.owner, old.run_id),
    );
  await db.batch(commands);
}
async function cleanupStep(env: V2Env, a: FleetAccount, cursor: any) {
  const { db, files } = storage(env),
    id = cursor.backupId;
  if (
    typeof id !== "string" ||
    (await db
      .prepare(
        "SELECT run_id FROM fleet_backup_runs WHERE owner=? AND run_id=?",
      )
      .bind(a.owner, id)
      .first())
  )
    problem(409, "Sicherung ist bestätigt und darf nicht verworfen werden.");
  const objects = await db
    .prepare(
      "SELECT id,object_key FROM record_objects WHERE owner=? AND role='snapshot' AND (id=? OR substr(id,1,?)=?) LIMIT 25",
    )
    .bind(
      a.owner,
      "snapshot-manifest-" + id,
      ("snapshot-chunk-" + id + "-").length,
      "snapshot-chunk-" + id + "-",
    )
    .all<{ id: string; object_key: string }>();
  if (objects.results.length) {
    await files.delete(objects.results.map((o) => o.object_key));
    await db.batch([
      db
        .prepare(
          "DELETE FROM record_objects WHERE owner=? AND id IN (SELECT value FROM json_each(?))",
        )
        .bind(a.owner, JSON.stringify(objects.results.map((o) => o.id))),
      db
        .prepare(
          "DELETE FROM fleet_backup_chunks WHERE owner=? AND run_id=? AND object_id IN (SELECT value FROM json_each(?))",
        )
        .bind(a.owner, id, JSON.stringify(objects.results.map((o) => o.id))),
    ]);
  }
  await db
    .prepare(
      "UPDATE fleet_jobs SET phase=?,cursor=?,next_run=?,lease_until=0 WHERE owner=?",
    )
    .bind(
      objects.results.length === 25 ? "cleanup" : "idle",
      objects.results.length === 25 ? JSON.stringify(cursor) : null,
      Date.now() + (objects.results.length === 25 ? 0 : 3600000),
      a.owner,
    )
    .run();
}
export async function daily(env: V2Env) {
  if (env.AUTOMATION_ENABLED !== "true")
    return { processed: 0, ok: true, paused: true };
  const { db } = storage(env),
    at = Date.now(),
    job = await db
      .prepare(
        "UPDATE fleet_jobs SET lease_until=? WHERE owner=(SELECT j.owner FROM fleet_jobs j JOIN record_accounts a ON a.owner=j.owner WHERE a.disabled=0 AND j.next_run<=? AND j.lease_until<? ORDER BY j.next_run LIMIT 1) RETURNING *",
      )
      .bind(at + 55000, at, at)
      .first<any>();
  if (!job) return { processed: 0, ok: true };
  try {
    const a = await fleetAccount(env, job.owner);
    if (!a) problem(503, "Konto-Migration fehlt.");
    if (job.phase === "idle") {
      await db
        .prepare(
          "UPDATE fleet_jobs SET phase='reminders',run_date=?,cursor='{}',next_run=?,lease_until=0 WHERE owner=?",
        )
        .bind(
          new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Europe/Berlin",
          }).format(at),
          at,
          a.owner,
        )
        .run();
    } else if (job.phase === "reminders")
      await reminderStep(env, a, job, JSON.parse(job.cursor ?? "{}"));
    else if (job.phase === "send") await mailStep(env, a, job);
    else if (job.phase === "snapshot")
      await backupStep(env, a, job, JSON.parse(job.cursor ?? "{}"));
    else if (job.phase === "retention")
      await retentionStep(env, a, JSON.parse(job.cursor ?? "{}"));
    else if (job.phase === "cleanup")
      await cleanupStep(env, a, JSON.parse(job.cursor ?? "{}"));
    else problem(503, "Unbekannter Prüfschritt.");
    return { processed: 1, ok: true };
  } catch (error) {
    const message =
      error instanceof Error && /Sicherung|Versandausgang/.test(error.message)
        ? error.message
        : "Tagesprüfung fehlgeschlagen. Protokoll prüfen; erneuter Versuch in einer Stunde.";
    const conflict = (error as any)?.status === 409,
      cleanup =
        conflict &&
        job.phase === "snapshot" &&
        JSON.parse(job.cursor ?? "{}").backupId;
    await db
      .prepare(
        "UPDATE fleet_jobs SET lease_until=0,next_run=?,last_error=?,attempts=attempts+1,phase=CASE WHEN ? THEN 'cleanup' WHEN ? THEN 'idle' ELSE phase END,cursor=CASE WHEN ? THEN NULL ELSE cursor END WHERE owner=?",
      )
      .bind(
        at + 3600000,
        message,
        cleanup ? 1 : 0,
        conflict ? 1 : 0,
        conflict && !cleanup ? 1 : 0,
        job.owner,
      )
      .run();
    return { processed: 1, ok: false };
  }
}
