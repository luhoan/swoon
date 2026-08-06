"use server";

import { revalidatePath } from "next/cache";
import { requireModerator } from "@/lib/admin";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export type ModerationVerb =
  | "dismiss"
  | "warn"
  | "quarantine"
  | "suspend"
  | "ban"
  | "reinstate";

const STATUS_EFFECT: Record<
  ModerationVerb,
  "active" | "quarantined" | "suspended" | "banned" | null
> = {
  dismiss: null,
  warn: null,
  quarantine: "quarantined",
  suspend: "suspended",
  ban: "banned",
  reinstate: "active",
};

export async function actOnReport(formData: FormData): Promise<void> {
  const { userId: actorId } = await requireModerator();

  const reportId = String(formData.get("reportId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const verb = String(formData.get("verb") ?? "") as ModerationVerb;
  const reason = String(formData.get("reason") ?? "").trim() || "Moderator action";

  if (!reportId || !targetUserId || !(verb in STATUS_EFFECT)) return;

  const admin = supabaseAdmin();

  const effect = STATUS_EFFECT[verb];
  if (effect) {
    await admin
      .from("profiles")
      .update({ account_status: effect })
      .eq("user_id", targetUserId);
  }

  await admin.from("moderation_actions").insert({
    report_id: reportId,
    target_user_id: targetUserId,
    actor_user_id: actorId,
    action: verb,
    reason,
  });

  await admin
    .from("reports")
    .update({ status: verb === "dismiss" ? "dismissed" : "actioned" })
    .eq("id", reportId);

  await admin.from("audit_events").insert({
    actor_user_id: actorId,
    event: `moderation_${verb}`,
    subject: targetUserId,
    detail: { report_id: reportId, reason },
  });

  revalidatePath("/admin");
}

export interface ModerationActionState {
  ok: boolean;
  error: string | null;
}

function reviewError(message: string): string {
  if (message.includes("appeal_already_resolved")) {
    return "This appeal was already reviewed. Refresh the queue.";
  }
  if (message.includes("appeal_not_found")) {
    return "This appeal no longer exists. Refresh the queue.";
  }
  if (message.includes("account_not_restricted")) {
    return "This account is no longer suspended or banned.";
  }
  if (message.includes("review_note_invalid")) {
    return "Enter an internal note between 1 and 2,000 characters.";
  }
  if (message.includes("not_moderator")) {
    return "You no longer have moderator access.";
  }
  return "The review action failed. Refresh and try again.";
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function reviewAppeal(
  _previous: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  await requireModerator();
  const appealId = String(formData.get("appealId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!validUuid(appealId)) {
    return { ok: false, error: "This appeal ID is invalid. Refresh the queue." };
  }
  if (decision !== "restore" && decision !== "uphold") {
    return { ok: false, error: "Choose a valid review action." };
  }
  if (note.length < 1 || note.length > 2000) {
    return {
      ok: false,
      error: "Enter an internal note between 1 and 2,000 characters.",
    };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("resolve_account_appeal", {
    p_appeal: appealId,
    p_decision: decision,
    p_note: note,
  });
  if (error) return { ok: false, error: reviewError(error.message) };

  revalidatePath("/admin");
  revalidatePath("/appeal");
  return { ok: true, error: null };
}

export async function restoreAccount(
  _previous: ModerationActionState,
  formData: FormData,
): Promise<ModerationActionState> {
  await requireModerator();
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!validUuid(targetUserId)) {
    return { ok: false, error: "This account ID is invalid. Refresh the list." };
  }
  if (reason.length < 1 || reason.length > 2000) {
    return {
      ok: false,
      error: "Enter a restoration reason between 1 and 2,000 characters.",
    };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("restore_restricted_account", {
    p_target: targetUserId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: reviewError(error.message) };

  revalidatePath("/admin");
  revalidatePath("/appeal");
  return { ok: true, error: null };
}
