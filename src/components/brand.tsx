import Image from "next/image";
import Link from "next/link";

/**
 * Brand components built from the supplied artwork (logo.png / title.png).
 * Transparent derivatives live in public/brand — originals are untouched.
 */

/** The pink swan mark, cropped from title.png. Decorative by default. */
export function SwanMark({
  className = "h-8 w-auto",
  alt = "",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <Image
      src="/brand/swan.png"
      width={640}
      height={621}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      className={className}
    />
  );
}

/** The "Swoon" logotype (heart in the second o), cropped from title.png. */
export function Wordmark({
  className = "h-5 w-auto",
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <Image
      src="/brand/wordmark.png"
      width={640}
      height={143}
      alt="Swoon"
      // The logotype is near-black; on dark chrome render it white.
      className={`${className} ${onDark ? "brightness-0 invert" : ""}`}
    />
  );
}

/** The rounded-square app icon (logo.png). Reads well on dark surfaces. */
export function AppIcon({
  className = "h-8 w-8 rounded-lg",
}: {
  className?: string;
}) {
  return (
    <Image
      src="/brand/app-icon.png"
      width={512}
      height={512}
      alt="Swoon"
      className={className}
    />
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
      // shrink-0: as a flex child the lockup would otherwise be crushed to a
      // few pixels when the nav beside it runs out of room.
      className={`group inline-flex min-h-11 shrink-0 items-center gap-2 ${className}`}
      aria-label="Swoon"
    >
      <SwanMark className="h-9 w-auto transition-transform group-hover:-rotate-6" />
      {/* Below 360px the mark alone carries the brand; there isn't room for
          both the wordmark and the navigation. */}
      <Wordmark
        className="h-[1.15rem] w-auto max-[359px]:hidden"
        onDark={dark}
      />
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
