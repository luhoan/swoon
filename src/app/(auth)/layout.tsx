import { BrandLockup, Eyebrow, SwanMark } from "@/components/brand";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_44%]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <BrandLockup />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-xs text-charcoal-700/60">
          18+ only · By continuing you agree to our{" "}
          <a href="/terms" className="underline hover:text-rose-700">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" className="underline hover:text-rose-700">
            Privacy Policy
          </a>
          .
        </p>
      </div>

      <aside className="grain relative hidden overflow-hidden bg-gradient-to-b from-blush-200 via-blush-300 to-blush-400 lg:block">
        <SwanMark className="absolute -right-24 -top-16 h-96 w-96 text-white/25" />
        <div className="absolute inset-x-0 bottom-0 p-12">
          <Eyebrow className="text-rose-700/80">
            Live video chat speed dating
          </Eyebrow>
          <p className="mt-4 font-display text-4xl leading-[1.15] text-charcoal-900">
            Three minutes,
            <br />
            face to face.
            <br />
            <span className="font-script text-5xl text-rose-700">
              Then you know.
            </span>
          </p>
        </div>
      </aside>
    </div>
  );
}
