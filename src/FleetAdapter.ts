import {
  selectedVehicle,
  type FleetBootstrap,
  type MutationReply,
  type PageInfo,
  type VehicleView,
} from "../shared/fleet";
import {
  FuelSearchError,
  type FuelQuery,
  type FuelResult,
  type FuelStatus,
} from "../shared/fuel";
import { canonical, emptyState, hash, tables } from "../shared/logic";
import type { Doc, UploadFile } from "../shared/types";
import {
  base64Bytes,
  bytesBase64,
  SignInRequired,
  type Adapter,
  type Config,
} from "./adapter";
import {
  cachedThumbnail,
  clearThumbnailCache,
  makeThumbnail,
} from "./thumbnail";
import type {
  AIProfile,
  AssistantReply,
  AssistantRequest,
} from "../shared/assistant";
import { clearTimings, timed } from "./timings";
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export class CloudflareAdapter implements Adapter {
  readonly kind = "cloudflare" as const;
  accountEmail = "";
  fleet: FleetBootstrap | null = null;
  vehicleId: string | null = null;
  pages: PageInfo[] = [];
  dashboard: any;
  private state = emptyState();
  private status: any = {};
  private revision = 0;
  private epoch = 0;
  private vehicleEpoch = 0;
  private closed = false;
  private loaded = false;
  private route = "/";
  private year = String(new Date().getFullYear());
  private viewSequence = 0;
  private pending = new Map<string, { operation: string; arg: any }>();
  constructor(
    public config: Config,
    public accountId: string,
    private token: () => Promise<string | null>,
    private invalid: () => void = () => {},
  ) {}
  resume() {
    this.closed = false;
  }
  aiProfile(
    action?: "save" | "test" | "remove",
    key?: string,
    signal?: AbortSignal,
  ): Promise<AIProfile> {
    return this.json(
      "/v3/ai/profile",
      action
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, ...(key ? { key } : {}) }),
            signal,
          }
        : { signal },
    );
  }
  async aiMessage(
    input: AssistantRequest,
    signal?: AbortSignal,
  ): Promise<AssistantReply> {
    const generation = this.vehicleEpoch,
      id = this.vehicleId;
    if (!id) throw Error("Bitte zuerst ein Fahrzeug auswählen.");
    const result = await this.json(
      "/v3/vehicles/" + encodeURIComponent(id) + "/assistant/message",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal,
      },
    );
    if (generation !== this.vehicleEpoch)
      throw Error("Fahrzeug wurde gewechselt.");
    return result;
  }
  async aiTranscribe(audio: Blob, signal?: AbortSignal): Promise<string> {
    const generation = this.vehicleEpoch,
      id = this.vehicleId;
    if (!id) throw Error("Bitte zuerst ein Fahrzeug auswählen.");
    const form = new FormData();
    form.set("audio", audio, "aufnahme");
    const result = await this.json(
      "/v3/vehicles/" + encodeURIComponent(id) + "/assistant/transcribe",
      { method: "POST", body: form, signal },
    );
    if (generation !== this.vehicleEpoch)
      throw Error("Fahrzeug wurde gewechselt.");
    return result.text;
  }
  dispose() {
    this.epoch++;
    this.vehicleEpoch++;
    this.closed = true;
    this.loaded = false;
    this.state = emptyState();
    this.fleet = null;
    this.accountEmail = "";
    this.pages = [];
    this.dashboard = undefined;
    this.pending.clear();
    clearTimings();
    void clearThumbnailCache();
  }
  private valid(epoch: number) {
    if (this.closed || epoch !== this.epoch)
      throw new SignInRequired("Kontositzung wurde gewechselt.");
  }
  private async request(path: string, init: RequestInit = {}) {
    if (this.closed) throw new SignInRequired("Bitte anmelden.");
    const epoch = this.epoch,
      token = await this.token();
    this.valid(epoch);
    if (!token) {
      this.dispose();
      this.invalid();
      throw new SignInRequired("Bitte erneut anmelden.");
    }
    let response: Response;
    try {
      response = await fetch(this.config.apiOrigin + path, {
        ...init,
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: {
          ...Object.fromEntries(new Headers(init.headers)),
          Authorization: "Bearer " + token,
        },
      });
    } catch {
      throw Error(
        "Keine Serverbestätigung. Verbindung prüfen und denselben Vorgang wiederholen.",
      );
    }
    this.valid(epoch);
    if (response.status === 401) {
      this.dispose();
      this.invalid();
      throw new SignInRequired("Bitte erneut anmelden.");
    }
    return response;
  }
  private async json(path: string, init: RequestInit = {}) {
    const epoch = this.epoch,
      response = await this.request(path, init);
    let body: any;
    try {
      body = await response.json();
    } catch {
      throw Error("Keine gültige Serverbestätigung.");
    }
    this.valid(epoch);
    if (!response.ok) {
      if (path.includes("/fuel/"))
        throw new FuelSearchError(
          body.error ?? "Tankstellensuche nicht verfügbar.",
          body.retryAfter ?? 0,
        );
      throw new ServiceError(
        body.error ?? "Speichern nicht bestätigt.",
        body.code ?? "REQUEST_FAILED",
        response.status,
      );
    }
    return body;
  }
  private selectionKey() {
    return "fahrzeugakte:last-vehicle:" + this.accountId;
  }
  private preference() {
    try {
      return typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(this.selectionKey());
    } catch {
      return null;
    }
  }
  private storePreference() {
    try {
      if (this.vehicleId && typeof localStorage !== "undefined")
        localStorage.setItem(this.selectionKey(), this.vehicleId);
    } catch {}
  }
  private remember(view: VehicleView) {
    this.state = view.state;
    this.revision = view.revision;
    this.status = view.status;
    this.pages = view.pages;
    this.dashboard = view.dashboard;
    this.loaded = true;
  }
  snapshot() {
    return {
      state: this.state,
      status: this.status,
      revision: this.revision,
      dashboard: this.dashboard,
    };
  }
  async bootstrap() {
    return timed("Aktenstart", async () => {
      const generation = this.vehicleEpoch,
        params = new URLSearchParams({
          route:
            typeof location === "undefined"
              ? "/"
              : location.hash.slice(1) || "/",
          year: this.year,
        });
      const preferred = this.preference();
      if (preferred) params.set("vehicle", preferred);
      const out = await this.json("/v3/bootstrap?" + params);
      if (generation !== this.vehicleEpoch)
        throw Error("Fahrzeug wurde gewechselt.");
      this.fleet = out;
      this.accountEmail = out.status.account_email ?? "";
      this.vehicleId =
        out.selectedVehicle ?? selectedVehicle(out.vehicles, preferred);
      this.status = out.status;
      if (out.view) this.remember(out.view);
      else {
        this.state = emptyState();
        this.state.Settings = [out.settings];
        this.loaded = true;
      }
      this.storePreference();
      return this.snapshot();
    });
  }
  async migrate() {
    await this.json("/v3/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    return this.bootstrap();
  }
  async loadView(route = this.route, year = this.year) {
    this.route = route;
    this.year = year;
    if (!this.vehicleId) return this.snapshot();
    const epoch = this.vehicleEpoch,
      sequence = ++this.viewSequence,
      id = this.vehicleId,
      result = await this.json(
        "/v3/vehicles/" +
          encodeURIComponent(id) +
          "/view?" +
          new URLSearchParams({ route, year }),
      );
    if (epoch !== this.vehicleEpoch) throw Error("Fahrzeug wurde gewechselt.");
    if (sequence !== this.viewSequence)
      throw Error("Ansicht wurde gewechselt.");
    if (result.revision < this.revision)
      throw Error("Stand wurde inzwischen geändert. Bitte erneut laden.");
    this.remember(result);
    return this.snapshot();
  }
  async selectVehicle(id: string) {
    if (!this.fleet?.vehicles.some((v) => v.id === id))
      throw Error("Fahrzeug fehlt.");
    this.vehicleEpoch++;
    this.vehicleId = id;
    this.revision = 0;
    this.loaded = false;
    this.state = emptyState();
    this.dashboard = undefined;
    this.pages = [];
    this.storePreference();
    return this.loadView("/");
  }
  async loadMore(page: PageInfo) {
    if (!this.vehicleId || !page.cursor) return this.snapshot();
    const epoch = this.vehicleEpoch,
      sequence = this.viewSequence,
      out = await this.json(
        "/v3/vehicles/" +
          encodeURIComponent(this.vehicleId) +
          "/list/" +
          page.table +
          "?" +
          new URLSearchParams({
            cursor: page.cursor,
            filter: page.filter ?? "",
          }),
      );
    if (epoch !== this.vehicleEpoch) throw Error("Fahrzeug wurde gewechselt.");
    if (sequence !== this.viewSequence)
      throw Error("Ansicht wurde gewechselt.");
    if (out.revision !== undefined && out.revision !== this.revision)
      return this.loadView();
    for (const [table, items] of Object.entries({
      ...out.related,
      [page.table]: out.rows,
    })) {
      const t = table as keyof typeof this.state,
        old = new Map((this.state[t] as any[]).map((r) => [r.id, r]));
      for (const r of items as any[]) old.set(r.id, r);
      (this.state[t] as any[]) = [...old.values()];
    }
    this.pages = this.pages.map((p) => (p.table === page.table ? out.page : p));
    return this.snapshot();
  }
  async thumbnail(doc: Doc) {
    const epoch = this.epoch,
      vehicleEpoch = this.vehicleEpoch,
      id = this.vehicleId;
    if (!id) throw Error("Fahrzeug fehlt.");
    return timed("Bildvorschau", () =>
      cachedThumbnail(
        this.accountId,
        doc.sha256!,
        async () => {
          const response = await this.request(
            "/v3/vehicles/" +
              id +
              "/documents/" +
              encodeURIComponent(doc.id) +
              "/thumbnail",
          );
          if (!response.ok)
            throw Error("Bildvorschau konnte nicht geladen werden.");
          return response.blob();
        },
        () =>
          !this.closed &&
          this.epoch === epoch &&
          this.vehicleEpoch === vehicleEpoch,
      ),
    );
  }
  private apply(out: MutationReply, accountScope: boolean) {
    if (!accountScope && out.revision < this.revision) return;
    for (const t of tables) {
      const old = new Map((this.state[t] as any[]).map((r) => [r.id, r]));
      for (const id of out.removed?.[t] ?? []) old.delete(id);
      for (const r of out.changes?.[t] ?? []) old.set(r.id, r);
      (this.state[t] as any[]) = [...old.values()];
    }
    if (out.vehicle && this.fleet) {
      const n = this.fleet.vehicles.findIndex((v) => v.id === out.vehicle!.id);
      if (n < 0) this.fleet.vehicles.push(out.vehicle);
      else this.fleet.vehicles[n] = out.vehicle;
      if (out.vehicle.id === this.vehicleId)
        this.state.Vehicles = [out.vehicle.vehicle];
    }
    if (out.settings && this.fleet) {
      this.fleet.settings = out.settings;
      this.state.Settings = [
        {
          ...out.settings,
          hidden_categories: this.state.Settings[0].hidden_categories,
        },
      ];
    }
    if (this.fleet) this.fleet.settingsRevision = out.settingsRevision;
    if (!accountScope) this.revision = out.revision;
  }
  private async send(
    name: string,
    arg: any,
    path: string,
    accountScope = false,
  ) {
    const key = hash(canonical({ name, arg, path }));
    let pending = this.pending.get(key);
    if (!pending) {
      pending = {
        operation: arg.operation_id ?? crypto.randomUUID(),
        arg: {
          ...arg,
          expected_revision: accountScope
            ? this.fleet?.settingsRevision
            : this.revision,
        },
      };
      this.pending.set(key, pending);
    }
    const epoch = this.vehicleEpoch;
    let out: any;
    try {
      out = await this.json(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": pending.operation,
        },
        body: JSON.stringify(pending.arg),
      });
    } catch (error) {
      if (error instanceof ServiceError && error.status === 409)
        this.pending.delete(key);
      throw error;
    }
    if (epoch !== this.vehicleEpoch) throw Error("Fahrzeug wurde gewechselt.");
    this.pending.delete(key);
    if (out.changes) this.apply(out, accountScope);
    if (out.result?.reload) {
      await this.bootstrap();
      if (this.vehicleId) await this.loadView();
    }
    return out;
  }
  async call<T = any>(name: string, arg: any = {}): Promise<T> {
    if (name === "read") {
      if (arg.fresh) return (await this.loadView()) as T;
      return (this.loaded ? this.snapshot() : await this.bootstrap()) as T;
    }
    if (name === "export")
      return this.json(
        "/v3/" +
          (arg.account ? "account" : "vehicles/" + this.vehicleId) +
          "/export",
      );
    if (name === "document") {
      const epoch = this.vehicleEpoch,
        response = await this.request(
          "/v3/vehicles/" +
            (arg.vehicle_id ?? this.vehicleId) +
            "/documents/" +
            encodeURIComponent(arg.id) +
            "/original",
        );
      if (!response.ok)
        throw Error("Originaldatei konnte nicht geladen werden.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (epoch !== this.vehicleEpoch)
        throw Error("Fahrzeug wurde gewechselt.");
      const d = this.state.Documents.find((d) => d.id === arg.id);
      return {
        base64: bytesBase64(bytes),
        source_filename: d?.source_filename ?? "Original",
        mime: response.headers.get("Content-Type"),
        size: bytes.length,
        sha256: d?.sha256,
      } as T;
    }
    if (name === "upload" || name === "restoreUpload") {
      const epoch = this.vehicleEpoch,
        f = arg.file as UploadFile,
        blob = new Blob([base64Bytes(f.base64)], { type: f.mime }),
        data = new FormData();
      data.set("original", blob, f.source_filename);
      data.set("sha256", f.sha256);
      data.set("operation_id", arg.operation_id ?? "restore-" + arg.restore_id);
      if (arg.restore_id) data.set("restore_id", arg.restore_id);
      if (f.mime.startsWith("image/"))
        data.set("thumbnail", await makeThumbnail(blob), "thumbnail.webp");
      const id = arg.vehicle_id ?? this.vehicleId;
      if (!id) throw Error("Bitte zuerst ein Fahrzeug anlegen.");
      const out = await this.json("/v3/vehicles/" + id + "/files", {
        method: "POST",
        body: data,
      });
      if (epoch !== this.vehicleEpoch)
        throw Error("Fahrzeug wurde gewechselt.");
      return out.result;
    }
    const shared =
      name === "edit" &&
      arg.table === "Settings" &&
      !Object.keys(arg.patch).includes("hidden_categories");
    const accountScope =
      shared ||
      ["createVehicle", "testMail", "backup"].includes(name) ||
      arg.account === true;
    const actionName = shared ? "settings" : name,
      path = accountScope
        ? "/v3/account/" + actionName
        : "/v3/vehicles/" + this.vehicleId + "/actions/" + actionName;
    const out = await timed("Speichern", () =>
      this.send(name, arg, path, accountScope),
    );
    if (name === "createVehicle" && out.result?.id) {
      await this.selectVehicle(out.result.id);
    }
    return out.result as T;
  }
  fuelStatus() {
    return this.json("/v3/fuel/status") as Promise<FuelStatus>;
  }
  searchFuel(query: FuelQuery, signal?: AbortSignal) {
    return this.json("/v3/fuel/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
      signal,
    }) as Promise<FuelResult>;
  }
}
