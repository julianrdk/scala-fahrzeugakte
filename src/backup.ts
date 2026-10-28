import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  MAX_FILE,
  canonical,
  csv,
  fail,
  hash,
  hashBytes,
  tables,
  validateState,
} from "../shared/logic";
import type { State, UploadFile } from "../shared/types";
import { type Adapter, base64Bytes, bytesBase64 } from "./adapter";
export function download(
  data: BlobPart,
  name: string,
  type = "application/octet-stream",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
type AccountArchive = {
  format: "vehicle-account-backup";
  schema_version: 2;
  settings: State["Settings"][0];
  vehicles: State[];
};
type ArchiveInput = State | AccountArchive;
const PART_BYTES = 20 * 1024 * 1024,
  ACCOUNT_BYTES = 1000000000;
function states(input: ArchiveInput): State[] {
  return "vehicles" in input ? input.vehicles : [input];
}
function unpack(file: File) {
  return file.arrayBuffer().then((buffer) => {
    let size = 0;
    return unzipSync(new Uint8Array(buffer), {
      filter: (entry) => {
        if (entry.originalSize > 30 * 1024 * 1024)
          fail("Archiveintrag zu groß.");
        if (entry.name.startsWith("files/") && entry.originalSize > MAX_FILE)
          fail("Original im Archiv zu groß.");
        size += entry.originalSize;
        if (size > 180 * 1024 * 1024) fail("Teilarchiv ist entpackt zu groß.");
        return (
          entry.name === "data.json" || /^files\/[a-f0-9]{64}$/.test(entry.name)
        );
      },
    });
  });
}
async function savePart(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Release each part before preparing the next one. Object URLs otherwise retain all ZIPs.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  URL.revokeObjectURL(url);
}
export async function exportArchive(
  adapter: Adapter,
  input: ArchiveInput,
  onProgress: (s: string) => void,
  save = savePart,
) {
  const snapshot = JSON.parse(JSON.stringify(input)) as ArchiveInput;
  for (const s of states(snapshot)) {
    s.Uploads = [];
    validateState(s);
  }
  const docs = [
    ...new Map(
      states(snapshot)
        .flatMap((s) => s.Documents)
        .filter((d) => d.sha256)
        .map((d) => [d.sha256!, d]),
    ).values(),
  ];
  const groups: (typeof docs)[] = [[]];
  let size = 0;
  for (const d of docs) {
    if (size + (d.size ?? 0) > PART_BYTES && groups.at(-1)!.length) {
      groups.push([]);
      size = 0;
    }
    groups.at(-1)!.push(d);
    size += d.size ?? 0;
  }
  const created = new Date().toISOString(),
    archiveId = crypto.randomUUID(),
    stateHash = hash(canonical(snapshot));
  let failed = false;
  for (let i = 0; i < groups.length; i++) {
    const entries: Record<string, Uint8Array> = {},
      missing: string[] = [];
    for (const d of groups[i]) {
      onProgress(`Teil ${i + 1} von ${groups.length}: ${d.title}`);
      if (d.missing) {
        missing.push(d.title);
        continue;
      }
      try {
        const f = await adapter.call<UploadFile>("document", {
            id: d.id,
            vehicle_id: d.vehicle_id,
          }),
          bytes = base64Bytes(f.base64);
        if (hashBytes(bytes) !== d.sha256 || bytes.length !== d.size)
          fail("Originalprüfsumme stimmt nicht.");
        entries["files/" + d.sha256] = bytes;
      } catch {
        missing.push(d.title);
      }
    }
    failed ||= missing.length > 0;
    const manifest = {
      format: "vehicle-record-backup",
      schema_version: "vehicles" in snapshot ? 2 : 1,
      created_at: created,
      archive_id: archiveId,
      ...("vehicles" in snapshot ? { account: snapshot } : { state: snapshot }),
      state_sha256: stateHash,
      part: i + 1,
      parts: groups.length,
      complete: missing.length === 0,
      missing,
    };
    entries["data.json"] = strToU8(JSON.stringify(manifest));
    for (const [n, s] of states(snapshot).entries())
      for (const t of tables)
        entries[
          ("vehicles" in snapshot ? "vehicles/" + n + "/" : "") +
            "tables/" +
            t +
            ".csv"
        ] = strToU8(csv(s, t));
    // At most one part and one original response are held at once.
    await save(
      zipSync(entries, { level: 0 }),
      `Fahrzeugakte-${created.slice(0, 10)}-Teil-${i + 1}-von-${groups.length}${missing.length ? "-UNVOLLSTAENDIG" : ""}.zip`,
    );
  }
  if (failed)
    fail(
      "Export unvollständig. Fehlende Originale ergänzen und erneut exportieren.",
    );
  return groups.length;
}
export type ParsedArchive = {
  state: State;
  account?: AccountArchive;
  files: File[];
  originals: Record<string, { part: number; vehicle: string }>;
};
export async function parseArchives(files: File[]): Promise<ParsedArchive> {
  if (!files.length || files.length > 1000)
    fail("Bitte alle Teilarchive auswählen.");
  let manifest: any = null,
    common = "";
  const parts = new Set<number>(),
    originals: ParsedArchive["originals"] = Object.create(null);
  let uniqueBytes = 0;
  for (const [index, file] of files.entries()) {
    if (file.size > 150 * 1024 * 1024)
      fail("Archiv zu groß (maximal 150 MiB pro Teil).");
    const entries = await unpack(file);
    if (!entries["data.json"]) fail("data.json fehlt.");
    let m: any;
    try {
      m = JSON.parse(strFromU8(entries["data.json"]));
    } catch {
      fail("Archivmanifest ist ungültig.");
    }
    if (
      m.format !== "vehicle-record-backup" ||
      ![1, 2].includes(m.schema_version) ||
      !Number.isInteger(m.part) ||
      !Number.isInteger(m.parts) ||
      m.parts < 1 ||
      m.parts > 1000 ||
      m.part < 1 ||
      m.part > m.parts ||
      parts.has(m.part)
    )
      fail("Ungültige oder doppelte Teilnummer.");
    const input: ArchiveInput = m.schema_version === 2 ? m.account : m.state;
    if (!input || hash(canonical(input)) !== m.state_sha256)
      fail("Backup-Format oder Datenprüfsumme ungültig.");
    if (
      m.schema_version === 2 &&
      (!("vehicles" in input) ||
        input.format !== "vehicle-account-backup" ||
        input.schema_version !== 2 ||
        !input.vehicles.length)
    )
      fail("Kontosicherung ungültig.");
    for (const s of states(input)) validateState(s);
    const identity = canonical({
      version: m.schema_version,
      hash: m.state_sha256,
      parts: m.parts,
      archive: m.archive_id ?? null,
      created: m.created_at ?? null,
    });
    if (common && identity !== common)
      fail("Teilarchive gehören zu unterschiedlichen Sicherungen.");
    common = identity;
    manifest = m;
    parts.add(m.part);
    if (m.complete === false || m.missing?.length)
      fail(
        "Export enthält fehlende Originale und kann nicht aktiviert werden.",
      );
    const known = new Map(
      states(input)
        .flatMap((s) => s.Documents)
        .filter((d) => d.sha256)
        .map((d) => [d.sha256!, d]),
    );
    for (const [name, bytes] of Object.entries(entries)) {
      if (!name.startsWith("files/")) continue;
      const sha = name.slice(6),
        doc = known.get(sha);
      if (!doc || doc.size !== bytes.length || hashBytes(bytes) !== sha)
        fail("Original-Prüfsumme oder Dateigröße falsch.");
      if (originals[sha]) fail("Original in mehreren Teilarchiven vorhanden.");
      uniqueBytes += bytes.length;
      if (uniqueBytes > ACCOUNT_BYTES)
        fail("Archiv überschreitet die Kontogrenze von 1 GB.");
      originals[sha] = { part: index, vehicle: doc.vehicle_id };
    }
  }
  if (parts.size !== manifest.parts)
    fail("Bitte alle " + manifest.parts + " Teilarchive auswählen.");
  const input: ArchiveInput =
    manifest.schema_version === 2 ? manifest.account : manifest.state;
  const missing = states(input)
    .flatMap((s) => s.Documents)
    .filter((d) => d.sha256 && !originals[d.sha256]);
  if (missing.length)
    fail("Originaldateien fehlen: " + missing.map((d) => d.title).join(", "));
  return {
    state: states(input)[0],
    ...("vehicles" in input ? { account: input } : {}),
    files,
    originals,
  };
}
export async function restoreArchive(
  adapter: Adapter,
  input: ParsedArchive,
  onProgress: (s: string) => void,
  account = false,
) {
  if (input.account && !account)
    fail(
      "Kontosicherung bitte ausdrücklich als gesamtes Konto wiederherstellen.",
    );
  const backup = input.account ?? {
      format: "vehicle-account-backup",
      schema_version: 2,
      settings: input.state.Settings[0],
      vehicles: [input.state],
    },
    started = await adapter.call(
      "restoreStart",
      account ? { account: true, backup } : { state: input.state },
    );
  const all = states(input.account ?? input.state);
  let n = 0;
  for (const [index, file] of input.files.entries()) {
    const entries = await unpack(file);
    for (const [sha, reference] of Object.entries(input.originals)) {
      if (reference.part !== index) continue;
      const bytes = entries["files/" + sha];
      if (!bytes || hashBytes(bytes) !== sha)
        fail("Original zwischenzeitlich beschädigt.");
      const docs = all
        .flatMap((s) => s.Documents)
        .filter((d) => d.sha256 === sha);
      for (const d of docs) {
        onProgress("Originale prüfen: " + ++n + " · " + d.title);
        await adapter.call("restoreUpload", {
          restore_id: started.id,
          vehicle_id: account ? d.vehicle_id : started.vehicleId,
          file: {
            source_filename: d.source_filename ?? d.title,
            mime: d.mime,
            size: bytes.length,
            sha256: sha,
            base64: bytesBase64(bytes),
          },
        });
      }
    }
  }
  const preview = await adapter.call("restorePreview", {
    id: started.id,
    account,
  });
  return { ...preview, id: started.id, account };
}
