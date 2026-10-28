import {
  assertFile,
  clone,
  commitImport,
  completeReminder,
  editEntity,
  emptyState,
  fail,
  hashBytes,
  meta,
  validateState,
  verifySignature,
} from "../shared/logic";
import type { State, UploadFile } from "../shared/types";
import { addVehicle } from "../shared/vehicle";
export type Config = {
  origin: string;
  backend: "cloudflare";
  apiOrigin: string;
  clerkPublishableKey: string;
};
export interface Adapter {
  kind: "cloudflare" | "test";
  thumbnail?: (doc: import("../shared/types").Doc) => Promise<Blob>;
  accountEmail?: string;
  accountId?: string;
  call<T = any>(action: string, arg?: any): Promise<T>;
}
export class SignInRequired extends Error {}
const DB_NAME = "scala-explicit-test-v1";
function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("store");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function readDB(key: string) {
  const d = await db();
  try {
    return await new Promise<any>((resolve, reject) => {
      const r = d.transaction("store").objectStore("store").get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    d.close();
  }
}
async function writeDB(entries: [string, any][]) {
  const d = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction("store", "readwrite");
      for (const [k, v] of entries) t.objectStore("store").put(v, k);
      t.oncomplete = () => resolve();
      t.onabort = () => reject(t.error);
      t.onerror = () => reject(t.error);
    });
  } finally {
    d.close();
  }
}
export class TestAdapter implements Adapter {
  kind = "test" as const;
  async call<T = any>(action: string, arg: any = {}): Promise<T> {
    return navigator.locks.request("scala-test-store", async () => {
      let s: State = (await readDB("state")) ?? emptyState();
      let result: any;
      const at = new Date().toISOString();
      switch (action) {
        case "createVehicle":
          s = addVehicle(s, arg, at);
          result = { ok: true };
          break;
        case "read":
          return {
            state: s,
            status: {
              features: { capture: 1, gallery: 1 },
              last_check: null,
              last_backup: null,
              last_error: null,
              remaining_mail_quota: null,
              trigger_installed: false,
            },
          } as T;
        case "upload": {
          const f = arg.file as UploadFile;
          assertFile(f);
          const bytes = base64Bytes(f.base64);
          if (bytes.length !== f.size || hashBytes(bytes) !== f.sha256)
            fail("Prüfsumme stimmt nicht.");
          verifySignature(bytes, f.mime);
          let u = s.Uploads.find((u) => u.sha256 === f.sha256);
          if (!u) {
            u = {
              ...meta("upload-" + f.sha256, at),
              operation_id: arg.operation_id,
              sha256: f.sha256,
              size: f.size,
              mime: f.mime,
              source_filename: f.source_filename,
              drive_id: "test-" + f.sha256,
            };
            s.Uploads.push(u);
          }
          await writeDB([["file:" + u.drive_id, f]]);
          result = u;
          break;
        }
        case "commit": {
          const output = commitImport(s, arg, at);
          s = output.state;
          result = output.result;
          break;
        }
        case "edit":
          s = editEntity(s, arg.table, arg.id, arg.revision, arg.patch, at);
          result = { ok: true };
          break;
        case "attachDocument": {
          const d =
            s.Documents.find((x) => x.id === arg.id) ?? fail("Dokument fehlt.");
          if (d.revision !== arg.revision) fail("Konflikt: Dokument geändert.");
          if (!d.missing) fail("Original ist schon vorhanden.");
          const u =
            s.Uploads.find((x) => x.id === arg.upload_id) ??
            fail("Upload fehlt.");
          Object.assign(d, {
            sha256: u.sha256,
            size: u.size,
            mime: u.mime,
            drive_id: u.drive_id,
            source_filename: u.source_filename,
            missing: false,
            revision: d.revision + 1,
            updated_at: at,
          });
          result = { ok: true };
          break;
        }
        case "document": {
          const doc =
            s.Documents.find((d) => d.id === arg.id) ?? fail("Datei fehlt.");
          return (await readDB("file:" + doc.drive_id)) as T;
        }
        case "odometer": {
          if (!s.Odometer.some((x) => x.id === arg.id))
            s.Odometer.push({
              ...meta(arg.id, at),
              date: arg.date,
              km: arg.km,
              confirmed: true,
              note: arg.note ?? null,
            });
          validateState(s);
          result = { ok: true };
          break;
        }
        case "completeReminder": {
          const r =
            s.Reminders.find((x) => x.id === arg.id) ??
            fail("Erinnerung fehlt.");
          if (
            r.completed_work_id !== arg.work_id &&
            r.revision !== arg.revision
          )
            fail("Konflikt: Erinnerung geändert.");
          completeReminder(s, arg.id, arg.work_id, at);
          validateState(s);
          result = { ok: true };
          break;
        }
        case "smoke":
          return {
            ok: true,
            identity: "Lokaler Testadapter. Keine Server-Verbindung.",
          } as T;
        case "backup":
          await writeDB([["backup:" + at, clone(s)]]);
          return { ok: true, local: true } as T;
        case "restoreStart": {
          validateState(arg.state);
          const id = crypto.randomUUID();
          const state = clone(arg.state) as State;
          state.Uploads = [];
          state.Documents.forEach((d) => {
            d.drive_id = null;
            d.missing = true;
          });
          await writeDB([["restore:" + id, state]]);
          return {
            id,
            sheet: "Neue lokale Testakte",
            folder: "Separater Testdateispeicher",
          } as T;
        }
        case "restoreUpload": {
          const state = (await readDB("restore:" + arg.restore_id)) as State;
          const f = arg.file as UploadFile;
          assertFile(f);
          const bytes = base64Bytes(f.base64);
          if (hashBytes(bytes) !== f.sha256 || bytes.length !== f.size)
            fail("Wiederherstellung: Prüfsumme fehlerhaft.");
          verifySignature(bytes, f.mime);
          for (const doc of state.Documents.filter(
            (d) => d.sha256 === f.sha256,
          )) {
            doc.drive_id = "restore-" + arg.restore_id + "-" + f.sha256;
            doc.missing = false;
            doc.mime = f.mime;
            doc.size = f.size;
            await writeDB([["file:" + doc.drive_id, f]]);
          }
          await writeDB([["restore:" + arg.restore_id, state]]);
          return { ok: true } as T;
        }
        case "restorePreview": {
          const state = (await readDB("restore:" + arg.id)) as State;
          return {
            state,
            missing: state.Documents.filter((d) => d.sha256 && d.missing).map(
              (d) => d.title,
            ),
          } as T;
        }
        case "restoreSwitch": {
          if (arg.confirm !== true) fail("Bestätigung fehlt.");
          const next = (await readDB("restore:" + arg.id)) as State;
          validateState(next);
          if (next.Documents.some((d) => d.sha256 && d.missing))
            fail("Dateien fehlen.");
          await writeDB([["prior-state:" + at, s]]);
          s = next;
          result = { ok: true };
          break;
        }
        case "orphanFiles":
          return s.Uploads.filter(
            (u) => !s.Documents.some((d) => d.drive_id === u.drive_id),
          ) as T;
        case "testMail":
          fail("Im Testmodus werden keine E-Mails versendet.");
        default:
          fail("Aktion im Testadapter unbekannt.");
      }
      await writeDB([["state", s]]);
      return result as T;
    });
  }
}
export function base64Bytes(s: string) {
  const native = Uint8Array as typeof Uint8Array & {
    fromBase64?: (text: string) => Uint8Array<ArrayBuffer>;
  };
  if (native.fromBase64) return native.fromBase64(s);
  const text = atob(s),
    bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
export function bytesBase64(b: Uint8Array) {
  const native = b as Uint8Array & { toBase64?: () => string };
  if (native.toBase64) return native.toBase64();
  let s = "";
  for (let i = 0; i < b.length; i += 8192)
    s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
}
export async function prepareFile(file: File): Promise<UploadFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = {
    source_filename: file.name,
    mime: file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : ""),
    size: file.size,
    sha256: hashBytes(bytes),
    base64: bytesBase64(bytes),
  };
  assertFile(result);
  verifySignature(bytes, result.mime);
  return result;
}
