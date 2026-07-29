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
  // 30s, not 15: long enough that layout/media assertions can run before the
  // date ends on its own, short enough to keep the suite quick.
  await client.query(
    "update app_config set date_duration_seconds = 30, decision_window_seconds = 60",
  );
  // A full suite run creates far more accounts from one IP than any real
  // person would, so it trips our own signup limiter. Reset that bucket for
  // the local runner only — production limits are untouched.
  await client.query(
    "delete from rate_limits where bucket_key like 'signup:ip:%'",
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
