export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown[]>;
}
export interface ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
  size: number;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}
export interface Bucket {
  get(key: string): Promise<ObjectBody | null>;
  head(key: string): Promise<Omit<ObjectBody, "arrayBuffer"> | null>;
  put(
    key: string,
    body: ArrayBuffer | Uint8Array,
    options?: {
      httpMetadata?: { contentType: string };
      customMetadata?: Record<string, string>;
      sha256?: ArrayBuffer;
    },
  ): Promise<unknown>;
  delete(key: string | string[]): Promise<void>;
}
export interface V2Env {
  APP_ORIGIN: string;
  DATA_DB?: Database;
  FILES?: Bucket;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_JWT_KEY?: string;
  CLERK_ISSUER?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  AUTOMATION_ENABLED?: string;
  AI_CREDENTIALS_KEY?: string;
}
export type Account = {
  owner: string;
  email: string;
  generation: string;
  revision: number;
  disabled: number;
  next_run: number;
  lease_until: number;
  last_run: number | null;
  last_backup: string | null;
  last_error: string | null;
};
export type StoredObject = {
  owner: string;
  id: string;
  object_key: string;
  sha256: string;
  size: number;
  mime: string;
  name: string;
  role: "original" | "thumbnail" | "snapshot";
  status: "reserved" | "ready";
  created_at: string;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}
export function problem(status: number, message: string, code?: string): never {
  throw new ApiError(status, message, code);
}
export function storage(env: V2Env) {
  if (!env.DATA_DB || !env.FILES)
    problem(
      503,
      "Cloudflare-Datenspeicher ist noch nicht eingerichtet.",
      "SETUP",
    );
  return { db: env.DATA_DB, files: env.FILES };
}
