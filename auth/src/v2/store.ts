import { emptyState, tables, validateState } from "../../../shared/logic";
import type { State, Table } from "../../../shared/types";
import { problem, storage, type Account, type V2Env } from "./types";
export async function account(env: V2Env, owner: string) {
  return storage(env)
    .db.prepare("SELECT * FROM record_accounts WHERE owner=?")
    .bind(owner)
    .first<Account>();
}
export async function createAccount(env: V2Env, owner: string, email: string) {
  await storage(env)
    .db.prepare(
      "INSERT OR IGNORE INTO record_accounts(owner,email,generation,next_run) VALUES(?,?,?,?)",
    )
    .bind(owner, email, crypto.randomUUID(), Date.now() + 86400000)
    .run();
  return (await account(env, owner))!;
}
export async function readState(
  env: V2Env,
  owner: string,
  generation?: string,
) {
  const { db } = storage(env),
    rows = await db
      .prepare(
        "SELECT a.*,e.kind,e.payload FROM record_accounts a LEFT JOIN record_entities e ON e.owner=a.owner AND e.generation=COALESCE(?,a.generation) WHERE a.owner=?",
      )
      .bind(generation ?? null, owner)
      .all<Account & { kind: Table | null; payload: string | null }>();
  if (!rows.results.length) problem(404, "Konto fehlt.");
  const a = rows.results[0];
  if (a.disabled) problem(403, "Dieses Konto ist gesperrt.");
  const state = {
    schema_version: 1,
    ...Object.fromEntries(tables.map((t) => [t, []])),
  } as State;
  for (const row of rows.results)
    if (row.kind && row.payload) {
      if (!tables.includes(row.kind)) problem(500, "Ungültiger Datensatztyp.");
      (state[row.kind] as any[]).push(JSON.parse(row.payload));
    }
  if (!rows.results.some((row) => row.kind))
    return { state: emptyState(), account: a };
  validateState(state);
  return { state, account: a };
}
export async function objectRecord(env: V2Env, owner: string, id: string) {
  return storage(env)
    .db.prepare("SELECT * FROM record_objects WHERE owner=? AND id=?")
    .bind(owner, id)
    .first<import("./types").StoredObject>();
}
