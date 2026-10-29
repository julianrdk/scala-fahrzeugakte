// Run manually and store the output as the Worker secret AI_CREDENTIALS_KEY.
// Never run in CI, commit its output, or reuse an existing service key.
import { randomBytes } from "node:crypto";
process.stdout.write(randomBytes(32).toString("base64") + "\n");
