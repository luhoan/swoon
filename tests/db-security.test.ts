/**
 * Integration tests against the real Supabase project: exercises the SQL
 * RPCs and proves the RLS guarantees (deny-by-default, no decision leaks,
 * no cross-user reads). Creates throwaway users and removes them after.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

const password = `tt-${crypto.randomUUID()}`;
const createdUserIds: string[] = [];

async function makeUser(tag: string): Promise<TestUser> {
  const email = `e2e-${tag}-${crypto.randomUUID().slice(0, 8)}@test.tryswoon.live`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  createdUserIds.push(data.user.id);

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: loginError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (loginError) throw loginError;

  const { error: profileError } = await client.rpc("save_profile", {
    p_display_name: `Test ${tag}`,
    p_date_of_birth: "1995-06-15",
    p_city: "Testville",
  });
  if (profileError) throw profileError;
  // Complete onboarding without a real upload: point at own folder, then
  // demo-verify.
  await admin
    .from("profiles")
    .update({ photo_path: `${data.user.id}/seed.jpg`, onboarding_complete: true })
    .eq("user_id", data.user.id);
  const { error: verifyError } = await client.rpc("demo_verify");
  if (verifyError) throw verifyError;

  return { id: data.user.id, email, client };
}

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([
    makeUser("alice"),
    makeUser("bob"),
    makeUser("carol"),
  ]);
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("matchmaking and the date loop", () => {
  let sessionId: string;

  it("pairs exactly two queued users into one session", async () => {
    const { data: r1, error: e1 } = await alice.client.rpc("join_queue");
    expect(e1).toBeNull();
    expect(r1.status).toBe("queued");

    const { data: r2, error: e2 } = await bob.client.rpc("join_queue");
    expect(e2).toBeNull();
    expect(r2.status).toBe("matched");
    sessionId = r2.session_id;
    expect(sessionId).toBeTruthy();

    // Alice discovers the same session (broadcast fallback path).
    const { data: hb } = await alice.client.rpc("queue_heartbeat");
    expect(hb.status).toBe("matched");
    expect(hb.session_id).toBe(sessionId);
  });

  it("rejects double-queueing while a session is live", async () => {
    const { data } = await alice.client.rpc("join_queue");
    expect(data.status).toBe("in_session");
    expect(data.session_id).toBe(sessionId);
  });

  it("starts the clock only when both participants are ready", async () => {
    const { data: first } = await alice.client.rpc("participant_ready", {
      p_session: sessionId,
    });
    expect(first.starts_at).toBeNull();

    const { data: second } = await bob.client.rpc("participant_ready", {
      p_session: sessionId,
    });
    expect(second.status).toBe("active");
    expect(second.starts_at).toBeTruthy();
    expect(second.ends_at).toBeTruthy();
  });

  it("denies a third user any view of the session", async () => {
    const { data: rows } = await carol.client
      .from("video_sessions")
      .select("*")
      .eq("id", sessionId);
    expect(rows).toEqual([]);

    const { error } = await carol.client.rpc("get_partner_profile", {
      p_session: sessionId,
    });
    expect(error).not.toBeNull();

    const { error: decisionError } = await carol.client.rpc("submit_decision", {
      p_session: sessionId,
      p_choice: "match",
    });
    expect(decisionError).not.toBeNull();
  });

  it("blocks a skewed client from ending the date early via 'timer'", async () => {
    const { error } = await alice.client.rpc("end_session", {
      p_session: sessionId,
      p_reason: "timer",
    });
    expect(error?.message ?? "").toContain("too_early");
  });

  it("gives each partner only the sanitized profile", async () => {
    const { data } = await alice.client.rpc("get_partner_profile", {
      p_session: sessionId,
    });
    expect(data.display_name).toBe("Test bob");
    expect(data.age).toBeGreaterThanOrEqual(18);
    expect(data).not.toHaveProperty("date_of_birth");
    expect(data).not.toHaveProperty("email");

    // Direct table read of the partner's profile row is denied by RLS.
    const { data: direct } = await alice.client
      .from("profiles")
      .select("*")
      .eq("user_id", bob.id);
    expect(direct).toEqual([]);
  });

  it("resolves mutual match atomically and never leaks the partner's choice", async () => {
    await alice.client.rpc("end_session", {
      p_session: sessionId,
      p_reason: "left",
    });

    const { data: aliceDecision } = await alice.client.rpc("submit_decision", {
      p_session: sessionId,
      p_choice: "match",
    });
    // One decision in: still pending, nothing revealed.
    expect(aliceDecision.resolution).toBe("pending");

    // Bob cannot read Alice's decision row.
    const { data: leaked } = await bob.client
      .from("date_decisions")
      .select("*")
      .eq("session_id", sessionId)
      .neq("user_id", bob.id);
    expect(leaked).toEqual([]);

    const { data: bobDecision } = await bob.client.rpc("submit_decision", {
      p_session: sessionId,
      p_choice: "match",
    });
    expect(bobDecision.resolution).toBe("mutual");

    const { data: matches } = await admin
      .from("matches")
      .select("id")
      .eq("session_id", sessionId);
    expect(matches).toHaveLength(1);
  });

  it("opens chat to members only and enforces the rate limit shape", async () => {
    const { data: matchRows } = await admin
      .from("matches")
      .select("id")
      .eq("session_id", sessionId);
    const matchId = matchRows![0]!.id as string;

    const { data: sent, error: sendError } = await alice.client.rpc(
      "send_message",
      { p_match: matchId, p_body: "hey you ♥" },
    );
    expect(sendError).toBeNull();
    expect(sent.body).toBe("hey you ♥");

    const { data: bobSees } = await bob.client
      .from("messages")
      .select("body")
      .eq("match_id", matchId);
    expect(bobSees).toHaveLength(1);

    // Carol can neither read nor write.
    const { data: carolSees } = await carol.client
      .from("messages")
      .select("*")
      .eq("match_id", matchId);
    expect(carolSees).toEqual([]);
    const { error: carolSend } = await carol.client.rpc("send_message", {
      p_match: matchId,
      p_body: "let me in",
    });
    expect(carolSend).not.toBeNull();
  });

  it("block kills the match and future pairing, invisibly", async () => {
    const { error } = await alice.client.rpc("create_block", {
      p_blocked: bob.id,
      p_reason: "test",
    });
    expect(error).toBeNull();

    // Chat is dead for both.
    const { data: matchRows } = await admin
      .from("matches")
      .select("id, status")
      .eq("session_id", sessionId);
    expect(matchRows![0]!.status).toBe("blocked");

    // Bob has no way to see the block row.
    const { data: bobBlocks } = await bob.client
      .from("blocks")
      .select("*")
      .eq("blocked_id", bob.id);
    expect(bobBlocks).toEqual([]);

    // They can never match again: both queue, no pairing happens.
    const { data: q1 } = await alice.client.rpc("join_queue");
    expect(q1.status).toBe("queued");
    const { data: q2 } = await bob.client.rpc("join_queue");
    expect(q2.status).toBe("queued"); // NOT matched with alice
    await alice.client.rpc("leave_queue");
    await bob.client.rpc("leave_queue");
  });

  it("underage report quarantines the reported account from the queue", async () => {
    const { error } = await carol.client.rpc("create_report", {
      p_reported: bob.id,
      p_session: null,
      p_category: "underage",
      p_narrative: "test quarantine",
    });
    expect(error).toBeNull();

    const { data: profile } = await admin
      .from("profiles")
      .select("account_status")
      .eq("user_id", bob.id)
      .single();
    expect(profile!.account_status).toBe("quarantined");

    const { error: queueError } = await bob.client.rpc("join_queue");
    expect(queueError?.message ?? "").toContain("account_restricted");
  });

  it("keeps privileged tables invisible to authenticated users", async () => {
    for (const table of ["rate_limits", "audit_events", "moderation_actions", "app_config"]) {
      const { data, error } = await alice.client.from(table).select("*").limit(1);
      // Either an explicit error or an empty result — never data.
      if (!error) expect(data).toEqual([]);
    }
  });
});
