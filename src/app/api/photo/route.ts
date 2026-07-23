import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import type { MatchSummary, PartnerProfile } from "@/lib/domain/types";

/**
 * Authorized access to another member's profile photo. The bucket is private;
 * partners never get raw storage paths they could fetch directly. This route
 * re-checks the relationship AS THE CALLER (session participant or match
 * member) and only then mints a short-lived signed URL with the service role.
 */
export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope");
  const id = request.nextUrl.searchParams.get("id");
  if (!id || (scope !== "session" && scope !== "match")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let photoPath: string | null = null;

  if (scope === "session") {
    // RPC raises unless the caller is a participant of this session.
    const { data, error } = await supabase.rpc("get_partner_profile", {
      p_session: id,
    });
    if (error) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    photoPath = (data as PartnerProfile).photo_path;
  } else {
    const { data, error } = await supabase.rpc("get_my_matches");
    if (error) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const match = (data as MatchSummary[]).find((m) => m.match_id === id);
    if (!match) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    photoPath = match.partner.photo_path;
  }

  if (!photoPath) {
    return NextResponse.json({ error: "No photo" }, { status: 404 });
  }

  const admin = supabaseAdmin();
  const { data: signed, error: signError } = await admin.storage
    .from("profile-photos")
    .createSignedUrl(photoPath, 60);
  if (signError || !signed) {
    return NextResponse.json({ error: "Unavailable" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, {
    headers: { "Cache-Control": "private, max-age=50" },
  });
}
