import Link from "next/link";
import { requireModerator } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { BrandLockup, Eyebrow } from "@/components/brand";
import { REPORT_CATEGORIES } from "@/lib/domain/types";
import { actOnReport } from "./actions";

export const dynamic = "force-dynamic";

interface ReportRow {
  id: string;
  reporter_id: string;
  reported_id: string;
  session_id: string | null;
  category: string;
  narrative: string | null;
  status: string;
  created_at: string;
}

interface ProfileLite {
  user_id: string;
  display_name: string | null;
  account_status: string;
}

interface AuditRow {
  id: number;
  actor_user_id: string | null;
  event: string;
  subject: string | null;
  created_at: string;
}

const CATEGORY_LABELS = Object.fromEntries(
  REPORT_CATEGORIES.map((c) => [c.value, c.label]),
);

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-success-600/10 text-success-600",
    quarantined: "bg-bluebell-500/10 text-bluebell-700",
    suspended: "bg-danger-600/10 text-danger-600",
    banned: "bg-charcoal-900 text-cream-100",
    open: "bg-rose-600/10 text-rose-700",
    in_review: "bg-bluebell-500/10 text-bluebell-700",
    actioned: "bg-success-600/10 text-success-600",
    dismissed: "bg-charcoal-900/8 text-charcoal-700",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[0.6875rem] font-medium ${styles[status] ?? "bg-charcoal-900/8 text-charcoal-700"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export default async function AdminPage() {
  const { role } = await requireModerator();
  const admin = supabaseAdmin();

  const { data: reportsData } = await admin
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const reports = (reportsData ?? []) as ReportRow[];

  const userIds = [
    ...new Set(reports.flatMap((r) => [r.reporter_id, r.reported_id])),
  ];
  const { data: profilesData } = userIds.length
    ? await admin
        .from("profiles")
        .select("user_id, display_name, account_status")
        .in("user_id", userIds)
    : { data: [] };
  const profiles = new Map(
    ((profilesData ?? []) as ProfileLite[]).map((p) => [p.user_id, p]),
  );

  const { data: auditData } = await admin
    .from("audit_events")
    .select("id, actor_user_id, event, subject, created_at")
    .order("id", { ascending: false })
    .limit(30);
  const audit = (auditData ?? []) as AuditRow[];

  const open = reports.filter((r) => r.status === "open");
  const closed = reports.filter((r) => r.status !== "open");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-charcoal-900/8 bg-white/60">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
          <BrandLockup href="/app/lobby" />
          <div className="flex items-center gap-4">
            <span className="rounded-full bg-bluebell-500/10 px-3 py-1 text-xs font-medium text-bluebell-700">
              {role}
            </span>
            <Link
              href="/app/lobby"
              className="text-sm text-charcoal-700/80 hover:text-charcoal-900"
            >
              Back to app
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 py-10">
        <Eyebrow className="text-bluebell-700">Moderation</Eyebrow>
        <h1 className="mt-2 font-display text-3xl text-charcoal-900">
          Report queue
        </h1>
        <p className="mt-2 text-sm text-charcoal-700/70">
          {open.length} open · every action lands in the immutable audit log.
        </p>

        <section className="mt-8 space-y-4">
          {open.length === 0 && (
            <p className="rounded-[--radius-soft] border border-dashed border-charcoal-900/15 p-8 text-center text-sm text-charcoal-700/60">
              No open reports. Quiet skies.
            </p>
          )}
          {open.map((r) => {
            const reported = profiles.get(r.reported_id);
            const reporter = profiles.get(r.reporter_id);
            return (
              <article
                key={r.id}
                className="rounded-[--radius-soft] border border-charcoal-900/10 bg-white/70 p-5 shadow-lift"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <StatusBadge status={r.status} />
                  <span className="text-sm font-semibold text-charcoal-900">
                    {CATEGORY_LABELS[r.category] ?? r.category}
                  </span>
                  <span className="text-xs text-charcoal-700/50">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2.5 text-sm text-charcoal-800">
                  <strong>{reported?.display_name ?? "Unknown"}</strong>{" "}
                  <StatusBadge status={reported?.account_status ?? "?"} />{" "}
                  reported by {reporter?.display_name ?? "Unknown"}
                  {r.session_id && " during a live date"}
                </p>
                {r.narrative && (
                  <blockquote className="mt-2.5 border-l-2 border-blush-300 pl-3 text-sm italic text-charcoal-700/90">
                    {r.narrative}
                  </blockquote>
                )}

                <form
                  action={actOnReport}
                  className="mt-4 flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="reportId" value={r.id} />
                  <input
                    type="hidden"
                    name="targetUserId"
                    value={r.reported_id}
                  />
                  <input
                    name="reason"
                    placeholder="Reason (recorded in the log)"
                    className="min-w-52 flex-1 rounded-full border border-charcoal-900/15 bg-white px-4 py-2 text-sm outline-none focus:border-bluebell-500"
                  />
                  {(
                    [
                      ["dismiss", "Dismiss"],
                      ["warn", "Warn"],
                      ["quarantine", "Quarantine"],
                      ["suspend", "Suspend"],
                      ["ban", "Ban"],
                      ["reinstate", "Reinstate"],
                    ] as const
                  ).map(([verb, label]) => (
                    <button
                      key={verb}
                      name="verb"
                      value={verb}
                      className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                        verb === "ban" || verb === "suspend"
                          ? "bg-danger-600 text-cream-50 hover:brightness-110"
                          : verb === "reinstate"
                            ? "bg-success-600/10 text-success-600 hover:bg-success-600/20"
                            : "bg-charcoal-900/6 text-charcoal-800 hover:bg-charcoal-900/12"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </form>
              </article>
            );
          })}
        </section>

        {closed.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-xl text-charcoal-900">
              Recently handled
            </h2>
            <ul className="mt-4 space-y-2">
              {closed.slice(0, 15).map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-2.5 rounded-xl bg-white/50 px-4 py-2.5 text-sm text-charcoal-700/80"
                >
                  <StatusBadge status={r.status} />
                  {CATEGORY_LABELS[r.category] ?? r.category} ·{" "}
                  {profiles.get(r.reported_id)?.display_name ?? "Unknown"} ·{" "}
                  {new Date(r.created_at).toLocaleDateString()}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-12">
          <h2 className="font-display text-xl text-charcoal-900">Audit log</h2>
          <div className="mt-4 overflow-x-auto rounded-[--radius-soft] border border-charcoal-900/10 bg-white/60">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-charcoal-900/8 text-xs uppercase tracking-wider text-charcoal-700/60">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Event</th>
                  <th className="px-4 py-2.5 font-medium">Subject</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-b border-charcoal-900/5 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-charcoal-700/70">
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-charcoal-900">
                      {a.event}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-charcoal-700/70">
                      {a.subject ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
