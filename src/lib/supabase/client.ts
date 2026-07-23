"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

/** Singleton browser client. Cookie-based so the server sees the session. */
export function supabaseBrowser(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    // Private Realtime channels authorize against the user's JWT; keep the
    // realtime connection's token in sync with auth state.
    browserClient.auth.onAuthStateChange((_event, session) => {
      browserClient?.realtime.setAuth(session?.access_token ?? null);
    });
  }
  return browserClient;
}
