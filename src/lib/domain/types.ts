/** Shared domain types mirroring the SQL contract in supabase/migrations. */

export type SessionStatus = "matched" | "active" | "ended";
export type SessionResolution = "pending" | "mutual" | "no_match";
export type EndReason =
  | "timer"
  | "left"
  | "partner_left"
  | "connect_timeout"
  | "connect_failed"
  | "stale"
  | "blocked";
export type PeerRole = "caller" | "callee";
export type DecisionChoice = "match" | "pass";

export type ReportCategory =
  | "sexual_content"
  | "harassment"
  | "underage"
  | "impersonation"
  | "violence"
  | "spam"
  | "other";

export const REPORT_CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: "sexual_content", label: "Nudity or sexual behavior" },
  { value: "harassment", label: "Harassment or hate" },
  { value: "underage", label: "Possibly under 18" },
  { value: "impersonation", label: "Impersonation, scam, or solicitation" },
  { value: "violence", label: "Threats or violence" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Something else" },
];

export interface ActiveSessionInfo {
  status: SessionStatus | "none";
  session_id?: string;
  role?: PeerRole;
  starts_at?: string | null;
  ends_at?: string | null;
  resolution?: SessionResolution;
  server_now: string;
}

export interface PartnerProfile {
  user_id: string;
  display_name: string;
  age: number;
  city: string;
  photo_path: string | null;
}

export interface QueueResult {
  status: "queued" | "matched" | "in_session" | "not_queued";
  session_id?: string;
}

export interface MatchFoundPayload {
  session_id: string;
  role: PeerRole;
}

export interface DecisionResolvedPayload {
  session_id: string;
  resolution: SessionResolution;
  match_id: string | null;
}

export interface ChatMessage {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface MatchSummary {
  match_id: string;
  created_at: string;
  partner: PartnerProfile;
  last_message: {
    body: string;
    sender_id: string;
    created_at: string;
  } | null;
  last_activity: string;
}

export interface MyProfile {
  user_id: string;
  display_name: string | null;
  date_of_birth: string | null;
  city: string | null;
  photo_path: string | null;
  role: "member" | "moderator" | "admin";
  account_status: "active" | "quarantined" | "suspended" | "banned";
  verification_status: "none" | "demo_bypass" | "verified";
  onboarding_complete: boolean;
}

/** Member-safe appeal projection returned by get_my_account_appeals(). */
export interface AppealSummary {
  id: string;
  restriction_status: "suspended" | "banned";
  statement: string;
  status: "open" | "restored" | "upheld";
  created_at: string;
  reviewed_at: string | null;
}
