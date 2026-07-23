import Link from "next/link";

/**
 * The swan mark, redrawn as vector so it stays crisp at any size and can be
 * tinted. Shape follows the supplied logo: raised wing, curved neck, small
 * heart floating at the beak.
 */
export function SwanMark({
  className = "h-8 w-8",
  title = "Swoon",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label={title}
    >
      {/* wing */}
      <path
        d="M14 40c2.5-9 9.5-15.5 19-17.5-4 4.5-5.5 9-5 13.5 3.5-6 8.5-9.5 15-10.5-3.5 4-5 8-4.5 12 3-3.5 7-5.5 12-6-5 3.5-8 7.5-9 12.5-.4 2-2 3.5-4 3.5H21c-3.8 0-7.3-2.9-7-7.5Z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* neck and head */}
      <path
        d="M40 47.5c7-1 11.5-5.5 11.5-12.5 0-5-2.5-7.8-2.5-11.5 0-3.2 2-5.5 4.5-6.5-1.2-.6-2.6-.9-4-.8-4.4.3-7.5 3.9-7.5 8.3 0 5.5 3 8.5 3 13 0 4.5-2.5 8-5 10Z"
        fill="currentColor"
      />
      {/* heart at the beak */}
      <path
        d="M55.2 13.2c1-1.2 2.8-1.2 3.8-.1 1 1.1.9 2.9-.2 3.9l-3.4 3-3.1-3.3c-1-1.1-1-2.9.1-3.9 1.1-1 2.8-.9 3.8.4Z"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}

export function BrandLockup({
  href = "/",
  dark = false,
  className = "",
}: {
  href?: string;
  dark?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group inline-flex items-center gap-2 ${className}`}
    >
      <SwanMark
        className={`h-7 w-7 transition-transform group-hover:-rotate-6 ${
          dark ? "text-blush-300" : "text-rose-500"
        }`}
      />
      <span
        className={`font-display text-2xl font-medium tracking-tight ${
          dark ? "text-cream-100" : "text-charcoal-900"
        }`}
      >
        Sw<span className={dark ? "text-blush-300" : "text-rose-500"}>oo</span>n
      </span>
    </Link>
  );
}

/** Letter-spaced small-caps label used as section eyebrows across the site. */
export function Eyebrow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-[0.6875rem] font-semibold uppercase tracking-[0.28em] ${className}`}
    >
      {children}
    </p>
  );
}
