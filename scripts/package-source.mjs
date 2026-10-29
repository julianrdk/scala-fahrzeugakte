import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { zipSync, strToU8, unzipSync } from "fflate";
const root = process.cwd(),
  git = spawnSync(
    "git",
    [
      "-c",
      "safe.directory=" + root.replaceAll("\\", "/"),
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ],
    { cwd: root },
  );
if (git.status !== 0)
  throw Error("Quellcodeverzeichnis konnte nicht sicher ermittelt werden.");
const files = {},
  folders = [
    "src/",
    "shared/",
    "auth/src/",
    "auth/migrations/",
    "functions/",
    "docs/",
    "examples/",
    "scripts/",
    "tests/",
    ".github/workflows/",
  ],
  rootFiles = new Set([
    "auth/data-schema.sql",
    "README.md",
    "SETUP.md",
    "DATA_MODEL.md",
    "BACKUP_RESTORE.md",
    "TEST_REPORT.md",
    "AGENTS.md",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "vite.config.ts",
    "index.html",
    ".gitignore",
    ".prettierignore",
    "wrangler.service.jsonc",
    "wrangler.pages.jsonc",
    "wrangler.local.jsonc",
    "wrangler.staging.service.jsonc",
    "wrangler.staging.pages.jsonc",
    ".prettierrc.json",
  ]);
for (const relative of new Set(
  git.stdout.toString().split("\0").filter(Boolean),
)) {
  const allowed =
    rootFiles.has(relative) ||
    folders.some((f) => relative.startsWith(f)) ||
    /^config\/[^/]+\.example\.json$/.test(relative) ||
    (relative.startsWith("public/") && !relative.startsWith("public/ocr/"));
  if (
    !allowed ||
    /(?:^|\/)(?:private[^/]*|\.env[^/]*|\.dev\.vars[^/]*|[^/]*\.zip)$/.test(
      relative,
    )
  )
    continue;
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep) || !fs.existsSync(absolute))
    continue;
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10000000)
    throw Error("Unzulässige Quelldatei: " + relative);
  const bytes = fs.readFileSync(absolute);
  if (
    /(?:sk_live_|re_|gsk_(?!SYNTHETIC_))[A-Za-z0-9_-]{24,}/.test(
      bytes.toString(),
    )
  )
    throw Error(
      "Möglicher geheimer Schlüssel; Archiv abgebrochen: " + relative,
    );
  files[relative] = new Uint8Array(bytes);
}
files["SOURCE_MANIFEST.sha256"] = strToU8(
  Object.entries(files)
    .map(
      ([name, b]) => createHash("sha256").update(b).digest("hex") + "  " + name,
    )
    .join("\n") + "\n",
);
const archive = zipSync(files, { level: 6 }),
  verified = unzipSync(archive);
for (const [name, bytes] of Object.entries(files))
  if (
    !verified[name] ||
    !Buffer.from(verified[name]).equals(Buffer.from(bytes))
  )
    throw Error("Archivprüfung fehlgeschlagen: " + name);
if (!process.argv.includes("--check")) {
  const output = path.join(
    root,
    "Fahrzeugakte-source-" +
      new Date().toISOString().replaceAll(/[:.]/g, "-") +
      ".zip",
  );
  fs.writeFileSync(output, archive, { flag: "wx" });
  console.log(output);
}
console.log(
  JSON.stringify({
    files: Object.keys(files).length,
    bytes: archive.length,
    verified: true,
    includesDependencies: false,
  }),
);
