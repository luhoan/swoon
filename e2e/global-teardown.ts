import { Client } from "pg";
import { config } from "dotenv";

export default async function globalTeardown() {
  config({ path: [".env.local", ".env"] });
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  await client.query(
    "update app_config set date_duration_seconds = 180, decision_window_seconds = 60",
  );
  await client.end();
}
