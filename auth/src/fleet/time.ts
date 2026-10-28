export function nextRun(at: number) {
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
  }).format(at);
  for (let i = 0; i < 3; i++) {
    const day = new Date(Date.parse(date + "T12:00:00Z") + i * 86400000)
      .toISOString()
      .slice(0, 10);
    for (const h of [6, 7]) {
      const t = Date.parse(day + "T0" + h + ":00:00Z");
      if (
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Berlin",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(t) === "08" &&
        t > at
      )
        return t;
    }
  }
  throw Error("Nächste Tagesprüfung fehlt.");
}
