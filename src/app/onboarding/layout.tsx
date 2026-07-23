import { BrandLockup } from "@/components/brand";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between px-6 py-6 sm:px-12">
        <BrandLockup />
      </header>
      <main className="mx-auto w-full max-w-xl px-6 pb-16">{children}</main>
    </div>
  );
}
