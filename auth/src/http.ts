import { problem } from "./v2/types";
export async function jsonBody(request: Request) {
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim() !==
    "application/json"
  )
    problem(415, "JSON-Anfrage erforderlich.");
  const max = new URL(request.url).pathname.endsWith("/restoreStart")
    ? 16 * 1024 * 1024
    : 1024 * 1024;
  let size = 0;
  const chunks: Uint8Array[] = [],
    reader = request.body?.getReader();
  if (reader)
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > max) {
        await reader.cancel();
        problem(413, "Anfrage zu groß.");
      }
      chunks.push(r.value);
    }
  let value: unknown;
  try {
    value = JSON.parse(
      await new Blob(chunks.map((b) => new Uint8Array(b).buffer)).text(),
    );
  } catch {
    problem(400, "Ungültige JSON-Anfrage.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    problem(400, "JSON-Objekt erforderlich.");
  return value as Record<string, any>;
}
