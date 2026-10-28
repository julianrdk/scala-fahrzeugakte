import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyState, meta } from "../shared/logic";
import { VehicleHero } from "../src/Gallery";
import { PhotoProvider } from "../src/PhotoSession";
afterEach(() => vi.unstubAllGlobals());
function render(count: number, small = false) {
  vi.stubGlobal("matchMedia", () => ({ matches: small }));
  const s = emptyState("2026-10-26T12:00:00Z");
  s.Vehicles[0].manufacturer = "Test";
  s.Vehicles[0].model = "Fahrzeug";
  s.Documents = Array.from({ length: count }, (_, i) => ({
    ...meta("image-" + i, "2026-10-26T12:00:00Z"),
    ref: "p" + i,
    title: "Testfoto " + i,
    source_filename: "test.jpg",
    document_type: "photo" as const,
    sha256: "a".repeat(64),
    size: 1,
    mime: "image/jpeg",
    drive_id: "test",
    missing: false,
  }));
  s.Vehicles[0].photo_id = count ? "image-" + (count - 1) : null;
  return renderToStaticMarkup(
    <PhotoProvider
      adapter={{ kind: "test", call: async () => undefined as any }}
      accountKey="test"
    >
      <VehicleHero s={s} />
    </PhotoProvider>,
  );
}
describe("Pinnwand: Bildanzahl, Standard und mobile Darstellung", () => {
  it("zeigt ohne Fotos das Symbolbild", () => {
    const html = render(0);
    expect(html).toContain("Fahrzeugsymbol");
    expect(html).not.toContain("pinboard-board");
  });
  it.each([1, 3, 10, 11])(
    "zeigt bei %i Bildern höchstens zehn und hebt den gewählten Standard zuerst hervor",
    (count) => {
      const html = render(count);
      expect((html.match(/groß ansehen/g) ?? []).length).toBe(
        Math.min(count, 10),
      );
      expect(
        html.indexOf("Testfoto " + (count - 1) + " groß ansehen"),
      ).toBeLessThan(
        html.indexOf("Testfoto 0 groß ansehen") === -1
          ? Infinity
          : html.indexOf("Testfoto 0 groß ansehen") + 1,
      );
      expect(html.includes("+ 1 weitere")).toBe(count === 11);
    },
  );
  it("zeigt mobil vier Bilder und verweist für den Rest auf die Galerie", () => {
    const html = render(11, true);
    expect((html.match(/groß ansehen/g) ?? []).length).toBe(4);
    expect(html).toContain("+ 7 weitere");
    expect(html).toContain("#/fahrzeug/galerie");
  });
});
