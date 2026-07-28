import type { Metadata } from "next";

export const metadata: Metadata = { title: "Safety" };

export default function SafetyPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-16">
      <h1 className="font-display text-4xl text-charcoal-900">
        Safety at Swoon
      </h1>
      <p className="mt-3 text-sm text-charcoal-700/60">
        Community guidelines · Draft pending review by counsel
      </p>

      <div className="prose-swoon mt-8 space-y-6 leading-relaxed text-charcoal-800">
        <section>
          <h2 className="font-display text-2xl text-charcoal-900">
            The short version
          </h2>
          <p className="mt-2">
            Swoon is live video with strangers, so the rules are simple and
            firmly enforced: be kind, keep it legal, keep your clothes on, and
            respect a no. Breaking these rules costs you your account.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-charcoal-900">
            During every date
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong>Leave</strong> ends the date instantly, no questions
              asked. It&apos;s on screen the whole time.
            </li>
            <li>
              <strong>Report</strong> sends what happened to a human safety
              team. The person you report is never told who reported them.
            </li>
            <li>
              <strong>Block</strong> guarantees you&apos;re never matched with that
              person again and closes any chat between you.
            </li>
            <li>Dates are never recorded — by us or by design.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl text-charcoal-900">
            What gets you removed
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>Nudity or sexual behavior on camera</li>
            <li>Harassment, hate, or threats</li>
            <li>Being under 18, or targeting anyone under 18</li>
            <li>Impersonation, scams, or solicitation</li>
            <li>Spam or commercial activity</li>
          </ul>
          <p className="mt-2">
            Reports of a possible minor immediately pause the reported account
            from dating while a human reviews the case.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-charcoal-900">
            Your privacy on a date
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>Only your first name, age, and city are shown — never your birthday, email, or exact location.</li>
            <li>Your city is typed by you. Swoon never uses GPS.</li>
            <li>Video is peer-to-peer and unrecorded.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl text-charcoal-900">
            Meeting in person
          </h2>
          <p className="mt-2">
            If a Swoon date turns into a real one: meet in public, tell a
            friend where you&apos;re going, and arrange your own transport. If you
            ever feel unsafe, contact local emergency services first, then
            report the account to us.
          </p>
        </section>

        <p className="border-t border-charcoal-900/10 pt-5 text-sm text-charcoal-700/60">
          Questions or urgent safety concerns:{" "}
          <a href="mailto:info@tryswoon.live" className="underline">
            info@tryswoon.live
          </a>
        </p>
      </div>
    </article>
  );
}
