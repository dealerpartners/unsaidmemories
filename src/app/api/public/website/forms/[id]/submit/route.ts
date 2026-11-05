import { NextRequest, NextResponse } from "next/server";
import { getPayloadPool } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

/**
 * POST /api/public/website/forms/[id]/submit — a shopper submits a
 * Payload form (contact, newsletter-style forms). Public on purpose:
 * this is the shopper-facing write. Body: { data: { fieldName: value,
 * ... } }. One form_submissions row + one submission_data row per
 * field. Spam-shaped payloads (over 50 fields, values over 5k chars)
 * are refused rather than stored.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formId = Number(id);
  if (!Number.isInteger(formId) || formId <= 0) {
    return NextResponse.json({ error: "form id must be a number" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const data = body?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ error: "data must be an object of field values" }, { status: 400 });
  }
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 50) {
    return NextResponse.json({ error: "submit at least one field and no more than 50" }, { status: 400 });
  }
  for (const [k, v] of entries) {
    if (typeof v !== "string" || v.length > 5000 || k.length > 100) {
      return NextResponse.json({ error: "field values must be text under 5000 characters" }, { status: 400 });
    }
  }
  try {
    const pool = getPayloadPool();
    const { rows: forms } = await pool.query(`SELECT id FROM payload.forms WHERE id = $1`, [formId]);
    if (!forms[0]) return NextResponse.json({ error: "Form not found" }, { status: 404 });
    const { rows: subs } = await pool.query(
      `INSERT INTO payload.form_submissions (form_id) VALUES ($1) RETURNING id`,
      [formId],
    );
    const subId = subs[0].id;
    for (let i = 0; i < entries.length; i++) {
      const [field, value] = entries[i];
      await pool.query(
        `INSERT INTO payload.form_submissions_submission_data (_parent_id, _order, id, field, value) VALUES ($1, $2, $3, $4, $5)`,
        [subId, i + 1, `${subId}-${i + 1}`, field, value as string],
      );
    }
    return NextResponse.json({ submitted: true, submission_id: subId }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save submission" }, { status: 500 });
  }
}
