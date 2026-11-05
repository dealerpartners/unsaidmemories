import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { dispatchDuePosts } from "@/lib/integrations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET/POST /api/cron/social-publish — the headless publisher (Postiz's
 * workflow engine, Vercel-style). Vercel Cron invokes this every few
 * minutes with the CRON_SECRET bearer token; it publishes every due
 * scheduled post, refreshing expired network tokens first, and records
 * per-network results on the post.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const db = createServerClient();
  const result = await dispatchDuePosts(db);
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
