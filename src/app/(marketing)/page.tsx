import Link from "next/link";
import { Eyebrow, SwanMark } from "@/components/brand";

/* ------------------------------------------------------------------ */
/* Hero phone mockups — hand-built UI vignettes, no stock imagery.     */
/* ------------------------------------------------------------------ */

function VideoTile({
  name,
  age,
  from,
  to,
}: {
  name: string;
  age: number;
  from: string;
  to: string;
}) {
  return (
    <div
      className={`relative flex-1 overflow-hidden rounded-xl bg-gradient-to-br ${from} ${to}`}
    >
      {/* soft portrait glow standing in for a live camera feed */}
      <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/25 blur-2xl" />
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-ink-990/70 px-2.5 py-1 backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-success-600" />
        <span className="text-[0.625rem] font-medium text-cream-100">
          {name}, {age}
        </span>
      </div>
    </div>
  );
}

function DatePhone() {
  return (
    <div className="w-[16.5rem] rounded-[2.4rem] border-[6px] border-ink-950 bg-ink-990 p-2.5 shadow-float">
      <div className="flex h-[33rem] flex-col rounded-[1.9rem] bg-ink-990 p-3">
        <div className="flex items-center justify-between px-1 text-cream-100/70">
          <span className="text-[0.625rem]">9:41</span>
          <div className="text-center">
            <p className="text-[0.5rem] font-semibold uppercase tracking-[0.25em] text-cream-100/50">
              Speed date
            </p>
            <p className="font-display text-lg leading-none text-cream-100">
              02:30
            </p>
          </div>
          <span className="text-[0.5rem] uppercase tracking-wider text-cream-100/50">
            Report
          </span>
        </div>
        <div className="mt-2.5 flex flex-1 flex-col gap-2">
          <VideoTile name="Emma" age={24} from="from-blush-300" to="to-rose-600" />
          <VideoTile name="Alex" age={25} from="from-bluebell-500" to="to-ink-950" />
        </div>
        <div className="mt-3 flex items-center justify-center gap-4 pb-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[0.5rem] text-cream-100/70">
            Skip
          </span>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-600 shadow-float">
            <SwanMark className="h-6 w-auto brightness-0 invert" />
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[0.5rem] text-cream-100/70">
            Next
          </span>
        </div>
      </div>
    </div>
  );
}

