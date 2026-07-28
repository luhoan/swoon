import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-16">
      <h1 className="font-display text-4xl text-charcoal-900">
        Terms of Service
      </h1>
      <p className="mt-3 text-sm text-charcoal-700/60">
        Version 2026-07-23 · Draft — pending review by qualified counsel before
        public launch
      </p>

      <div className="mt-8 space-y-6 leading-relaxed text-charcoal-800">
        <section>
          <h2 className="font-display text-2xl text-charcoal-900">1. Who can use Swoon</h2>
          <p className="mt-2">
            You must be at least 18 years old and legally able to enter this
            agreement. You may hold one account, registered with accurate
            information about yourself.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-charcoal-900">2. The service</h2>
          <p className="mt-2">
            Swoon connects members for live, unrecorded video dates and, after
            a mutual match, text chat. We may change, suspend, or discontinue
            features while the service is in pre-release.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-charcoal-900">3. Your conduct</h2>
          <p className="mt-2">
            You agree to follow the Community Guidelines on the Safety page.
            We may warn, suspend, or ban accounts that break them, and may
            remove content or restrict features while a report is reviewed.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-charcoal-900">4. Verification fee</h2>
          <p className="mt-2">
            Account verification may require a one-time fee. In the current
            pre-release, verification runs in demo mode and no payment is
            collected.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-charcoal-900">5. Content and privacy</h2>
          <p className="mt-2">
            You keep rights to the content you provide (like your photo) and
            grant us the license needed to operate the service. Our data
            practices are described in the Privacy Policy.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-charcoal-900">6. Disclaimers</h2>
          <p className="mt-2">
            Swoon is provided &quot;as is&quot; during pre-release. We do not
            conduct criminal background checks on members. Use judgment when
            meeting anyone online or in person.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-charcoal-900">7. Termination and contact</h2>
          <p className="mt-2">
            You can delete your account at any time in Settings. Questions
            about these terms:{" "}
            <a href="mailto:info@tryswoon.live" className="underline">
              info@tryswoon.live
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
