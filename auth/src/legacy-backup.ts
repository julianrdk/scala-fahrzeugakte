import { canonical, hash } from "../../shared/logic";
import type { State } from "../../shared/types";
import { putObject } from "./v2/files";
import { objectRecord } from "./v2/store";
import { problem, storage, type Account, type V2Env } from "./v2/types";
export async function backup(env: V2Env, a: Account, state: State) {
  const { db } = storage(env),
    objects = (
      await db
        .prepare(
          "SELECT * FROM record_objects WHERE owner=? AND status='ready' AND role='original'",
        )
        .bind(a.owner)
        .all<{ id: string; size: number; mime: string }>()
    ).results,
    receipts = new Map(objects.map((o) => [o.id, o]));
  for (const d of state.Documents.filter((d) => d.sha256 && !d.missing)) {
    const o = receipts.get(d.sha256!);
    if (!o || o.size !== d.size || o.mime !== d.mime)
      problem(409, "Bestätigtes Original fehlt; Migration nicht durchgeführt.");
  }
  const id = "before-fleet-" + hash(canonical(state)),
    created =
      (await objectRecord(env, a.owner, id))?.created_at ??
      new Date().toISOString(),
    body = new TextEncoder().encode(
      JSON.stringify({
        format: "vehicle-record-backup",
        schema_version: 1,
        created_at: created,
        state,
      }),
    );
  await putObject(
    env,
    a.owner,
    id,
    body,
    "application/json",
    id + ".json",
    "snapshot",
    created,
  );
  await db
    .prepare("UPDATE record_accounts SET last_backup=? WHERE owner=?")
    .bind(created, a.owner)
    .run();
  return { ok: true };
}
