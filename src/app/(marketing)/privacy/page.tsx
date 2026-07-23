import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-16">
      <h1 className="font-display text-4xl text-charcoal-900">
        Privacy Policy
      </h1>
      <p className="mt-3 text-sm text-charcoal-700/60">
        Version 2026-07-23 · Draft — pending review by qualified counsel before
        public launch
      </p>

      <div className="mt-8 space-y-6 leading-relaxed text-charcoal-800">
        <section>
          <h2 className="font-display text-2xl text-charcoal-900">
            What we collect
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong>Account:</strong> email, password (stored as a hash by
              our auth provider), and acceptance of these policies.
            </li>
            <li>
              <strong>Profile:</strong> first name, date of birth, city (typed
              by you — we never use GPS), and a photo.
            </li>
            <li>
              <strong>Activity:</strong> queue and date session metadata
              (when a date started and ended, and its outcome), matches, chat
              messages, blocks, and reports.
            </li>
          </ul>
        </section>
        <section>
          <h2 className="font-display text-2xl text-charcoal-900">
            What we deliberately don&apos;t collect
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong>Video or audio of your dates.</strong> Dates stream
              peer-to-peer between the two of you and are never recorded.
            </li>
            <li>Your precise location.</li>
            <li>Analytics or ad-tracking data in this pre-release.</li>
          </ul>
        </section>
        <section>
          <h2 className="font-display text-2xl text-charcoal-900">
            What other members see
          </h2>
          <p className="mt-2">
            Only your first name, age (never your date of birth), city, and
            photo — and only while you&apos;re on a date together or matched.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-charcoal-900">
            Where data lives
          </h2>
          <p className="mt-2">
            Data is stored with Supabase (database, authentication, and file
            storage) and the app is hosted on Vercel. Access is restricted by
            row-level security so members can only ever read their own data
            and what their current date or match is meant to see.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-charcoal-900">
            Deletion and contact
          </h2>
          <p className="mt-2">
            Deleting your account in Settings removes your profile, photo,
            queue entries, matches, and messages. Records of moderation
            actions may be retained where required for safety. Questions:{" "}
            <a href="mailto:privacy@tryswoon.live" className="underline">
              privacy@tryswoon.live
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
