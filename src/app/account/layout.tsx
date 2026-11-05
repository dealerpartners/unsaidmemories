import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";
import { signOut } from "../(auth)/actions";
import { AccountRail } from "./account-rail";
import "./account.css";

export const dynamic = "force-dynamic";

// Account center shell — Sunny's customer account mockup: the
// "Everything, in one place." heading, signed-in line, and the left
// rail; each rail entry is a REAL route under /account (no hash
// views). Sections render into the content column.
export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/account");
  }

  return (
    <main className="section" style={{ paddingTop: 28, paddingBottom: 80 }}>
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Your account</span>
          <h2>
            Everything, <em>in one place.</em>
          </h2>
        </div>
        <div className="heading-aside">
          <p>Signed in as {user.email}.</p>
          <form action={signOut}>
            <button type="submit" className="text-link">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <div className="ua-wrap">
        <div className="ua-layout">
          <AccountRail />
          <div>{children}</div>
        </div>
      </div>
    </main>
  );
}
