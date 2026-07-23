import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

/**
 * Deletes the calling user's account: storage objects first, then the auth
 * user (profiles/queue/matches/messages cascade via foreign keys).
 */
export async function POST() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: objects } = await admin.storage
    .from("profile-photos")
    .list(user.id);
  if (objects && objects.length > 0) {
    await admin.storage
      .from("profile-photos")
      .remove(objects.map((o) => `${user.id}/${o.name}`));
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json(
      { error: "Deletion failed — contact support." },
      { status: 500 },
    );
  }

  await admin.rpc("audit", {
    p_actor: user.id,
    p_event: "account_deleted",
    p_subject: user.id,
    p_detail: {},
  });

  return NextResponse.json({ ok: true });
}
