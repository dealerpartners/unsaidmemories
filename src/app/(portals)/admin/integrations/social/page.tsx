import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { listAccounts } from "@/lib/integrations/service";
import { SOCIAL_PROVIDERS, getProviderCredentials, redirectUri } from "@/lib/integrations/providers";
import Subnav from "../subnav";
import SocialClient from "./social-client";

export const metadata: Metadata = { title: "Social accounts — Admin" };
export const dynamic = "force-dynamic";

export default async function SocialAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  const db = createServerClient();
  const accounts = await listAccounts(db);
  const providers: Array<{
    id: string;
    label: string;
    blurb: string;
    color: string;
    scopes: string[];
    configured: boolean;
    credentialSource: "env" | "settings" | null;
    envKeys: string[];
    callbackUrl: string;
  }> = [];
  for (const p of SOCIAL_PROVIDERS) {
    const creds = await getProviderCredentials(p);
    providers.push({
      id: p.id,
      label: p.label,
      blurb: p.blurb,
      color: p.color,
      scopes: p.scopes,
      configured: !!creds,
      credentialSource: creds?.source ?? null,
      envKeys: [p.envClientId, p.envClientSecret],
      callbackUrl: redirectUri(p),
    });
  }
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Social accounts</h1>
      </div>
      <Subnav />
      {params.connected && <div className="int-banner ok">{params.connected}</div>}
      {params.error && <div className="int-banner err">{params.error}</div>}
      <SocialClient
        providers={providers}
        accounts={accounts.map((a) => ({
          id: a.id,
          network: a.network,
          handle: a.handle,
          display_name: a.display_name,
          avatar_url: a.avatar_url,
          status: a.status,
          token_expires_at: a.token_expires_at,
          created_at: a.created_at,
        }))}
      />
    </div>
  );
}
