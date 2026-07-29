"use client";

import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        router.replace("/");
        router.refresh();
      }}
      className={
        className ||
        // Hidden on phones, where the header has no room; Settings carries it.
        "ml-1 hidden min-h-11 items-center rounded-full px-3.5 text-sm text-charcoal-700/70 transition-colors hover:bg-blush-100 hover:text-charcoal-900 sm:flex"
      }
    >
      Log out
    </button>
  );
}
