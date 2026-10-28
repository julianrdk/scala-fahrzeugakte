import fs from "node:fs";
import { accountAction, mutate } from "../auth/src/fleet/actions";
import { upload } from "../auth/src/fleet/files";
import { fleetAccount, migrateLegacy, vehicle } from "../auth/src/fleet/store";
import { createAccount } from "../auth/src/v2/store";
import { hashBytes } from "../shared/logic";
import { setupV2 } from "./v2-mock";
export const pdf = new TextEncoder().encode("%PDF-1.4\nSYNTHETIC ORIGINAL");
export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9xkAAAAASUVORK5CYII=",
  "base64",
);
export const webp = Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
  "base64",
);
export async function setupFleet() {
  const c = setupV2();
  c.sql.exec(fs.readFileSync("auth/migrations/0003-fleet.sql", "utf8"));
  c.env.AUTOMATION_ENABLED = "true";
  for (const owner of ["user_a", "user_b"]) {
    await createAccount(c.env, owner, owner + "@example.invalid");
    await migrateLegacy(c.env, owner);
  }
  const a = async (owner = "user_a") => (await fleetAccount(c.env, owner))!;
  async function add(owner: string, model: string) {
    const account = await a(owner);
    return (
      await accountAction(
        c.env,
        account,
        "createVehicle",
        { manufacturer: "Test", model, expected_revision: account.revision },
        crypto.randomUUID(),
      )
    ).vehicle!.id;
  }
  const a1 = await add("user_a", "Erstes Auto"),
    a2 = await add("user_a", "Zweites Auto"),
    b1 = await add("user_b", "Erstes fremdes Auto"),
    b2 = await add("user_b", "Zweites fremdes Auto");
  async function write(
    id: string,
    name: string,
    arg: any,
    owner = "user_a",
    operation = crypto.randomUUID(),
  ) {
    const ac = await a(owner),
      v = await vehicle(c.env, ac, id);
    return mutate(
      c.env,
      ac,
      id,
      name,
      { expected_revision: v.revision, ...arg },
      operation,
    );
  }
  async function file(
    id = a1,
    bytes = pdf,
    mime = "application/pdf",
    restoreId = "",
    owner = "user_a",
  ): Promise<any> {
    const data = new FormData();
    data.set(
      "original",
      new Blob([bytes], { type: mime }),
      mime === "application/pdf" ? "Rechnung.pdf" : "Auto.png",
    );
    data.set("sha256", hashBytes(bytes));
    data.set("operation_id", crypto.randomUUID());
    if (mime.startsWith("image/"))
      data.set(
        "thumbnail",
        new Blob([webp], { type: "image/webp" }),
        "thumbnail.webp",
      );
    if (restoreId) data.set("restore_id", restoreId);
    return upload(
      c.env,
      await a(owner),
      id,
      new Request("https://car.jurodak.com/api/v3/vehicles/" + id + "/files", {
        method: "POST",
        body: data,
      }),
    );
  }
  return { ...c, a, a1, a2, b1, b2, add, write, file };
}
