import type { Metadata } from "next";
import { getAuthorizeNetConfig, isAuthorizeNetConfigured } from "@/lib/authorize-net";
import { PaymentSection } from "../payment-section";

export const metadata: Metadata = { title: "Payment — UnSaid" };
export const dynamic = "force-dynamic";

export default async function AccountPaymentPage() {
  let anet: { api_login_id: string; public_client_key: string; accept_js_url: string } | null = null;
  if (await isAuthorizeNetConfigured()) {
    const cfg = await getAuthorizeNetConfig();
    anet = {
      api_login_id: cfg.loginId,
      public_client_key: cfg.publicClientKey,
      accept_js_url: cfg.acceptJsUrl,
    };
  }
  return <PaymentSection anet={anet} />;
}
