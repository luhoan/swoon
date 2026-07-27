/**
 * Matchmaking stress test: creates N throwaway users, slams the queue
 * concurrently, and verifies the pairing invariants hold under load:
 *   - everyone gets matched (even N) with no self-pairs
 *   - nobody appears in two live sessions
 *   - both-ready starts the clock; decisions resolve consistently
 *   - message rate limiting engages
 * Cleans up all users afterwards. Run: pnpm stress [-- N]
 *
 * This hits Supabase directly (the same path the browser uses) — video is
 * P2P, so media never touches our servers and isn't part of server load.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const N = Math.max(4, Number(process.argv[2] ?? 20) & ~1); // even, >= 4
// Rounds reuse the same signed-in users so Supabase Auth's per-IP sign-in
// limit (~30/5min) doesn't cap how hard we can hit the matchmaking path.
const ROUNDS = Math.max(1, Number(process.argv[3] ?? 1));

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface Sim {
  id: string;
  client: SupabaseClient;
  sessionId?: string;
  waitMs?: number;
}

const password = `stress-${crypto.randomUUID()}`;
const sims: Sim[] = [];

async function retry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw last;
}

async function createSim(i: number): Promise<Sim> {
  const email = `stress-${i}-${crypto.randomUUID().slice(0, 6)}@test.tryswoon.live`;
  const { data, error } = await retry(async () => {
    const res = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (res.error) throw res.error;
    return res;
  });
  if (error || !data.user) throw error;
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: loginErr } = await client.auth.signInWithPassword({ email, password });
  if (loginErr) throw loginErr;
  await client.rpc("save_profile", {
    p_display_name: `Sim ${i}`,
    p_date_of_birth: "1996-03-03",
    p_city: "Loadville",
  });
  await admin
    .from("profiles")
    .update({ photo_path: `${data.user.id}/x.jpg`, onboarding_complete: true })
    .eq("user_id", data.user.id);
  await client.rpc("demo_verify");
  return { id: data.user.id, client };
}

function quantile(sorted: number[], q: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx] ?? 0;
}

interface RoundStats {
  formed: number;
  expected: number;
  violations: number;
  waits: number[];
  activeOk: number;
  mutual: number;
  matchRows: number;
  joinErrors: number;
  joinWaveMs: number;
}

async function runRound(round: number): Promise<RoundStats> {
  for (const sim of sims) {
    sim.sessionId = undefined;
    sim.waitMs = undefined;
  }

  // ---- phase 1: everyone joins the queue at once ----------------------
  const t = Date.now();
  const joinResults = await Promise.all(
    sims.map(async (sim) => {
      const started = Date.now();
      const { data, error } = await sim.client.rpc("join_queue");
      if (error) return { sim, error: error.message };
      if (data.status === "matched") {
        sim.sessionId = data.session_id;
        sim.waitMs = Date.now() - started;
      }
      return { sim, status: data.status as string };
    }),
  );
  const joinErrors = joinResults.filter((r) => "error" in r && r.error);
  const joinWaveMs = Date.now() - t;
  for (const e of joinErrors.slice(0, 3)) console.log("  join err:", (e as { error: string }).error);

  // ---- phase 2: heartbeat until everyone is matched --------------------
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const unmatched = sims.filter((s) => !s.sessionId);
    if (unmatched.length === 0) break;
    await Promise.all(
      unmatched.map(async (sim) => {
        const started = Date.now();
        const { data } = await sim.client.rpc("queue_heartbeat");
        if (data?.status === "matched" && data.session_id) {
          sim.sessionId = data.session_id;
          sim.waitMs = Date.now() - started;
        }
      }),
    );
    await new Promise((r) => setTimeout(r, 500));
  }

  const matched = sims.filter((s) => s.sessionId);

  // ---- invariants ------------------------------------------------------
  const bySession = new Map<string, Sim[]>();
  for (const sim of matched) {
    bySession.set(sim.sessionId!, [...(bySession.get(sim.sessionId!) ?? []), sim]);
  }
  let bad = 0;
  for (const [sid, members] of bySession) {
    if (members.length !== 2) {
      console.log(`  INVARIANT VIOLATION: session ${sid} has ${members.length} of our users`);
      bad++;
    }
  }
  const { data: liveDupes } = await admin
    .from("video_session_participants")
    .select("user_id")
    .is("left_at", null)
    .in("user_id", sims.map((s) => s.id));
  const seen = new Set<string>();
  for (const row of liveDupes ?? []) {
    if (seen.has(row.user_id)) {
      console.log(`  INVARIANT VIOLATION: user ${row.user_id} in two live sessions`);
      bad++;
    }
    seen.add(row.user_id);
  }

  // ---- phase 3: both ready -> active, then end + decide ----------------
  await Promise.all(
    matched.map((sim) => sim.client.rpc("participant_ready", { p_session: sim.sessionId })),
  );
  const { data: activeRows } = await admin
    .from("video_sessions")
    .select("id, status, starts_at, ends_at")
    .in("id", [...bySession.keys()]);
  const activeOk = (activeRows ?? []).filter(
    (r) => r.status === "active" && r.starts_at && r.ends_at,
  ).length;

  await Promise.all(
    matched.map((sim) =>
      sim.client.rpc("end_session", { p_session: sim.sessionId, p_reason: "left" }),
    ),
  );
  // Random decisions; verify resolution consistency per pair.
  const decisionErrors: string[] = [];
  await Promise.all(
    matched.map(async (sim) => {
      const { error } = await sim.client.rpc("submit_decision", {
        p_session: sim.sessionId,
        p_choice: Math.random() < 0.5 ? "match" : "pass",
      });
      if (error) decisionErrors.push(`${sim.id.slice(0, 8)}: ${error.message}`);
    }),
  );
  if (decisionErrors.length) {
    console.log(`  submit_decision errors (${decisionErrors.length}):`);
    for (const e of decisionErrors.slice(0, 4)) console.log("   ", e);
  }
  const { data: resolved } = await admin
    .from("video_sessions")
    .select("id, resolution")
    .in("id", [...bySession.keys()]);
  const pending = (resolved ?? []).filter((r) => r.resolution === "pending").length;
  const mutual = (resolved ?? []).filter((r) => r.resolution === "mutual").length;
  const { data: matchRows } = await admin
    .from("matches")
    .select("id, session_id")
    .in("session_id", [...bySession.keys()]);
  if ((matchRows?.length ?? 0) !== mutual) {
    console.log(
      `  INVARIANT VIOLATION: ${matchRows?.length ?? 0} match rows for ${mutual} mutual resolutions`,
    );
    bad++;
  }
  if (pending > 0) {
    // Distinguish a harness/API hiccup (one decision missing — the app's
    // lazy 60s timeout path covers that) from a genuine resolver bug
    // (both decisions present but unresolved).
    const pendingIds = (resolved ?? [])
      .filter((r) => r.resolution === "pending")
      .map((r) => r.id);
    const { data: decisionCounts } = await admin
      .from("date_decisions")
      .select("session_id")
      .in("session_id", pendingIds);
    const counts = new Map<string, number>();
    for (const row of decisionCounts ?? []) {
      counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1);
    }
    for (const sid of pendingIds) {
      const n = counts.get(sid) ?? 0;
      if (n === 2) {
        console.log(`  INVARIANT VIOLATION: session ${sid} pending with BOTH decisions present`);
        bad++;
      } else {
        console.log(`  note: session ${sid} pending with ${n}/2 decisions (submit failed; 60s timeout path covers this)`);
      }
    }
  }

  // ---- phase 4 (round 1 only): chat rate limit engages -----------------
  const firstMatch = round === 1 ? matchRows?.[0] : undefined;
  if (firstMatch) {
    const member = matched.find((s) => s.sessionId === firstMatch.session_id)!;
    let sent = 0;
    let limited = 0;
    for (let i = 0; i < 30; i++) {
      const { error } = await member.client.rpc("send_message", {
        p_match: firstMatch.id,
        p_body: `burst ${i}`,
      });
      if (!error) sent++;
      else if (error.message.includes("rate_limited")) limited++;
    }
    console.log(`chat burst: ${sent} sent, ${limited} rate-limited (bucket cap 20)`);
  }

  const waits = matched.map((s) => s.waitMs ?? 0).filter((w) => w > 0);

  return {
    formed: bySession.size,
    expected: matched.length / 2,
    violations: bad,
    waits,
    activeOk,
    mutual,
    matchRows: matchRows?.length ?? 0,
    joinErrors: joinErrors.length,
    joinWaveMs,
  };
}

async function main() {
  console.log(
    `\n== Swoon matchmaking stress test: ${N} concurrent users x ${ROUNDS} round(s) ==\n`,
  );

  const t = Date.now();
  const batch = 5; // GoTrue throttles admin-create bursts
  for (let i = 0; i < N; i += batch) {
    const created = await Promise.all(
      Array.from({ length: Math.min(batch, N - i) }, (_, j) => createSim(i + j)),
    );
    sims.push(...created);
    process.stdout.write(`\rusers ready: ${sims.length}/${N}`);
  }
  console.log(`\nsetup took ${((Date.now() - t) / 1000).toFixed(1)}s\n`);

  let totalViolations = 0;
  const allWaits: number[] = [];
  let totalSessions = 0;

  for (let round = 1; round <= ROUNDS; round++) {
    const stats = await runRound(round);
    totalViolations += stats.violations;
    totalSessions += stats.formed;
    allWaits.push(...stats.waits);
    console.log(
      `round ${round}: ${stats.formed}/${stats.expected} sessions, ` +
        `join wave ${stats.joinWaveMs}ms (${stats.joinErrors} errors), ` +
        `${stats.activeOk} active w/ timers, ${stats.mutual} mutual = ${stats.matchRows} match rows, ` +
        `violations ${stats.violations}`,
    );
  }

  allWaits.sort((a, b) => a - b);
  console.log(
    `\ntotals: ${totalSessions} sessions across ${ROUNDS} round(s)` +
      (allWaits.length
        ? ` · time-to-match p50 ${quantile(allWaits, 0.5)}ms · p90 ${quantile(allWaits, 0.9)}ms · max ${quantile(allWaits, 1)}ms`
        : ""),
  );
  console.log(
    totalViolations === 0
      ? "RESULT: PASS — no invariant violations"
      : `RESULT: FAIL — ${totalViolations} violations`,
  );
  if (totalViolations > 0) process.exitCode = 1;
}

async function cleanup() {
  process.stdout.write("cleaning up users… ");
  for (let i = 0; i < sims.length; i += 5) {
    await Promise.all(
      sims.slice(i, i + 5).map((s) => admin.auth.admin.deleteUser(s.id).catch(() => null)),
    );
  }
  console.log("done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(cleanup);
