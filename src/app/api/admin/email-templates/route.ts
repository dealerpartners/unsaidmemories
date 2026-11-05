import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { EMAIL_TEMPLATES, TEMPLATE_GROUPS } from "@/lib/email/templates"
import { sendTemplateTest } from "@/lib/email"
import { SITE_URL } from "@/lib/site-url"

// ---------------------------------------------------------------------------
// GET  /api/admin/email-templates
//   The full email template catalog — every template UnSaid Memories sends,
//   sample-rendered, for the Email Template Studio.
//
// POST /api/admin/email-templates  { templateId, to }
//   Sends a test email (sample data) to a chosen address via the same
//   audit-trailed Resend pipeline production uses.
//
// Admin-gated. Supabase-paste templates are served here too — the studio's
// copy button is how they get into the Supabase dashboard editor.
//
// previewHtml: the studio iframe renders srcDoc content that INHERITS the
// parent origin, so rewriting the site's absolute URLs (https://www.unsaidmemories.com/…)
// to same-origin paths (/…) makes brand assets like the paw logo load in the
// preview wherever the admin app runs — sandbox preview or production —
// instead of 404ing on the production domain before a deploy lands.
// The `html` field (what Copy HTML gives you, and what test sends use) keeps
// the absolute production URLs, which email clients require.
// ---------------------------------------------------------------------------

function toPreviewHtml(html: string): string {
  return SITE_URL ? html.split(`${SITE_URL}/`).join("/") : html
}

export async function GET() {
  const gate = await requireModuleApi("communications", "read")
  if (gate) return gate

  return NextResponse.json({
    groups: TEMPLATE_GROUPS,
    templates: EMAIL_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      group: t.group,
      channel: t.channel,
      description: t.description,
      subject: t.subject,
      html: t.html,
      previewHtml: toPreviewHtml(t.html),
      supabasePath: t.supabasePath,
      notes: t.notes,
      wired: t.wired,
    })),
  })
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("communications", "write")
  if (gate) return gate

  try {
    const body = await req.json().catch(() => ({}))
    const templateId = String(body?.templateId || "")
    const to = String(body?.to || "").trim()

    if (!templateId) return NextResponse.json({ error: "templateId is required" }, { status: 400 })
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: "A valid recipient email is required" }, { status: 400 })
    }

    const result = await sendTemplateTest(templateId, to)
    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Send failed" }, { status: 400 })
    }
    return NextResponse.json({ ok: true, messageId: result.messageId })
  } catch (e) {
    console.error("[admin/email-templates] test send failed:", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 })
  }
}
