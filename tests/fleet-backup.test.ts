import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportMetadata,
  restorePreview,
  restoreStart,
  restoreSwitch,
} from "../auth/src/fleet/backups";
import { document } from "../auth/src/fleet/files";
import { fullState, vehicle } from "../auth/src/fleet/store";
import {
  canonical,
  emptyState,
  hash,
  hashBytes,
  totals,
} from "../shared/logic";
import type { Adapter } from "../src/adapter";
import { exportArchive, parseArchives, restoreArchive } from "../src/backup";
import { pkg, request } from "./fixtures";
import { pdf, setupFleet } from "./fleet-fixture";
let c: Awaited<ReturnType<typeof setupFleet>>,
  archives: Blob[] = [];
beforeEach(async () => {
  c = await setupFleet();
  archives = [];
  vi.stubGlobal("document", { createElement: () => ({ click() {} }) });
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    archives.push(blob as Blob);
    return "blob:synthetic";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  c.sql.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function adapter(id: string): Adapter {
  return {
    kind: "cloudflare",
    async call<T>(name: string, arg: any = {}): Promise<T> {
      const a = await c.a();
      let result: any;
      if (name === "document") {
        const r = await document(c.env, a, arg.vehicle_id ?? id, arg.id, false);
        result = {
          base64: Buffer.from(r.bytes).toString("base64"),
          mime: r.record.mime,
        };
      } else if (name === "restoreStart")
        result = await restoreStart(
          c.env,
          a,
          arg.account ? null : id,
          arg.account ? arg.backup : arg.state,
        );
      else if (name === "restoreUpload")
        result = await c.file(
          arg.vehicle_id ?? id,
          Buffer.from(arg.file.base64, "base64"),
          arg.file.mime,
          arg.restore_id,
        );
      else if (name === "restorePreview")
        result = await restorePreview(c.env, a, arg.id);
      else if (name === "restoreSwitch")
        result = await restoreSwitch(
          c.env,
          a,
          arg.id,
          arg.confirm,
          crypto.randomUUID(),
        );
      else throw Error("Unexpected action " + name);
      return result as T;
    },
  };
}
async function before() {
  const u = await c.file(),
    p = pkg();
  p.documents = [
    {
      ref: "d",
      title: "Original",
      document_type: "invoice",
      source_filename: "Rechnung.pdf",
    },
  ];
  p.expenses[0].document_refs = ["d"];
  await c.write(c.a1, "commit", request(p, { documents: { d: u.id } }));
  return fullState(c.env, await c.a(), await vehicle(c.env, await c.a(), c.a1));
}
function archive(m: any, files: Record<string, Uint8Array> = {}) {
  return new File(
    [zipSync({ "data.json": strToU8(JSON.stringify(m)), ...files })],
    "test.zip",
  );
}
describe("ZIP-Rundlauf über den neuen Datenspeicher", () => {
  it("erhält Originale, Kosten und Verknüpfungen bei einer Fahrzeugwiederherstellung", async () => {
    const s = await before(),
      a = adapter(c.a1);
    await exportArchive(a, s, () => {});
    const parsed = await parseArchives([
      new File([await archives[0].arrayBuffer()], "test.zip"),
    ]);
    expect(parsed.originals[hashBytes(pdf)]).toEqual({
      part: 0,
      vehicle: c.a1,
    });
    const prepared = await restoreArchive(a, parsed, () => {});
    expect(prepared.missing).toEqual([]);
    await a.call("restoreSwitch", { id: prepared.id, confirm: true });
    const after = await fullState(
      c.env,
      await c.a(),
      await vehicle(c.env, await c.a(), c.a1),
    );
    expect(totals(after)).toEqual(totals(s));
    expect(after.DocumentLinks).toEqual(s.DocumentLinks);
  });
  it("stellt alle Fahrzeuge und gemeinsame Einstellungen ausdrücklich wieder her", async () => {
    await before();
    const input = (await exportMetadata(c.env, await c.a())) as any,
      a = adapter(c.a1);
    await exportArchive(a, input, () => {});
    const parsed = await parseArchives([
      new File([await archives[0].arrayBuffer()], "account.zip"),
    ]);
    expect(parsed.account?.vehicles).toHaveLength(2);
    await expect(restoreArchive(a, parsed, () => {})).rejects.toThrow(
      /ausdrücklich/,
    );
    const prepared = await restoreArchive(a, parsed, () => {}, true);
    expect(prepared.states).toHaveLength(2);
    await a.call("restoreSwitch", { id: prepared.id, confirm: true });
  });
  it("nimmt auch vollständige ältere Google-ZIPs ohne neue Metadaten an", async () => {
    const state = emptyState(),
      m = {
        format: "vehicle-record-backup",
        schema_version: 1,
        state,
        state_sha256: hash(canonical(state)),
        part: 1,
        parts: 1,
      };
    expect((await parseArchives([archive(m)])).state).toEqual(state);
  });
  it.each([0, 2, 99, -1, 1.5, "1"])(
    "weist die Teilnummer %s bei einem Teil zurück",
    async (part) => {
      const state = emptyState(),
        m = {
          format: "vehicle-record-backup",
          schema_version: 1,
          state,
          state_sha256: hash(canonical(state)),
          part,
          parts: 1,
        };
      await expect(parseArchives([archive(m)])).rejects.toThrow(/Teilnummer/);
    },
  );
  it("weist doppelte, gemischte und fehlende Teile zurück", async () => {
    const state = emptyState(),
      m = {
        format: "vehicle-record-backup",
        schema_version: 1,
        state,
        state_sha256: hash(canonical(state)),
        part: 1,
        parts: 2,
        archive_id: "one",
      };
    await expect(parseArchives([archive(m), archive(m)])).rejects.toThrow(
      /Teilnummer/,
    );
    await expect(
      parseArchives([
        archive(m),
        archive({ ...m, part: 2, archive_id: "other" }),
      ]),
    ).rejects.toThrow(/unterschiedlichen/);
    await expect(parseArchives([archive(m)])).rejects.toThrow(/alle 2/);
  });
  it("weist beschädigte Originale und unvollständige Sicherungen zurück", async () => {
    const state = await before(),
      m = {
        format: "vehicle-record-backup",
        schema_version: 1,
        state,
        state_sha256: hash(canonical(state)),
        part: 1,
        parts: 1,
      };
    await expect(
      parseArchives([
        archive(m, { ["files/" + hashBytes(pdf)]: new Uint8Array([1, 2, 3]) }),
      ]),
    ).rejects.toThrow(/Prüfsumme|Dateigröße/);
    await expect(
      parseArchives([archive({ ...m, complete: false })]),
    ).rejects.toThrow(/fehlende Originale/);
  });
});
