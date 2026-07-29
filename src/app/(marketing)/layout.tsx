import Link from "next/link";
import { BrandLockup, SwanMark, Wordmark } from "@/components/brand";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/safety", label: "Safety" },
  { href: "/#faq", label: "FAQ" },
];

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-charcoal-900/6 bg-cream-50/85 backdrop-blur">
        <div className="mx-auto flex h-[4.25rem] w-full max-w-6xl items-center justify-between px-5">
          <BrandLockup />
          <nav className="hidden items-center gap-7 md:flex" aria-label="Site">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex min-h-11 items-center text-sm text-charcoal-800 transition-colors hover:text-rose-700"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {/* min-h-11 keeps these comfortably tappable on a phone. */}
            <Link
              href="/login"
              className="flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-charcoal-800 transition-colors hover:bg-blush-100"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="flex min-h-11 items-center rounded-full bg-rose-600 px-5 text-sm font-medium text-cream-50 shadow-lift transition-all hover:bg-rose-700"
            >
              Start dating
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="on-dark bg-ink-990 text-cream-100">
        <div className="mx-auto w-full max-w-6xl px-5 py-14">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5">
                <SwanMark className="h-9 w-auto" />
                <Wordmark className="h-[1.1rem] w-auto" onDark />
              </div>
              <p className="mt-3 max-w-[16rem] text-sm leading-relaxed text-cream-100/60">
                Live video speed dating for real people looking for real
                connections.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cream-100/50">
                Product
              </p>
              <ul className="mt-3 space-y-1 text-sm text-cream-100/80">
                <li><Link href="/#how-it-works" className="inline-flex min-h-10 items-center hover:text-blush-300">How it works</Link></li>
                <li><Link href="/#features" className="inline-flex min-h-10 items-center hover:text-blush-300">Features</Link></li>
                <li><Link href="/#faq" className="inline-flex min-h-10 items-center hover:text-blush-300">FAQ</Link></li>
                <li><Link href="/signup" className="inline-flex min-h-10 items-center hover:text-blush-300">Create an account</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cream-100/50">
                Safety
              </p>
              <ul className="mt-3 space-y-1 text-sm text-cream-100/80">
                <li><Link href="/safety" className="inline-flex min-h-10 items-center hover:text-blush-300">Safety &amp; guidelines</Link></li>
                <li><Link href="/privacy" className="inline-flex min-h-10 items-center hover:text-blush-300">Privacy policy</Link></li>
                <li><Link href="/terms" className="inline-flex min-h-10 items-center hover:text-blush-300">Terms of service</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cream-100/50">
                Company
              </p>
              <ul className="mt-3 space-y-1 text-sm text-cream-100/80">
                <li><span className="cursor-default text-cream-100/40">About us — soon</span></li>
                <li>
                  <a href="mailto:info@tryswoon.live" className="inline-flex min-h-10 items-center hover:text-blush-300">
                    info@tryswoon.live
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <p className="mt-12 border-t border-cream-100/10 pt-6 text-xs text-cream-100/40">
            © 2026 Swoon. All rights reserved. Swoon is for adults 18+.
          </p>
        </div>
      </footer>
    </div>
  );
}
