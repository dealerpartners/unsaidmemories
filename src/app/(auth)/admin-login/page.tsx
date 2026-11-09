import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "../auth-shell";
import { signOut } from "../actions";
import { createAuthClient } from "@/lib/supabase/server";
import {
  doorsForUser,
  isSupabaseAdmin,
  resolvePortalUser,
} from "@/lib/portal-auth";

export const metadata: Metadata = { title: "Admin — UnSaid" };
export const dynamic = "force-dynamic";

/**
 * /admin-login — the admin door (owner order, 2026-11-03).
 *
 * The admin shell bounces anyone whose session does not resolve to
 * a staff user here. What happens next depends on who arrived:
 *
 * - Signed out: on to the one sign-in (/login), destination carried.
 * - Signed in WITH admin access: straight through to the admin.
 * - Signed in WITHOUT admin access: STOP. This page is the end of
 *   the chain — it says "Access denied" and points the person at
 *   the places their account actually opens (their portal, the Ad
 *   Center, their account, the shop). Before this page existed as a
 *   real page, these visitors bounced between redirects and landed
 *   on a blank screen.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const raw = params.next || "";
  const safeNext = raw.startsWith("/") && !raw.startsWith("//") ? raw : "";

  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(safeNext || "/account")}`);
  }

  if (await isSupabaseAdmin(user.id)) {
    redirect(safeNext || "/account");
  }

  const resolved = await resolvePortalUser(user.id).catch(() => null);
  const doors = resolved
    ? doorsForUser(resolved).filter((d) => d.scope !== "admin")
    : [];
  const hasAdsDoor = doors.some((d) => d.scope === "ads");
  const email = user.email ?? "";

  return (
    <AuthShell
      eyebrow="Admin"
      heading={
        <>
          For the store&rsquo;s <em>team.</em>
        </>
      }
      sub="The admin is where the shop is run — products, orders, customers, and the books. It opens only for accounts the store has given a staff role."
    >
      <h2>Access denied</h2>
      <p>
        {email ? (
          <>
            You&rsquo;re signed in as <strong>{email}</strong>, and that
            account doesn&rsquo;t have a staff role.
          </>
        ) : (
          <>Your account doesn&rsquo;t have a staff role.</>
        )}{" "}
        Nothing is broken — here&rsquo;s where your account does work:
      </p>

      <div style={{ display: "grid", gap: 10, marginTop: 22 }}>
        {doors.map((door) => (
          <Link key={door.scope} className="auth-submit" href={door.destination}>
            Go to your {door.label}
          </Link>
        ))}
        <Link className="auth-submit" href="/account">
          Go to your account
        </Link>
        <Link className="auth-submit" href="/">
          Continue shopping
        </Link>
        {!hasAdsDoor && (
          <Link className="auth-submit" href="/advertise/get-started">
            Advertise with us
          </Link>
        )}
      </div>

      <div className="auth-alt">
        On the store&rsquo;s team?{" "}
        <form action={signOut} style={{ display: "inline" }}>
          <button
            type="submit"
            style={{
              background: "none",
              border: 0,
              borderBottom: "1px solid #aaa4b3",
              padding: "0 0 2px",
              color: "var(--ink)",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Sign in with your staff account
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
