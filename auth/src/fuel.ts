import type {
  FuelPoint,
  FuelQuery,
  FuelResult,
  FuelStation,
  FuelStatus,
} from "../../shared/fuel";

interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface FuelEnv {
  DB: { prepare(sql: string): Statement };
  APP_ORIGIN: string;
  TANKERKOENIG_API_KEY?: string;
  FUEL_GEOCODER_URL?: string;
}
export class FuelError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "FUEL_ERROR",
    public retryAfter = 0,
  ) {
    super(message);
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function apiKey(env: FuelEnv) {
  const key = env.TANKERKOENIG_API_KEY?.trim() ?? "";
  return uuid.test(key) && !key.startsWith("00000000-0000-0000-0000-")
    ? key
    : "";
}
export async function fuelStatus(env: FuelEnv): Promise<FuelStatus> {
  if (!apiKey(env)) return { enabled: false, reason: "key" };
  try {
    const tables = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('fuel_cache','fuel_limits')",
    ).first<{ n: number }>();
    return tables?.n === 2
      ? { enabled: true }
      : { enabled: false, reason: "database" };
  } catch {
    return { enabled: false, reason: "database" };
  }
}
function validPoint(lat: unknown, lng: unknown) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 47 &&
    lat <= 55.2 &&
    lng >= 5.5 &&
    lng <= 15.5
  );
}
function queryInput(raw: unknown): FuelQuery {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new FuelError(
      400,
      "Bitte eine deutsche PLZ oder einen Standort angeben.",
    );
  const input = raw as Record<string, unknown>;
  if (
    Object.keys(input).length === 1 &&
    typeof input.postalCode === "string" &&
    /^\d{5}$/.test(input.postalCode)
  )
    return { postalCode: input.postalCode };
  if (Object.keys(input).length === 2 && validPoint(input.lat, input.lng))
    return { lat: input.lat as number, lng: input.lng as number };
  throw new FuelError(
    400,
    "Bitte eine fünfstellige deutsche PLZ oder einen Standort in Deutschland angeben.",
  );
}
async function cached<T>(env: FuelEnv, key: string): Promise<T | null> {
  const row = await env.DB.prepare(
    "SELECT payload FROM fuel_cache WHERE cache_key=? AND expires_at>?",
  )
    .bind(key, Date.now())
    .first<{ payload: string }>();
  return row ? (JSON.parse(row.payload) as T) : null;
}
async function save(env: FuelEnv, key: string, payload: unknown, ttl: number) {
  await env.DB.prepare(
    "INSERT INTO fuel_cache(cache_key,payload,expires_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at",
  )
    .bind(key, JSON.stringify(payload), Date.now() + ttl)
    .run();
}
async function slot(env: FuelEnv, service: string, interval: number) {
  const now = Date.now();
  const claimed = await env.DB.prepare(
    "INSERT INTO fuel_limits(service,next_at) VALUES(?,?) ON CONFLICT(service) DO UPDATE SET next_at=excluded.next_at WHERE fuel_limits.next_at<=? RETURNING service",
  )
    .bind(service, now + interval, now)
    .first();
  if (!claimed) {
    const limit = await env.DB.prepare(
      "SELECT next_at FROM fuel_limits WHERE service=?",
    )
      .bind(service)
      .first<{ next_at: number }>();
    const retry = Math.max(
      1,
      Math.ceil(((limit?.next_at ?? now + interval) - now) / 1000),
    );
    throw new FuelError(
      429,
      "Bitte " + retry + " Sekunden bis zur nächsten Suche warten.",
      "FUEL_RATE_LIMIT",
      retry,
    );
  }
}
async function provider(url: URL, env: FuelEnv) {
  const response = await fetch(url.href, {
    redirect: "manual",
    headers: {
      Accept: "application/json",
      "User-Agent": "Fahrzeugakte/1.0 (+" + env.APP_ORIGIN + ")",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new FuelError(
      502,
      "Der Suchdienst ist gerade nicht erreichbar. Bitte später erneut suchen.",
    );
  }
  return response.json() as Promise<any>;
}
async function postalPoint(
  env: FuelEnv,
  postalCode: string,
): Promise<FuelPoint> {
  const key = "postal:" + postalCode,
    stored = await cached<FuelPoint>(env, key);
  if (stored) return stored;
  const endpoint = new URL(
    env.FUEL_GEOCODER_URL ?? "https://nominatim.openstreetmap.org/search",
  );
  if (endpoint.protocol !== "https:")
    throw new FuelError(503, "Die PLZ-Suche ist noch nicht eingerichtet.");
  endpoint.search = new URLSearchParams({
    format: "jsonv2",
    postalcode: postalCode,
    country: "Germany",
    countrycodes: "de",
    limit: "1",
    "accept-language": "de",
  }).toString();
  await slot(env, "nominatim", 1100);
  const data = await provider(endpoint, env),
    first = Array.isArray(data) ? data[0] : null,
    lat = Number(first?.lat),
    lng = Number(first?.lon);
  if (!first || !validPoint(lat, lng))
    throw new FuelError(
      404,
      "Für diese deutsche PLZ wurde kein Ort gefunden. Bitte die PLZ prüfen.",
    );
  const point = { lat, lng, label: "PLZ " + postalCode };
  await save(env, key, point, 86400000);
  return point;
}
function text(value: unknown, max = 180) {
  return typeof value === "string"
    ? value.trim().slice(0, max)
    : typeof value === "number"
      ? String(value)
      : "";
}
function postCode(value: unknown) {
  const code = text(value, 10);
  return /^\d{1,5}$/.test(code) ? code.padStart(5, "0") : code;
}
function price(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value < 20
    ? value
    : null;
}
function stations(data: any): FuelStation[] {
  if (data?.ok !== true || !Array.isArray(data.stations))
    throw new FuelError(
      502,
      "Tankerkönig hat keine gültigen Tankpreise geliefert. Bitte später erneut suchen.",
    );
  return data.stations
    .flatMap((item: any) => {
      if (
        !item ||
        !uuid.test(item.id ?? "") ||
        !validPoint(item.lat, item.lng) ||
        typeof item.dist !== "number" ||
        !Number.isFinite(item.dist) ||
        item.dist < 0 ||
        item.dist > 26
      )
        return [];
      return [
        {
          id: item.id,
          name: text(item.name) || "Tankstelle",
          brand: text(item.brand),
          street: text(item.street),
          houseNumber: text(item.houseNumber, 30),
          postCode: postCode(item.postCode),
          place: text(item.place),
          lat: item.lat,
          lng: item.lng,
          distance: item.dist,
          isOpen: item.isOpen === true,
          prices: {
            e5: price(item.e5),
            e10: price(item.e10),
            diesel: price(item.diesel),
          },
        },
      ];
    })
    .slice(0, 1000);
}
async function locationKey(point: FuelPoint) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(point.lat.toFixed(3) + "," + point.lng.toFixed(3)),
  );
  return (
    "stations:" +
    Array.from(new Uint8Array(bytes), (x) =>
      x.toString(16).padStart(2, "0"),
    ).join("")
  );
}
export async function searchFuel(
  env: FuelEnv,
  raw: unknown,
): Promise<FuelResult> {
  const input = queryInput(raw),
    status = await fuelStatus(env);
  if (!status.enabled)
    throw new FuelError(
      503,
      "Die integrierten Tankpreise sind noch nicht eingerichtet. Bis dahin kannst du die externe Tankpreis-Seite öffnen.",
      status.reason === "database" ? "FUEL_DATABASE_SETUP" : "FUEL_KEY_SETUP",
    );
  try {
    const center =
      "postalCode" in input
        ? await postalPoint(env, input.postalCode)
        : {
            lat: Math.round(input.lat * 1000) / 1000,
            lng: Math.round(input.lng * 1000) / 1000,
            label: "Mein Standort",
          };
    const key = await locationKey(center),
      stored = await cached<Pick<FuelResult, "stations" | "fetchedAt">>(
        env,
        key,
      );
    if (stored) return { ...stored, center, cached: true };
    await slot(env, "tankerkoenig", 61000);
    const target = new URL(
      "https://creativecommons.tankerkoenig.de/json/list.php",
    );
    target.search = new URLSearchParams({
      lat: String(center.lat),
      lng: String(center.lng),
      rad: "25",
      type: "all",
      sort: "dist",
      apikey: apiKey(env),
    }).toString();
    const found = stations(await provider(target, env)),
      result = { stations: found, fetchedAt: new Date().toISOString() };
    await env.DB.prepare("DELETE FROM fuel_cache WHERE expires_at<=?")
      .bind(Date.now())
      .run();
    await save(env, key, result, 180000);
    return { ...result, center, cached: false };
  } catch (error) {
    if (error instanceof FuelError) throw error;
    throw new FuelError(
      503,
      "Die Tankstellensuche ist gerade nicht verfügbar. Bitte später erneut suchen.",
    );
  }
}
export async function fuelBody(request: Request) {
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new FuelError(415, "Bitte die Suche über die Fahrzeugakte starten.");
  const reader = request.body?.getReader();
  if (!reader) throw new FuelError(400, "Die Suchangabe fehlt.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        throw new FuelError(413, "Die Suchangabe ist zu groß.");
      }
      chunks.push(part.value);
    }
    const all = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) {
      all.set(part, offset);
      offset += part.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all));
  } catch (error) {
    if (error instanceof FuelError) throw error;
    throw new FuelError(
      400,
      "Bitte eine gültige PLZ oder einen Standort angeben.",
    );
  }
}
