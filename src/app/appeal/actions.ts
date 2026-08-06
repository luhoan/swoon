"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { notifyAppealReviewer } from "@/lib/appeals/notification";

export interface AppealActionState {
  error: string | null;
}

interface SubmittedAppealProjection {
  id: string;
  restriction_status: "suspended" | "banned";
  created_at: string;
}

function memberError(message: string): string {
  if (message.includes("appeal_statement_invalid")) {
    return "Use between 20 and 4,000 characters.";
  }
  if (message.includes("appeal_already_open")) {
    return "You already have an appeal under review.";
  }
  if (message.includes("appeal_cooldown")) {
    return "A decision was made recently. You can submit another appeal seven days after that review.";
  }
  if (message.includes("appeal_rate_limited")) {
    return "Too many appeal attempts. Try again later.";
  }
  if (message.includes("appeal_not_allowed")) {
    return "Appeals are available only for suspended or banned accounts.";
  }
  return "Your appeal could not be submitted. Try again.";
}

export async function submitAppeal(
  _previous: AppealActionState,
  formData: FormData,
): Promise<AppealActionState> {
  const statement = String(formData.get("statement") ?? "").trim();
  if (statement.length < 20) {
    return { error: "Use at least 20 characters so our team has enough context." };
  }
  if (statement.length > 4000) {
    return { error: "Keep your appeal to 4,000 characters or fewer." };
  }

  const supabase = await supabaseServer();
  const { data: appealId, error } = await supabase.rpc(
    "submit_account_appeal",
    {
    p_statement: statement,
    },
  );
  if (error) return { error: memberError(error.message) };

  if (typeof appealId === "string") {
    const { data: appeals, error: projectionError } = await supabase.rpc(
      "get_my_account_appeals",
    );
    const submittedAppeal = (
      Array.isArray(appeals) ? appeals : []
    ).find((appeal): appeal is SubmittedAppealProjection => {
      if (!appeal || typeof appeal !== "object") return false;
      const row = appeal as Record<string, unknown>;
      return (
        row.id === appealId &&
        (row.restriction_status === "suspended" ||
          row.restriction_status === "banned") &&
        typeof row.created_at === "string"
      );
    });

    if (!projectionError && submittedAppeal) {
      try {
        const notification = await notifyAppealReviewer({
          appealId,
          restrictionStatus: submittedAppeal.restriction_status,
          submittedAt: submittedAppeal.created_at,
        });
        if (notification.status !== "sent") {
          console.error(
            `[appeal-email] ${notification.reason ?? notification.status} appeal=${appealId}`,
          );
        }
      } catch {
        console.error(`[appeal-email] delivery_error appeal=${appealId}`);
      }
    } else {
      console.error(
        `[appeal-email] projection_unavailable appeal=${appealId}`,
      );
    }
  }

  revalidatePath("/appeal");
  redirect("/appeal");
}
