/**
 * Applies supabase/migrations/*.sql in filename order against SUPABASE_DB_URL,
 * tracking what already ran in a schema_migrations table. Each migration runs
 * in its own transaction. Replaces the Supabase CLI (which needs Docker) for
 * this project.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set — see .env.example");
  process.exit(1);
}

const migrationsDir = join(import.meta.dirname, "..", "supabase", "migrations");

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(`
      create table if not exists public.schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      );
      alter table public.schema_migrations enable row level security;
    `);

    const applied = new Set(
      (await client.query("select name from public.schema_migrations")).rows.map(
        (r: { name: string }) => r.name,
      ),
    );

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip   ${file}`);
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      process.stdout.write(`apply  ${file} ... `);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into public.schema_migrations (name) values ($1)",
          [file],
        );
        await client.query("commit");
        console.log("ok");
      } catch (err) {
        await client.query("rollback");
        console.log("FAILED");
        throw err;
      }
    }
    console.log("migrations up to date");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
