"use client";

import { useState, useCallback, useEffect } from "react";

/* ─── User type ─── */

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: "owner" | "admin" | "editor" | "viewer";
  accountId: string;
  accountName: string;
  plan?: {
    tier: "starter" | "medium" | "pro" | "enterprise";
    label: string;
    status: "active" | "trial" | "past_due" | "canceled";
  };
  permissions: string[];
  lastLoginAt: string;
}

/* ─── Auth state singleton ─── */

let cachedUser: CurrentUser | null = null;
let listeners: Array<() => void> = [];

function emitChange() {
  for (const l of listeners) l();
}

/* ─── Real identity ───
   This hook originally shipped with the Musicosy kit: unless
   NEXT_PUBLIC_API_URL was set (it never is in this app) it returned a
   hardcoded template user — "Alex Rivera" of "My Advertiser
   Account" — so every advertiser saw a stranger's name in the shell.
   It now reads the app's real records: the session user from
   /api/auth/session and the advertiser from /api/ads/account. */

// The working permission set of an advertiser who owns their account.
const ADVERTISER_PERMISSIONS = [
  "campaigns:read", "campaigns:write", "campaigns:delete",
  "ads:read", "ads:write",
  "audiences:read", "audiences:write",
  "creatives:read", "creatives:write",
  "leads:read", "leads:write",
  "billing:read",
  "settings:read", "settings:write",
  "team:read", "team:write",
  "analytics:read",
  "reports:read", "reports:write",
];

/* ─── Hook: useCurrentUser ─── */

export function useCurrentUser(): {
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [user, setUser] = useState<CurrentUser | null>(cachedUser);
  const [loading, setLoading] = useState(!cachedUser);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessRes, acctRes] = await Promise.all([
        fetch("/api/auth/session", { credentials: "include" }),
        fetch("/api/ads/account", { credentials: "include" }),
      ]);
      const sess = sessRes.ok ? await sessRes.json().catch(() => null) : null;
      const su = sess?.user ?? null;
      if (!su) {
        cachedUser = null;
        setUser(null);
        return;
      }
      const acct = acctRes.ok ? await acctRes.json().catch(() => null) : null;
      const advertiser = acct?.advertiser ?? null;
      const email = su.email || "";
      const businessName =
        typeof advertiser?.display_name === "string" && advertiser.display_name.trim()
          ? advertiser.display_name.trim()
          : null;
      cachedUser = {
        id: su.id,
        name: su.name || businessName || email.split("@")[0] || "Your account",
        email,
        avatarUrl: su.avatarUrl || undefined,
        role: "owner",
        accountId: advertiser?.id ? String(advertiser.id) : su.id,
        accountName: businessName || su.name || "Personal account",
        permissions:
          advertiser && advertiser.status === "active"
            ? ADVERTISER_PERMISSIONS
            : [],
        lastLoginAt: su.lastSignInAt || "",
      };
      setUser(cachedUser);
    } catch (e: any) {
      setError(e.message || "Failed to fetch user");
      setUser(null);
    } finally {
      setLoading(false);
      emitChange();
    }
  }, []);

  useEffect(() => {
    if (!cachedUser) fetchUser();
  }, [fetchUser]);

  // Subscribe to external changes (e.g. after sign-out clears cache)
  useEffect(() => {
    const handler = () => setUser(cachedUser);
    listeners.push(handler);
    return () => {
      listeners = listeners.filter((l) => l !== handler);
    };
  }, []);

  return { user, loading, error, refetch: fetchUser };
}

/* ─── Hook: useSignOut ─── */

export function useSignOut(): {
  signOut: () => Promise<void>;
  signingOut: boolean;
} {
  const [signingOut, setSigningOut] = useState(false);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Even if the server call fails, we still clear local state
    } finally {
      // Clear all local state
      cachedUser = null;
      emitChange();

      // Clear any stored tokens
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("refresh_token");
        sessionStorage.clear();
      }

      // Back to the one sign-in door, returning to Ads afterwards
      if (typeof window !== "undefined") {
        window.location.href = "/login?next=/ads";
      }

      setSigningOut(false);
    }
  }, []);

  return { signOut, signingOut };
}

/* ─── Hook: useAuth (combined) ─── */

export function useAuth() {
  const { user, loading, error, refetch } = useCurrentUser();
  const { signOut, signingOut } = useSignOut();

  return {
    user,
    loading,
    error,
    refetch,
    signOut,
    signingOut,
    isAuthenticated: !!user,
    hasPermission: (perm: string) => user?.permissions.includes(perm) ?? false,
  };
}
