"use client";

import { useMemo, useState } from "react";
import { RestoreAccountForm } from "./moderation-forms";

export interface RestrictedProfile {
  user_id: string;
  display_name: string | null;
  account_status: "suspended" | "banned";
  updated_at: string;
}

function RestrictedBadge({ status }: { status: "suspended" | "banned" }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[0.6875rem] font-medium ${
        status === "banned"
          ? "bg-charcoal-900 text-cream-100"
          : "bg-danger-600/10 text-danger-600"
      }`}
    >
      {status}
    </span>
  );
}

export function RestrictedAccounts({
  profiles,
}: {
  profiles: RestrictedProfile[];
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return profiles;
    return profiles.filter(
      (profile) =>
        profile.display_name?.toLowerCase().includes(needle) ||
        profile.user_id.toLowerCase().includes(needle),
    );
  }, [profiles, query]);

  return (
    <section
      aria-labelledby="restricted-accounts-heading"
      className="mt-12"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="restricted-accounts-heading"
            className="font-display text-2xl text-charcoal-900"
          >
            Restricted accounts
          </h2>
          <p className="mt-1 text-sm text-charcoal-700/65">
            Restore an account even when its original report is closed.
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-1.5">
          <label
            htmlFor="restricted-account-search"
            className="text-xs font-medium text-charcoal-800"
          >
            Search restricted accounts
          </label>
          <input
            id="restricted-account-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or user ID"
            className="rounded-full border border-charcoal-900/15 bg-white/80 px-4 py-2.5 text-sm text-charcoal-900 outline-none transition-colors focus:border-bluebell-500"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 rounded-[--radius-soft] border border-dashed border-charcoal-900/15 p-6 text-center text-sm text-charcoal-700/60">
          No restricted accounts match this search.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {filtered.map((profile) => (
            <article
              key={profile.user_id}
              className="min-w-0 rounded-[--radius-soft] border border-charcoal-900/10 bg-white/65 p-5 shadow-lift"
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm text-charcoal-900">
                  {profile.display_name ?? "Unknown member"}
                </strong>
                <RestrictedBadge status={profile.account_status} />
              </div>
              <p className="mt-1 break-all font-mono text-[0.6875rem] text-charcoal-700/55">
                {profile.user_id}
              </p>
              <p className="mt-2 text-xs text-charcoal-700/60">
                Status updated {new Date(profile.updated_at).toLocaleString()}
              </p>
              <RestoreAccountForm targetUserId={profile.user_id} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
