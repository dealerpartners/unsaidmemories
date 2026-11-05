"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Bell, Heart, MessageSquare, Package, Settings, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { getCartSessionId } from "@/lib/commerce/cart-client";
import { GoogleMark } from "@/components/google-mark";

/**
 * Account flyout — opens from the header's Account control, the same
 * way the search overlay opens from its icon: a backdrop + panel,
 * dismissed by the X, the backdrop, or any link inside.
 *
 * Signed-out visitors sign in INSIDE the flyout (POST /api/auth/login
 * sets the session cookies; no navigation happens). On success the
 * guest session cart is claimed for the account (POST /api/cart/claim)
 * so a bag built as a guest is still there at checkout — carts are
 * database rows keyed by session id (kept in localStorage) until they
 * are claimed, then by customer id. The visitor stays exactly where
 * they were: same page, same scroll, same search, same checkout.
 */

interface Me {
  id: string;
  email: string;
  name: string | null;
}

export function AccountFlyout() {
  const open = useStore((s) => s.accountOpen);
  const setOpen = useStore((s) => s.setAccountOpen);
  const pathname = usePathname();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadMe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/customers/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMe({ id: data.id, email: data.email, name: data.name });
      } else {
        setMe(null);
      }
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadMe();
  }, [open, loadMe]);

  if (!open) return null;

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Sign-in failed. Check your email and password.");

      // Claim the guest bag before anything else touches the cart, so
      // the session-keyed rows become this customer's rows.
      try {
        await fetch("/api/cart/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: getCartSessionId() }),
        });
      } catch {
        // A failed claim never blocks the sign-in itself; the guest
        // cart still exists under its session id.
      }

      setPassword("");
      await loadMe();
      // The cart page reads its identity once on mount — reload it in
      // place so the just-claimed bag is what's on screen. Everywhere
      // else the flyout simply updates; nobody is navigated away.
      if (pathname === "/cart") window.location.reload();
    } catch (err: any) {
      setError(err?.message || "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // The session cookie is cleared server-side; carry on regardless.
    }
    setMe(null);
    setBusy(false);
    setOpen(false);
    if (pathname.startsWith("/account") || pathname.startsWith("/checkout")) {
      router.push("/");
    } else {
      router.refresh();
    }
  }

  return (
    <div className="account-backdrop" onClick={() => setOpen(false)}>
      <aside
        className="account-flyout"
        role="dialog"
        aria-modal="true"
        aria-label="Your account"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="icon-btn account-flyout-close" aria-label="Close account" onClick={() => setOpen(false)}>
          <X size={19} />
        </button>

        {loading ? (
          <p className="account-flyout-note">One moment…</p>
        ) : me ? (
          <>
            <span className="eyebrow">Your account</span>
            <h2 className="account-flyout-name">{me.name || "Welcome back"}</h2>
            <p className="account-flyout-email">{me.email}</p>
            <nav className="account-flyout-links">
              {/* The account center is real routes under /account —
              each link lands on that section's own page. */}
              <Link href="/account/orders" onClick={() => setOpen(false)}>
                <Package size={16} /> Orders &amp; tracking
              </Link>
              <Link href="/account/saved" onClick={() => setOpen(false)}>
                <Heart size={16} /> Saved items
              </Link>
              <Link href="/account/posts" onClick={() => setOpen(false)}>
                <MessageSquare size={16} /> Reviews &amp; questions
              </Link>
              <Link href="/account/notifications" onClick={() => setOpen(false)}>
                <Bell size={16} /> Notifications
              </Link>
              <Link href="/account/preferences" onClick={() => setOpen(false)}>
                <Settings size={16} /> Preferences &amp; addresses
              </Link>
            </nav>
            <Link
              href="/account"
              className="button button-dark account-flyout-submit"
              onClick={() => setOpen(false)}
            >
              Open your account <ArrowRight size={15} />
            </Link>
            <button className="account-flyout-signout" onClick={signOut} disabled={busy}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <span className="eyebrow">Welcome</span>
            <h2 className="account-flyout-name">Sign in, <em>stay right here.</em></h2>
            <p className="account-flyout-note">
              Your bag, your orders, and your checkout all pick up right where you left them.
            </p>
            <a
              className="button account-flyout-google"
              href={`/api/auth/google?next=${encodeURIComponent(pathname || "/account")}`}
            >
              <GoogleMark size={17} /> Sign in with Google
            </a>
            <div className="account-flyout-or"><span>or</span></div>
            <form className="account-flyout-form" onSubmit={signIn}>
              <label>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                />
              </label>
              {error && <p className="account-flyout-error">{error}</p>}
              <button type="submit" className="button button-dark account-flyout-submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"} <ArrowRight size={15} />
              </button>
            </form>
            <p className="account-flyout-alt">
              New to UnSaid?{" "}
              <Link href="/signup" onClick={() => setOpen(false)}>
                Create an account
              </Link>{" "}
              ·{" "}
              <Link href="/help" onClick={() => setOpen(false)}>
                Need help?
              </Link>
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
