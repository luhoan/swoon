/**
 * Account appeal integration tests against the configured Supabase project.
 * These prove the RPC authorization, privacy, validation, and state changes
 * that the UI relies on. Every created auth user is removed after the suite.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  client: SupabaseClient;
}

const password = `appeal-${crypto.randomUUID()}`;
const createdUserIds: string[] = [];

async function makeUser(tag: string): Promise<TestUser> {
  const email = `e2e-appeal-${tag}-${crypto.randomUUID().slice(0, 8)}@test.tryswoon.live`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  createdUserIds.push(data.user.id);

  await admin
    .from("profiles")
    .update({ display_name: `Appeal ${tag}` })
    .eq("user_id", data.user.id);

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: loginError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (loginError) throw loginError;

  return { id: data.user.id, client };
}

async function setStatus(
  user: TestUser,
  status: "active" | "quarantined" | "suspended" | "banned",
) {
  const { error } = await admin
    .from("profiles")
    .update({ account_status: status })
    .eq("user_id", user.id);
  if (error) throw error;
}

const validStatement =
  "I believe this restriction was applied to the wrong account and would like a review.";

let active: TestUser;
let banned: TestUser;
let suspended: TestUser;
let directWithAppeal: TestUser;
let directWithoutAppeal: TestUser;
let rateLimited: TestUser;
let moderator: TestUser;

beforeAll(async () => {
  [
    active,
    banned,
    suspended,
    directWithAppeal,
    directWithoutAppeal,
    rateLimited,
    moderator,
  ] = await Promise.all([
    makeUser("active"),
    makeUser("banned"),
    makeUser("suspended"),
    makeUser("direct-open"),
    makeUser("direct-none"),
    makeUser("rate"),
    makeUser("moderator"),
  ]);

  await Promise.all([
    setStatus(banned, "banned"),
    setStatus(suspended, "suspended"),
    setStatus(directWithAppeal, "banned"),
    setStatus(directWithoutAppeal, "banned"),
    setStatus(rateLimited, "banned"),
    admin
      .from("profiles")
      .update({ role: "moderator" })
      .eq("user_id", moderator.id),
  ]);
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe.sequential("account appeals", () => {
  it("rejects appeals from active and quarantined accounts", async () => {
    const activeResult = await active.client.rpc("submit_account_appeal", {
      p_statement: validStatement,
    });
    expect(activeResult.error?.message ?? "").toContain("appeal_not_allowed");

    await setStatus(active, "quarantined");
    const quarantineResult = await active.client.rpc("submit_account_appeal", {
      p_statement: validStatement,
    });
    expect(quarantineResult.error?.message ?? "").toContain(
      "appeal_not_allowed",
    );
  });

  it("rejects statements outside the 20 to 4000 character contract", async () => {
    const shortResult = await banned.client.rpc("submit_account_appeal", {
      p_statement: "nineteen chars only",
    });
    expect(shortResult.error?.message ?? "").toContain(
      "appeal_statement_invalid",
    );

    const longResult = await banned.client.rpc("submit_account_appeal", {
      p_statement: "x".repeat(4001),
    });
    expect(longResult.error?.message ?? "").toContain(
      "appeal_statement_invalid",
    );
  });

  it("returns only the member-safe fields from the caller's own appeal", async () => {
    const { data: appealId, error } = await banned.client.rpc(
      "submit_account_appeal",
      { p_statement: validStatement },
    );
    expect(error).toBeNull();
    expect(appealId).toMatch(/^[0-9a-f-]{36}$/);

    const { data: safeRows, error: safeError } = await banned.client.rpc(
      "get_my_account_appeals",
    );
    expect(safeError).toBeNull();
    expect(safeRows).toEqual([
      expect.objectContaining({
        id: appealId,
        restriction_status: "banned",
        statement: validStatement,
        status: "open",
      }),
    ]);
    expect(safeRows![0]).not.toHaveProperty("reviewer_id");
    expect(safeRows![0]).not.toHaveProperty("review_note");

    const { data: anotherMembersRows } = await active.client.rpc(
      "get_my_account_appeals",
    );
    expect(anotherMembersRows).toEqual([]);

    const { data: directRows, error: directError } = await banned.client
      .from("account_appeals")
      .select("*");
    if (!directError) expect(directRows).toEqual([]);
  });

  it("prevents a second open appeal", async () => {
    const duplicate = await banned.client.rpc("submit_account_appeal", {
      p_statement: `${validStatement} This is a duplicate.`,
    });
    expect(duplicate.error?.message ?? "").toContain("appeal_already_open");
  });

  it("denies review and restoration RPCs to ordinary members", async () => {
    const { data: appeals } = await banned.client.rpc(
      "get_my_account_appeals",
    );
    const resolve = await active.client.rpc("resolve_account_appeal", {
      p_appeal: appeals![0].id,
      p_decision: "restore",
      p_note: "An ordinary member must not resolve this.",
    });
    expect(resolve.error?.message ?? "").toContain("not_moderator");

    const restore = await active.client.rpc("restore_restricted_account", {
      p_target: banned.id,
      p_reason: "An ordinary member must not restore this.",
    });
    expect(restore.error?.message ?? "").toContain("not_moderator");
  });

  it("upholds an appeal without lifting the ban or leaking the review note", async () => {
    const { data: appeals } = await banned.client.rpc(
      "get_my_account_appeals",
    );
    const appealId = appeals![0].id as string;
    const { error } = await moderator.client.rpc("resolve_account_appeal", {
      p_appeal: appealId,
      p_decision: "uphold",
      p_note: "The restriction is supported by the reviewed evidence.",
    });
    expect(error).toBeNull();

    const { data: profile } = await admin
      .from("profiles")
      .select("account_status")
      .eq("user_id", banned.id)
      .single();
    expect(profile!.account_status).toBe("banned");

    const { data: safeRows } = await banned.client.rpc(
      "get_my_account_appeals",
    );
    expect(safeRows![0].status).toBe("upheld");
    expect(safeRows![0]).not.toHaveProperty("review_note");

    const { data: audit } = await admin
      .from("audit_events")
      .select("event, subject")
      .eq("event", "appeal_upheld")
      .eq("subject", banned.id);
    expect(audit).toHaveLength(1);
  });

  it("enforces the seven-day cooldown after an upheld appeal", async () => {
    const retry = await banned.client.rpc("submit_account_appeal", {
      p_statement: `${validStatement} Please look once more.`,
    });
    expect(retry.error?.message ?? "").toContain("appeal_cooldown");
  });

  it("restores a suspended member and records one immutable decision", async () => {
    const { data: appealId, error: submitError } = await suspended.client.rpc(
      "submit_account_appeal",
      { p_statement: validStatement },
    );
    expect(submitError).toBeNull();

    const { error: resolveError } = await moderator.client.rpc(
      "resolve_account_appeal",
      {
        p_appeal: appealId,
        p_decision: "restore",
        p_note: "The restriction was applied in error.",
      },
    );
    expect(resolveError).toBeNull();

    const { data: profile } = await admin
      .from("profiles")
      .select("account_status")
      .eq("user_id", suspended.id)
      .single();
    expect(profile!.account_status).toBe("active");

    const { data: appeal } = await admin
      .from("account_appeals")
      .select("status, reviewer_id, review_note, reviewed_at")
      .eq("id", appealId)
      .single();
    expect(appeal).toEqual(
      expect.objectContaining({
        status: "restored",
        reviewer_id: moderator.id,
        review_note: "The restriction was applied in error.",
      }),
    );
    expect(appeal!.reviewed_at).toBeTruthy();

    const { data: actions } = await admin
      .from("moderation_actions")
      .select("action, actor_user_id, target_user_id")
      .eq("target_user_id", suspended.id);
    expect(actions).toEqual([
      {
        action: "reinstate",
        actor_user_id: moderator.id,
        target_user_id: suspended.id,
      },
    ]);

    const { data: audit } = await admin
      .from("audit_events")
      .select("event, subject")
      .eq("event", "appeal_restored")
      .eq("subject", suspended.id);
    expect(audit).toHaveLength(1);

    const secondResolution = await moderator.client.rpc(
      "resolve_account_appeal",
      {
        p_appeal: appealId,
        p_decision: "uphold",
        p_note: "A second decision must not be accepted.",
      },
    );
    expect(secondResolution.error?.message ?? "").toContain(
      "appeal_already_resolved",
    );
  });

  it("direct restoration closes an existing open appeal", async () => {
    const { data: appealId, error: submitError } =
      await directWithAppeal.client.rpc("submit_account_appeal", {
        p_statement: validStatement,
      });
    expect(submitError).toBeNull();

    const { error } = await moderator.client.rpc(
      "restore_restricted_account",
      {
        p_target: directWithAppeal.id,
        p_reason: "Manual account review cleared the restriction.",
      },
    );
    expect(error).toBeNull();

    const { data: profile } = await admin
      .from("profiles")
      .select("account_status")
      .eq("user_id", directWithAppeal.id)
      .single();
    expect(profile!.account_status).toBe("active");

    const { data: appeal } = await admin
      .from("account_appeals")
      .select("status, reviewer_id, review_note")
      .eq("id", appealId)
      .single();
    expect(appeal).toEqual({
      status: "restored",
      reviewer_id: moderator.id,
      review_note: "Manual account review cleared the restriction.",
    });
  });

  it("direct restoration works after the original report is closed", async () => {
    const { error } = await moderator.client.rpc(
      "restore_restricted_account",
      {
        p_target: directWithoutAppeal.id,
        p_reason: "Human review found no basis for the ban.",
      },
    );
    expect(error).toBeNull();

    const { data: profile } = await admin
      .from("profiles")
      .select("account_status")
      .eq("user_id", directWithoutAppeal.id)
      .single();
    expect(profile!.account_status).toBe("active");

    const { data: action } = await admin
      .from("moderation_actions")
      .select("report_id, action, reason")
      .eq("target_user_id", directWithoutAppeal.id)
      .single();
    expect(action).toEqual({
      report_id: null,
      action: "reinstate",
      reason: "Human review found no basis for the ban.",
    });
  });

  it("limits repeated submissions even if privileged cleanup removes rows", async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: appealId, error } = await rateLimited.client.rpc(
        "submit_account_appeal",
        { p_statement: `${validStatement} Attempt ${attempt + 1}.` },
      );
      expect(error).toBeNull();
      await admin.from("account_appeals").delete().eq("id", appealId);
    }

    const third = await rateLimited.client.rpc("submit_account_appeal", {
      p_statement: `${validStatement} Attempt 3.`,
    });
    expect(third.error?.message ?? "").toContain("appeal_rate_limited");
  });
});
