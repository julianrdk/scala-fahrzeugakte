import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VehicleSetup } from "../src/VehicleSetup";
describe("Neutrale Anmelde- und Fahrzeugansichten", () => {
  it("fragt Hersteller und Modell ohne vorausgefülltes Fahrzeug ab", () => {
    const html = renderToStaticMarkup(
      <VehicleSetup
        busy={false}
        error=""
        onSave={() => {}}
        onLogout={() => {}}
      />,
    );
    expect(html).toContain("Fahrzeug hinzufügen");
    expect(html).toContain('name="manufacturer"');
    expect(html).toContain('name="model"');
    expect(html).not.toMatch(/Scala|Škoda|value="Volkswagen"/);
  });
});
