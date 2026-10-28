import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc } from "../shared/types";
import { PhotoSession } from "../src/PhotoSession";
import type { Adapter } from "../src/adapter";
let adapter: Adapter, replies: ((value: any) => void)[];
const doc = (id: string) => ({ id, sha256: id }) as Doc;
beforeEach(() => {
  replies = [];
  adapter = {
    kind: "test",
    call: vi.fn(() => new Promise((resolve) => replies.push(resolve))) as any,
  };
  let n = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(
    () => "blob:synthetic-" + ++n,
  );
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal("createImageBitmap", async () => ({
    width: 400,
    height: 200,
    close() {},
  }));
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ fillRect() {}, drawImage() {} }),
      toBlob: (callback: any) => callback(new Blob(["thumbnail"])),
    }),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const image = {
  mime: "image/jpeg",
  base64: Buffer.from("test").toString("base64"),
};
describe("Private Bildvorschau und Sitzungswechsel", () => {
  it("lädt höchstens zwei Originale gleichzeitig und verwendet Vorschauen innerhalb der Sitzung wieder", async () => {
    const session = new PhotoSession(adapter),
      a = session.thumbnail(doc("a")),
      again = session.thumbnail(doc("a")),
      b = session.thumbnail(doc("b")),
      c = session.thumbnail(doc("c"));
    expect(a).toBe(again);
    expect(adapter.call).toHaveBeenCalledTimes(2);
    replies[0](image);
    await a;
    await vi.waitFor(() => expect(adapter.call).toHaveBeenCalledTimes(3));
    replies[1](image);
    replies[2](image);
    await Promise.all([b, c]);
    expect(await session.thumbnail(doc("a"))).toBe(await a);
    expect(adapter.call).toHaveBeenCalledTimes(3);
    session.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
  });
  it("verwirft verspätete Antworten nach Abmeldung statt sie im nächsten Konto anzuzeigen", async () => {
    const session = new PhotoSession(adapter),
      old = session.thumbnail(doc("a"));
    const rejected = expect(old).rejects.toThrow(/beendet/);
    session.dispose();
    replies[0](image);
    await rejected;
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    const next = new PhotoSession(adapter),
      fresh = next.thumbnail(doc("a"));
    expect(adapter.call).toHaveBeenCalledTimes(2);
    replies[1](image);
    await fresh;
    next.dispose();
  });
  it("lässt einen fehlgeschlagenen Bildabruf bewusst wiederholen", async () => {
    vi.mocked(adapter.call).mockRejectedValueOnce(Error("offline"));
    const session = new PhotoSession(adapter);
    await expect(session.thumbnail(doc("a"))).rejects.toThrow("offline");
    const retry = session.thumbnail(doc("a"));
    replies[0](image);
    expect(await retry).toMatch(/^blob:/);
    session.dispose();
  });
});
