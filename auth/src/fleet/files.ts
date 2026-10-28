import { meta } from "../../../shared/logic";
import type { Doc } from "../../../shared/types";
import {
  originalUpload,
  putObject,
  readObject,
  uploadParts,
} from "../v2/files";
import { problem, storage, type V2Env } from "../v2/types";
import { rows, vehicle, type FleetAccount } from "./store";

export async function upload(
  env: V2Env,
  a: FleetAccount,
  id: string,
  request: Request,
) {
  const { original, bytes, digest, thumb, operation, restoreId } =
      await uploadParts(request),
    { db } = storage(env);
  if (restoreId) {
    const restore = await db
      .prepare(
        "SELECT * FROM fleet_restores WHERE owner=? AND id=? AND status='staging'",
      )
      .bind(a.owner, restoreId)
      .first<any>();
    if (!restore || (restore.vehicle && restore.vehicle !== id))
      problem(404, "Wiederherstellung gehört nicht zu diesem Fahrzeug.");
    const docs = await db
      .prepare(
        "SELECT e.payload FROM fleet_entities e WHERE e.owner=? AND e.vehicle=? AND e.generation=? AND e.kind='Documents' AND json_extract(e.payload,'$.sha256')=?",
      )
      .bind(a.owner, id, restore.generation, digest)
      .all<{ payload: string }>();
    if (
      !docs.results.length ||
      docs.results.some((r) => {
        const d = JSON.parse(r.payload);
        return d.mime !== original.type || d.size !== bytes.length;
      })
    )
      problem(400, "Original passt nicht zur Wiederherstellung.");
    await putObject(
      env,
      a.owner,
      digest,
      bytes,
      original.type,
      original.name,
      "original",
    );
    if (thumb)
      await putObject(
        env,
        a.owner,
        "thumb-" + digest,
        thumb,
        "image/webp",
        original.name,
        "thumbnail",
      );
    await db
      .prepare(
        "UPDATE fleet_entities SET payload=json_set(payload,'$.drive_id',?,'$.missing',json('false')) WHERE owner=? AND vehicle=? AND generation=? AND kind='Documents' AND json_extract(payload,'$.sha256')=?",
      )
      .bind(digest, a.owner, id, restore.generation, digest)
      .run();
    return { ok: true };
  }
  const v = await vehicle(env, a, id, true),
    object = await putObject(
      env,
      a.owner,
      digest,
      bytes,
      original.type,
      original.name,
      "original",
    );
  if (thumb)
    await putObject(
      env,
      a.owner,
      "thumb-" + digest,
      thumb,
      "image/webp",
      original.name,
      "thumbnail",
    );
  const u = {
    ...originalUpload(object, operation),
    ...meta("upload-" + digest, new Date().toISOString(), id),
  };
  delete (u as any).base64;
  // Upload receipts are immutable and do not change the vehicle revision; failed submits can reuse them.
  await db
    .prepare(
      "INSERT OR IGNORE INTO fleet_entities(owner,vehicle,generation,kind,id,payload) VALUES(?,?,?,'Uploads',?,?)",
    )
    .bind(a.owner, id, v.generation, u.id, JSON.stringify(u))
    .run();
  return u;
}
export async function document(
  env: V2Env,
  a: FleetAccount,
  id: string,
  docId: string,
  thumbnail: boolean,
) {
  const v = await vehicle(env, a, id),
    docs = await rows(env, a, v, "Documents", " AND id=?", [docId]);
  const d = docs[0] as Doc | undefined;
  if (!d || d.missing || !d.sha256)
    problem(
      404,
      "Dokument gehört nicht zu diesem Fahrzeug oder das Original fehlt.",
    );
  const result = await readObject(
    env,
    a.owner,
    thumbnail ? "thumb-" + d.sha256 : d.sha256,
  );
  if (
    !thumbnail &&
    (result.record.size !== d.size || result.record.mime !== d.mime)
  )
    problem(409, "Originalangaben stimmen nicht.");
  return result;
}
