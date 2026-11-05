"use client";

import { UserCog } from "lucide-react";
import { useAppStore } from "@/lib/portal-store";
import { PortalThemeSetting } from "@/components/portal/settings/PortalThemeSetting";

// ============================================================================
// Personal Settings — the admin dashboard's OWN account settings page.
// The shared Header's account menu routes "Personal Settings" to
// /<portal>/profile for every portal (navigate('profile')); the customer
// portal has its profile pages, and this is the admin face of that route —
// until now the admin menu item routed here and nothing existed.
//
// It carries the ACCOUNT's own settings only: the identity the shell is
// signed in as (the same values the Header paints) and the Appearance
// pick — the portal color profile. Tenant and platform settings live
// under /admin/settings; they are not the account's, so they are not here.
// The theme itself is stored per auth user (public.portal_user_preferences)
// and follows the account across every portal shell — see
// @/components/portal/settings/PortalThemeSetting and @/lib/portal-theme.
// ============================================================================

export default function AdminProfilePage() {
  const currentUser = useAppStore((s) => s.currentUser);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <UserCog className="size-5" />
          Personal Settings
        </h1>
      </div>

      <section className="rounded-lg border bg-card">
        <h2 className="mb-4 text-lg font-semibold">Account</h2>
        {currentUser ? (
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{currentUser.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{currentUser.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-medium capitalize">
                {String(currentUser.role).replace(/_/g, " ")}
              </dd>
            </div>
            {currentUser.membershipRole ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Membership</dt>
                <dd className="font-medium capitalize">
                  {String(currentUser.membershipRole).replace(/_/g, " ")}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your account details appear here once you are signed in.
          </p>
        )}
      </section>

      <PortalThemeSetting />
    </div>
  );
}
