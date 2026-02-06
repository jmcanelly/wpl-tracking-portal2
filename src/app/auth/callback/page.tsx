"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Suspense } from "react";

function parseHashParams() {
  const hash = window.location.hash?.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash || "";
  return new URLSearchParams(hash);
}

function CallbackHandler() {
  const sp = useSearchParams();

  useEffect(() => {
    (async () => {
      try {
        // Handle PKCE / code flow
        const code = sp.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("exchangeCodeForSession error:", error);
            window.location.replace("/login");
            return;
          }
        }

        // Handle implicit / hash token flow
        const hp = parseHashParams();
        const err = hp.get("error");

        // If link expired but user already has a session, continue
        if (err) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            window.location.replace("/shipments");
            return;
          }
          window.location.replace("/login");
          return;
        }

        const access_token = hp.get("access_token");
        const refresh_token = hp.get("refresh_token");

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) {
            console.error("setSession error:", error);
            window.location.replace("/login");
            return;
          }
          // Clean URL
          window.history.replaceState({}, document.title, "/auth/callback");
        }

        // Final session check
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          window.location.replace("/login");
          return;
        }

        window.location.replace("/shipments");
      } catch (e) {
        console.error("callback error:", e);
        window.location.replace("/login");
      }
    })();
  }, [sp]);

  return (
    <div className="rounded-2xl border border-[var(--wpl-border)] bg-white p-6 shadow-sm">
      Signing you in…
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="rounded-2xl border border-[var(--wpl-border)] bg-white p-6 shadow-sm">
        Loading…
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
