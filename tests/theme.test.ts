import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast, vehicleColors, vehicleTheme } from "../src/theme";
import { emptyState, validateState, editEntity } from "../shared/logic";
describe("Fahrzeugfarben und alte Sicherungen", () => {
  it.each([
    ...vehicleColors.map(([name, color]): [string, string] => [name, color]),
    ["freies Weiß", "#ffffff"],
    ["freies Schwarz", "#000000"],
    ["frei", "#00eeff"],
  ])("hält ausreichenden Textkontrast für %s", (_name, color) => {
    const theme = vehicleTheme(color);
    expect(contrast(theme["--accent"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(theme["--accent-ink"], theme["--accent-soft"]),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(theme["--accent-ink"], theme["--accent-surface"]),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme["--accent-ink"], "#ffffff")).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(theme["--green"], "#f5f6f2")).toBeGreaterThanOrEqual(4.5);
  });
  it("verwendet ohne Farbe das bisherige Grün und akzeptiert veraltete Vorlagen nur lesend", () => {
    expect(vehicleColors).toHaveLength(12);
    expect(vehicleTheme()["--accent"]).toBe("#19644b");
    expect(vehicleTheme(null)).toEqual(vehicleTheme());
    expect(vehicleTheme("invalid")).toEqual(vehicleTheme());
    const state = emptyState();
    state.Settings[0].prompt_templates = { maintenance: "Historische Vorlage" };
    expect(() => validateState(state)).not.toThrow();
    const setting = state.Settings[0];
    expect(() =>
      editEntity(
        state,
        "Settings",
        setting.id,
        setting.revision,
        { prompt_templates: { maintenance: "Neu" } },
        new Date().toISOString(),
      ),
    ).toThrow();
    delete state.Settings[0].prompt_templates;
    expect(() => validateState(state)).not.toThrow();
  });
  it("erlaubt exakt den verwendeten Kachelhost in der veröffentlichten Sicherheitsrichtlinie", () => {
    const headers = fs.readFileSync("public/_headers", "utf8"),
      generator = fs.readFileSync("scripts/security.mjs", "utf8");
    expect(headers).toContain("https://tile.openstreetmap.org");
    expect(generator).toContain("https://tile.openstreetmap.org");
    expect(headers).toContain("Referrer-Policy: no-referrer");
    expect(headers).not.toContain("https://*.tile.openstreetmap.org");
  });
});
