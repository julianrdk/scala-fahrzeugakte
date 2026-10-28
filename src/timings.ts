export type TimingKind =
  "Anmeldung prüfen" | "Aktenstart" | "Bildvorschau" | "Speichern";
export type Timing = { kind: TimingKind; ms: number; ok: boolean };
let epoch = 0;
const rows: Timing[] = [];
export function recordTiming(kind: TimingKind, start: number, ok = true) {
  rows.push({
    kind,
    ms: Math.max(0, Math.round(performance.now() - start)),
    ok,
  });
  if (rows.length > 60) rows.shift();
}
export function readTimings() {
  return rows.slice();
}
export function clearTimings() {
  epoch++;
  rows.length = 0;
}
export async function timed<T>(kind: TimingKind, run: () => Promise<T>) {
  const start = performance.now(),
    at = epoch;
  let ok = false;
  try {
    const result = await run();
    ok = true;
    return result;
  } finally {
    if (at === epoch) recordTiming(kind, start, ok);
  }
}
