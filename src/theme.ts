export const vehicleColors = [
  ["Weiß", "#f3f2ed"],
  ["Silber", "#bcc1c6"],
  ["Grau", "#70777d"],
  ["Schwarz", "#25282c"],
  ["Blau", "#3266a2"],
  ["Rot", "#b73743"],
  ["Grün", "#477351"],
  ["Gelb", "#d6b62c"],
  ["Orange", "#cf7435"],
  ["Braun", "#87654e"],
  ["Violett", "#795c93"],
  ["Beige", "#c5b18b"],
] as const;
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (values: number[]) =>
  "#" + values.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
function mix(a: string, b: string, amount: number) {
  const x = rgb(a),
    y = rgb(b);
  return hex(x.map((v, i) => v * (1 - amount) + y[i] * amount));
}
export function luminance(color: string) {
  const [r, g, b] = rgb(color).map((v) => {
    const n = v / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function vehicleTheme(color?: string | null): Record<string, string> {
  const base = color && /^#[a-f0-9]{6}$/i.test(color) ? color : "#19644b";
  let accent = base;
  for (let i = 1; contrast(accent, "#ffffff") < 4.5 && i <= 100; i++)
    accent = mix(base, "#000000", i / 100);
  const soft = mix(base, "#ffffff", 0.9),
    surface = mix(base, "#ffffff", 0.85);
  let ink = accent;
  for (
    let i = 1;
    Math.min(
      contrast(ink, soft),
      contrast(ink, surface),
      contrast(ink, "#f5f6f2"),
    ) < 4.5 && i <= 100;
    i++
  )
    ink = mix(accent, "#000000", i / 100);
  return {
    "--green": ink,
    "--accent": accent,
    "--accent-hover": mix(accent, "#000000", 0.16),
    "--accent-soft": soft,
    "--accent-surface": surface,
    "--accent-line": mix(base, "#ffffff", 0.67),
    "--accent-ink": ink,
  };
}
