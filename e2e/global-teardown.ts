import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

export default async function globalTeardown() {
  config({ path: [".env.local", ".env"] });
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  await client.query(
    "update app_config set date_duration_seconds = 180, decision_window_seconds = 60",
  );
  await client.end();

  // Remove the throwaway accounts the suite created.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const user of data?.users ?? []) {
    if (/^e2e-.*@test\.tryswoon\.live$/.test(user.email ?? "")) {
      await admin.auth.admin.deleteUser(user.id).catch(() => null);
    }
  }
}
