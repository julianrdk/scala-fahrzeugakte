import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  putObject,
  readObject,
  uploadParts,
  webpSize,
} from "../auth/src/v2/files";
import { hashBytes } from "../shared/logic";
import { pdf, png, setupFleet, webp } from "./fleet-fixture";
let c: Awaited<ReturnType<typeof setupFleet>>;
beforeEach(async () => {
  c = await setupFleet();
});
afterEach(() => {
  c.sql.close();
  vi.restoreAllMocks();
});
describe("Dateiquoten, Signaturen und unveränderte Originale", () => {
  it("reserviert die globale Quote atomar bei parallelen Uploads", async () => {
    c.sql
      .prepare("UPDATE record_usage SET bytes=7999999996 WHERE scope='global'")
      .run();
    const result = await Promise.allSettled([
      putObject(
        c.env,
        "user_a",
        "one",
        new Uint8Array([1, 2, 3]),
        "application/pdf",
        "one",
        "original",
      ),
      putObject(
        c.env,
        "user_b",
        "two",
        new Uint8Array([4, 5, 6]),
        "application/pdf",
        "two",
        "original",
      ),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        c.sql
          .prepare("SELECT bytes FROM record_usage WHERE scope='global'")
          .get() as any
      ).bytes,
    ).toBe(7999999999);
  });
  it("gibt Originale nach einer Inhaltsänderung nicht ungeprüft aus", async () => {
    await c.file();
    [...c.objects.values()][0].bytes = new Uint8Array([1, 2]);
    await expect(readObject(c.env, "user_a", hashBytes(pdf))).rejects.toThrow(
      /prüfsumme/,
    );
  });
  it("gibt Dateien nie an ein anderes Konto aus", async () => {
    await c.file();
    await expect(readObject(c.env, "user_b", hashBytes(pdf))).rejects.toThrow(
      /fehlt/,
    );
  });
  it("verwendet bereits bestätigte Vorschauen bei anderem Browser-Encoder wieder", async () => {
    const a = await putObject(
        c.env,
        "user_a",
        "thumb-example",
        webp,
        "image/webp",
        "example",
        "thumbnail",
      ),
      b = await putObject(
        c.env,
        "user_a",
        "thumb-example",
        new Uint8Array([1, 2]),
        "image/webp",
        "example",
        "thumbnail",
      );
    expect(a.sha256).toBe(b.sha256);
  });
  it("prüft WebP-Abmessungen und verwirft übergroße oder ungültige Daten", () => {
    expect(webpSize(webp)).toBe(true);
    const invalid = new Uint8Array(webp);
    invalid[26] = 255;
    invalid[27] = 31;
    expect(webpSize(invalid)).toBe(false);
    expect(webpSize(new Uint8Array([1, 2, 3]))).toBe(false);
  });
  it.each([
    ["application/pdf", png],
    ["image/png", pdf],
    ["image/jpeg", pdf],
  ])("weist falsche Signatur für %s ab", async (mime, bytes) => {
    await expect(
      c.file(c.a1, new Uint8Array(bytes as Uint8Array), mime as string),
    ).rejects.toThrow(/Dateiinhalt/);
  });
  it("verweigert Bilder ohne kleine Vorschau", async () => {
    const data = new FormData();
    data.set("original", new Blob([png], { type: "image/png" }), "auto.png");
    data.set("operation_id", crypto.randomUUID());
    data.set("sha256", hashBytes(png));
    await expect(
      uploadParts(
        new Request("https://car.jurodak.com/api/files", {
          method: "POST",
          body: data,
        }),
      ),
    ).rejects.toThrow(/Vorschau/);
  });
  it("verweigert unverträgliche Wiederholung eines Dateivorgangs", async () => {
    await putObject(
      c.env,
      "user_a",
      "example",
      pdf,
      "application/pdf",
      "example",
      "original",
    );
    await expect(
      putObject(
        c.env,
        "user_a",
        "example",
        new Uint8Array([1]),
        "application/pdf",
        "example",
        "original",
      ),
    ).rejects.toThrow(/anderen Daten/);
  });
});
