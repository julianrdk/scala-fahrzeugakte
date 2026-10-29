import fs from "node:fs";
import Ajv from "ajv";
import standalone from "ajv/dist/standalone/index.js";
const schema = JSON.parse(
  fs.readFileSync("shared/import-v1.schema.json", "utf8"),
);
const stored = structuredClone(schema);
stored.$id = "vehicle-record-storage";
for (const name of ["documents", "expenses", "work", "reminders"])
  delete stored.properties[name].maxItems;
const ajv = new Ajv({
  allErrors: true,
  strict: true,
  code: { source: true, esm: true },
});
schema.$id = "vehicle-record-import-v1";
ajv.addSchema(schema);
ajv.addSchema(stored);
const assistant = JSON.parse(
  fs.readFileSync("shared/assistant.schema.json", "utf8"),
);
ajv.addSchema(assistant);
fs.mkdirSync("shared/generated", { recursive: true });
let code = standalone(ajv, {
  validateImport: schema.$id,
  validateStored: stored.$id,
  validateAssistant: assistant.$id,
});
code = code.replaceAll(
  'require("ajv/dist/runtime/ucs2length").default',
  "standaloneUcs2Length",
);
if (code.includes("require("))
  throw Error("Nicht unterstützte CommonJS-Abhängigkeit im Browser-Prüfer.");
code =
  "function standaloneUcs2Length(value){let length=0;for(const point of value)length++;return length;}\n" +
  code;
fs.writeFileSync("shared/generated/validators.js", code);
fs.writeFileSync(
  "shared/generated/validators.d.ts",
  "import type {ValidateFunction} from 'ajv';\nexport const validateImport:ValidateFunction;\nexport const validateStored:ValidateFunction;\nexport const validateAssistant:ValidateFunction;\n",
);
