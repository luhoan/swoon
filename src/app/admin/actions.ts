"use server";

import { revalidatePath } from "next/cache";
import { requireModerator } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";

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
