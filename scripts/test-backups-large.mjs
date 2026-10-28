import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
const directory = path.resolve("test-results/large-backup");
fs.mkdirSync(directory, { recursive: true });
await build({
  stdin: {
    contents:
      "export * from './src/backup';export {emptyState,meta,hashBytes,totals,validateState,canonical} from './shared/logic';",
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: path.join(directory, "probe.mjs"),
});
const {
  exportArchive,
  parseArchives,
  restoreArchive,
  emptyState,
  meta,
  hashBytes,
  totals,
  validateState,
  canonical,
} = await import(
  new URL("../test-results/large-backup/probe.mjs", import.meta.url)
);
const report = [];
function bytes(index, size) {
  const b = new Uint8Array(size);
  b.set(new TextEncoder().encode("%PDF-1.4\nSYNTHETIC"));
  b[17] = index & 255;
  b[18] = index >> 8;
  return b;
}
try {
  for (const total of [268000000, 960000000]) {
    const started = performance.now(),
      state = emptyState(),
      lookup = new Map(),
      size = 4000000;
    state.Vehicles[0].manufacturer = "Test";
    state.Vehicles[0].model = "Große Sicherung";
    for (let i = 0; i < total / size; i++) {
      const b = bytes(i, size),
        sha = hashBytes(b),
        id = "document-" + i;
      lookup.set(sha, { i, size });
      state.Documents.push({
        ...meta(id, new Date().toISOString()),
        ref: id,
        title: "Beleg " + i,
        source_filename: id + ".pdf",
        document_type: "invoice",
        sha256: sha,
        size,
        mime: "application/pdf",
        drive_id: sha,
        missing: false,
      });
    }
    state.Expenses.push({
      ...meta("expense", new Date().toISOString()),
      ref: "expense",
      title: "Testrechnung",
      category: "Pflege",
      date: "2026-10-28",
      odometer_km: null,
      amount_cents: 12345,
      currency: "EUR",
      vendor: "Test",
      invoice_number: null,
      document_refs: [state.Documents[0].id],
      notes: null,
      refund_of_id: null,
    });
    state.DocumentLinks.push({
      ...meta("link", new Date().toISOString()),
      document_id: state.Documents[0].id,
      entity_id: "expense",
    });
    validateState(state);
    const files = [];
    let active = null,
      staging = null,
      uploads = 0,
      part = 0,
      maxRss = 0;
    const adapter = {
      kind: "cloudflare",
      async call(name, arg) {
        if (name === "document") {
          const d = state.Documents.find((d) => d.id === arg.id),
            p = lookup.get(d.sha256);
          return { base64: Buffer.from(bytes(p.i, p.size)).toString("base64") };
        }
        if (name === "restoreStart") {
          staging = structuredClone(arg.state);
          validateState(staging);
          return { id: "synthetic-restore", vehicleId: "vehicle-1" };
        }
        if (name === "restoreUpload") {
          const b = Buffer.from(arg.file.base64, "base64");
          if (hashBytes(b) !== arg.file.sha256)
            throw Error("Dateiprüfsumme falsch.");
          uploads++;
          global.gc?.();
          return { ok: true };
        }
        if (name === "restorePreview") return { state: staging, missing: [] };
        if (name === "restoreSwitch") {
          active = staging;
          return { ok: true };
        }
        throw Error("Unerwartete Aktion " + name);
      },
    };
    await exportArchive(
      adapter,
      state,
      () => {},
      async (zip, name) => {
        const file = path.join(directory, ++part + "-" + name);
        await fs.promises.writeFile(file, zip);
        const size = fs.statSync(file).size;
        files.push({
          name: path.basename(file),
          path: file,
          size,
          arrayBuffer: async () => {
            const b = await fs.promises.readFile(file);
            return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
          },
        });
        global.gc?.();
        maxRss = Math.max(maxRss, process.memoryUsage().rss);
      },
    );
    const parsed = await parseArchives(files);
    if (Object.keys(parsed.originals).length !== state.Documents.length)
      throw Error("Originale fehlen.");
    const prepared = await restoreArchive(adapter, parsed, () => {});
    await adapter.call("restoreSwitch", { id: prepared.id, confirm: true });
    if (
      uploads !== state.Documents.length ||
      canonical(active) !== canonical(state) ||
      totals(active).expenses !== 12345
    )
      throw Error("ZIP-Rundlauf hat Daten verändert.");
    report.push({
      original_bytes: total,
      documents: uploads,
      parts: files.length,
      seconds: Math.round((performance.now() - started) / 1000),
      rss_mb_after_gc: Math.round(maxRss / 1000000),
    });
    for (const f of files) fs.unlinkSync(f.path);
    console.log(JSON.stringify(report.at(-1)));
  }
  fs.writeFileSync(
    "test-results/large-backup.json",
    JSON.stringify(
      {
        kind: "Dateibasierter ZIP-Rundlauf, Referenzen statt aller Originale im Arbeitsspeicher",
        results: report,
      },
      null,
      2,
    ),
  );
} finally {
  const module = path.join(directory, "probe.mjs");
  if (fs.existsSync(module)) fs.unlinkSync(module);
}