function MatchPhone() {
  return (
    <div className="w-[13.5rem] rounded-[2.2rem] border-[6px] border-ink-950 bg-ink-990 p-2 shadow-float">
      <div className="flex h-[27rem] flex-col items-center rounded-[1.7rem] bg-ink-990 px-4 pb-5 pt-8 text-center">
        <p className="text-[0.6rem] uppercase tracking-[0.3em] text-cream-100/60">
          It&apos;s a
        </p>
        <p className="font-script text-4xl text-blush-300">Match!</p>
        <div className="mt-5 flex items-center">
          <span className="h-16 w-16 rounded-full border-2 border-blush-300 bg-gradient-to-br from-blush-300 to-rose-600" />
          <span className="z-10 -mx-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink-990">
            <span className="text-sm text-rose-500">♥</span>
          </span>
          <span className="h-16 w-16 rounded-full border-2 border-blush-300 bg-gradient-to-br from-bluebell-500 to-ink-950" />
        </div>
        <p className="mt-5 text-[0.65rem] leading-relaxed text-cream-100/70">
          You and Alex liked
          <br />
          each other!
        </p>
        <span className="mt-5 w-full rounded-full bg-blush-300 py-2.5 text-xs font-medium text-charcoal-900">
          Send message
        </span>
        <span className="mt-2.5 text-[0.65rem] text-cream-100/60">
          Keep dating
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const FEATURES_QUARTET = [
  {
    title: "Real chemistry",
    body: "See if you click in minutes — not weeks of texting.",
    icon: (
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <rect x="3" y="9" width="17" height="14" rx="3" />
        <path d="M20 14.5 29 10v12l-9-4.5" />
        <path d="M11.5 13.6c.9-1.1 2.6-1.1 3.4.1.7 1 .5 2.3-.4 3.1l-3 2.7-2.9-2.8c-.9-.8-1-2.2-.3-3.1.9-1.2 2.5-1.1 3.2 0Z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    title: "Live video speed dating",
    body: "Short, fun three-minute dates designed to find genuine connections.",
    icon: (
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <circle cx="16" cy="17" r="11" />
        <path d="M16 11v6l4 3" strokeLinecap="round" />
        <path d="M22 4l5 4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Safe & verified",
    body: "Verified profiles, one-tap reporting, and safety-first moderation.",
    icon: (
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M16 3l10 4v8c0 7-4.5 11.5-10 14C10.5 26.5 6 22 6 15V7l10-4Z" />
        <path d="m11.5 16 3 3 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Less swiping",
    body: "Spend less time judging photos and more time meeting people.",
    icon: (
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M16 27c-6-4.5-11-8.6-11-14a6.5 6.5 0 0 1 11-4.6A6.5 6.5 0 0 1 27 13c0 5.4-5 9.5-11 14Z" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const HOW_IT_WORKS = [
  {
    step: 1,
    title: "Create your profile",
    body: "Upload a photo, add the basics, and tell people who you really are.",
  },
  {
    step: 2,
    title: "Get matched",
    body: "We connect you live with compatible people — no endless browsing.",
  },
  {
    step: 3,
    title: "Meet face-to-face",
    body: "Enjoy a timed three-minute video date from the comfort of home.",
  },
  {
    step: 4,
    title: "Match again?",
    body: "If you both say yes, it's a match — and the conversation continues.",
  },
];

const FEATURE_CHECKLIST = [
  "Live video speed dates",
  "Real-time matchmaking",
  "Verified members only",
  "Private in-app messaging",
  "One-tap leave, report & block",
  "No recordings — ever",
  "Your exact location stays private",
];

const FAQ = [
  {
    q: "Why is there a $5 verification?",
    a: "One small, one-time payment keeps bots and throwaway accounts out. After that, dating on Swoon is free — there's no subscription.",
  },
  {
    q: "What happens on a date?",
    a: "You're connected on live video with a timer set to three minutes. When it ends, you each privately choose match or pass. Only a mutual match is ever revealed — nobody finds out they were passed on.",
  },
  {
    q: "Are dates recorded?",
    a: "No. Dates are live, peer-to-peer video and are never recorded or captured by Swoon.",
  },
  {
    q: "What if someone behaves badly?",
    a: "Leave and Report are on screen for the entire date. Reports go to a human safety team, and blocking someone means you'll never be matched again.",
  },
  {
    q: "Who can join?",
    a: "Swoon is for adults 18 and over. We check date of birth at sign-up and only ever display your age, never your birthday.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* ---------------- Hero ---------------- */}
      <section className="grain relative overflow-hidden">
        {/* swan-wing sweep behind the hero */}
        <div
          aria-hidden
          className="absolute -right-40 top-24 h-[36rem] w-[36rem] rounded-full bg-blush-200/50 blur-3xl"
        />
        <SwanMark className="absolute -left-24 bottom-0 h-96 w-auto opacity-40" />

        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pb-20 pt-16 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div>
            <p className="flex items-center gap-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.28em] text-rose-600">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              Live video chat speed dating
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            </p>
            <h1 className="mt-6 font-display text-5xl leading-[1.06] text-charcoal-900 sm:text-6xl">
              Skip the Swipe.
              <br />
              <em className="text-rose-600">Meet before you match.</em>
            </h1>
            <p className="mt-6 text-lg font-medium text-charcoal-900">
              The dating app built around face-to-face chemistry.
            </p>
            <p className="mt-3 max-w-md leading-relaxed text-charcoal-700/90">
              Meet real people through live video speed dates before you invest
              hours texting. Because attraction isn&apos;t just a profile —
              it&apos;s a conversation.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="rounded-full bg-rose-600 px-8 py-3.5 font-medium text-cream-50 shadow-float transition-all hover:bg-rose-700"
              >
                Start dating free
              </Link>
              <Link
                href="#how-it-works"
                className="rounded-full border border-charcoal-900/20 px-7 py-3.5 font-medium text-charcoal-900 transition-colors hover:border-rose-600 hover:text-rose-700"
              >
                How it works
              </Link>
            </div>
            <p className="mt-5 text-xs text-charcoal-700/60">
              Works in your browser — no download needed. 18+ only.
            </p>
          </div>

          {/* Phone pair */}
          <div className="relative mx-auto flex items-center justify-center">
            <div className="translate-x-8 rotate-[5deg]">
              <MatchPhone />
            </div>
            <div className="relative z-10 -translate-x-6 rotate-[-4deg] animate-drift">
              <DatePhone />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Feature quartet ---------------- */}
      <section className="mx-auto w-full max-w-6xl px-5 pb-20">
        <div className="grid gap-y-10 rounded-[--radius-soft] border border-charcoal-900/8 bg-white/60 px-8 py-10 shadow-lift sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-charcoal-900/8">
          {FEATURES_QUARTET.map((f) => (
            <div key={f.title} className="flex flex-col items-center px-5 text-center">
              <span className="text-rose-500">{f.icon}</span>
              <h2 className="mt-4 text-[0.75rem] font-semibold uppercase tracking-[0.18em] text-rose-600">
                {f.title}
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-charcoal-700/85">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- How it works ---------------- */}
      <section id="how-it-works" className="grain relative bg-blush-200/60 py-20">
        <div className="mx-auto w-full max-w-6xl px-5">
          <h2 className="text-center font-display text-4xl tracking-wide text-charcoal-900">
            How it works
          </h2>
          <div aria-hidden className="mx-auto mt-3 h-0.5 w-16 rounded bg-rose-500" />

          <ol className="mt-14 grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((s, i) => (
              <li key={s.step} className="relative flex flex-col items-center text-center">
                {i < HOW_IT_WORKS.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute left-[60%] top-7 hidden w-[80%] border-t-2 border-dashed border-rose-500/40 lg:block"
                  />
                )}
                <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-lift">
                  <span className="font-display text-xl text-rose-600">
                    {s.step}
                  </span>
                </span>
                <h3 className="mt-5 text-[0.75rem] font-semibold uppercase tracking-[0.18em] text-charcoal-900">
                  {s.title}
                </h3>
                <p className="mt-2.5 max-w-[15rem] text-sm leading-relaxed text-charcoal-800/80">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- Designed for real connections ---------------- */}
      <section id="features" className="mx-auto grid w-full max-w-6xl gap-14 px-5 py-20 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 className="font-display text-4xl leading-tight text-charcoal-900">
            Designed for
            <br />
            <em className="text-rose-600">real connections</em>
          </h2>
          <div className="mt-6 max-w-lg space-y-4 leading-relaxed text-charcoal-800/90">
            <p>
              Most dating apps are built around endless swiping.{" "}
              <strong className="font-semibold text-charcoal-900">
                Swoon is built around conversations.
              </strong>
            </p>
            <p>
              By meeting face-to-face first, you know immediately if
              there&apos;s chemistry — which means less ghosting, no
              catfishing, and none of those first dates that were over before
              the drinks arrived.
            </p>
            <p className="border-l-2 border-rose-500 pl-4 font-display text-xl text-charcoal-900">
              Three minutes of real conversation says more than three weeks of
              texting.
            </p>
          </div>
        </div>

        <div>
          <Eyebrow className="text-rose-600">Features</Eyebrow>
          <ul className="mt-5 space-y-3.5">
            {FEATURE_CHECKLIST.map((item) => (
              <li key={item} className="flex items-start gap-3 text-charcoal-800">
                <span
                  aria-hidden
                  className="mt-1 flex h-4.5 w-4.5 shrink-0 items-center justify-center text-rose-600"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m3 8.5 3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-charcoal-700/60">
            Premium experiences coming soon.
          </p>
        </div>
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section id="faq" className="mx-auto w-full max-w-3xl px-5 pb-24">
        <h2 className="text-center font-display text-4xl text-charcoal-900">
          Questions, answered
        </h2>
        <div className="mt-10 divide-y divide-charcoal-900/8 rounded-[--radius-soft] border border-charcoal-900/8 bg-white/60 shadow-lift">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-charcoal-900 [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden
                  className="text-rose-500 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-charcoal-700/85">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------------- Closing CTA ---------------- */}
      <section className="on-dark grain relative overflow-hidden bg-ink-990 py-20 text-cream-100">
        <SwanMark className="absolute -right-20 -top-24 h-80 w-auto opacity-10" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-display text-4xl leading-tight">
              Ready to meet real people?{" "}
              <span aria-hidden className="text-rose-500">
                ♥
              </span>
              <br />
              <em className="text-blush-300">Your first date is minutes away.</em>
            </p>
          </div>
          <Link
            href="/signup"
            className="shrink-0 rounded-full bg-blush-300 px-9 py-4 font-medium text-charcoal-900 shadow-float transition-transform hover:scale-[1.03]"
          >
            Create your profile
          </Link>
        </div>
      </section>
    </>
  );
}
