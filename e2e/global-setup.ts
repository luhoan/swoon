/**
 * Shortens the date/decision windows so the E2E run doesn't wait three real
 * minutes, and generates avatar fixtures. Restored in global-teardown.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import sharp from "sharp";
import { config } from "dotenv";

export default async function globalSetup() {
  config({ path: [".env.local", ".env"] });

  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  await client.query(
    "update app_config set date_duration_seconds = 15, decision_window_seconds = 60",
  );
  await client.end();

  const dir = join(process.cwd(), "e2e", ".fixtures");
  mkdirSync(dir, { recursive: true });
  await Promise.all(
    (
      [
        ["avatar-a.jpg", { r: 217, g: 132, b: 143 }],
        ["avatar-b.jpg", { r: 77, g: 119, b: 157 }],
      ] as const
    ).map(([name, background]) =>
      sharp({ create: { width: 320, height: 320, channels: 3, background } })
        .jpeg()
        .toFile(join(dir, name)),
    ),
  );
}
