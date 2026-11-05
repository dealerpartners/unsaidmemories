/**
 * GET|PUT /api/admin/studio/theme-settings — the storage behind the
 * Design Studio's Theme settings box (owner order 2026-10-30).
 *
 * Two kinds of settings, both per tenant (migration 20261030100000):
 *   - brand_profiles: ONE row per tenant — the shop's brand
 *     architecture (summary, colors, voice, extra prompt guidance).
 *   - theme_prompts: one row per (tenant, theme) — the prompt the AI
 *     should use for that Designs-panel theme.
 *
 * GET returns { brand: {...} | null, themes: { [themeName]: prompt } }.
 * PUT accepts { brand?, themeName?, prompt? } and upserts whichever
 * parts are present (brand and a theme prompt may arrive together).
 * A theme prompt saved empty clears that theme's row — "no custom
 * prompt" is then simply the absence of a row.
 *
 * /api/admin/inspire reads the same tables when a generation runs with
 * a theme selected, composing: user prompt → theme prompt → brand
 * guidance → style suffix.
 */

import type { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";
import { getTenantId } from "@/lib/tenant";
import { THEMES } from "@/lib/admin/studio-themes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THEME_NAMES = new Set(THEMES.map((t) => t.name));
const MAX_FIELD = 4000;

interface BrandFields {
  brandSummary: string | null;
  brandColors: string | null;
  brandVoice: string | null;
  promptGuidance: string | null;
}

function tenantOrError(): { tenantId: string } | { error: Response } {
  try {
    return { tenantId: getTenantId() };
  } catch (e) {
    return {
      error: Response.json(
        { error: e instanceof Error ? e.message : "Tenant is not configured." },
        { status: 500 },
      ),
    };
  }
}

/** Coerce one incoming brand field: string → trimmed ("" → null),
 *  null/undefined → undefined (leave unchanged), anything else → error. */
function coerceField(v: unknown): string | null | undefined | { error: string } {
  if (v === undefined || v === null) return v === null ? null : undefined;
  if (typeof v !== "string") return { error: "Brand fields must be text." };
  if (v.length > MAX_FIELD) {
    return { error: `Brand fields are limited to ${MAX_FIELD} characters.` };
  }
  const t = v.trim();
  return t === "" ? null : t;
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const t = tenantOrError();
  if ("error" in t) return t.error;

  const db = createServerClient();
  const [brandRes, themesRes] = await Promise.all([
    db
      .from("brand_profiles")
      .select("brand_summary, brand_colors, brand_voice, prompt_guidance")
      .eq("tenant_id", t.tenantId)
      .maybeSingle(),
    db
      .from("theme_prompts")
      .select("theme_name, prompt")
      .eq("tenant_id", t.tenantId),
  ]);
  if (brandRes.error) {
    return Response.json({ error: brandRes.error.message }, { status: 500 });
  }
  if (themesRes.error) {
    return Response.json({ error: themesRes.error.message }, { status: 500 });
  }

  const b = brandRes.data;
  const brand: BrandFields | null = b
    ? {
        brandSummary: (b.brand_summary as string | null) ?? null,
        brandColors: (b.brand_colors as string | null) ?? null,
        brandVoice: (b.brand_voice as string | null) ?? null,
        promptGuidance: (b.prompt_guidance as string | null) ?? null,
      }
    : null;

  const themes: Record<string, string> = {};
  for (const row of themesRes.data ?? []) {
    themes[row.theme_name as string] = row.prompt as string;
  }
  return Response.json({ brand, themes });
}

interface PutBody {
  brand?: unknown;
  themeName?: unknown;
  prompt?: unknown;
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const t = tenantOrError();
  if ("error" in t) return t.error;

  let body: PutBody = {};
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasBrand = body.brand !== undefined && body.brand !== null;
  const hasTheme = body.themeName !== undefined && body.themeName !== null;
  if (!hasBrand && !hasTheme) {
    return Response.json(
      { error: "Nothing to save: send a brand profile and/or a theme prompt." },
      { status: 400 },
    );
  }

  const db = createServerClient();
  const now = new Date().toISOString();

  if (hasBrand) {
    if (typeof body.brand !== "object" || Array.isArray(body.brand)) {
      return Response.json({ error: "brand must be an object." }, { status: 400 });
    }
    const incoming = body.brand as Record<string, unknown>;
    // Partial saves merge over the stored row so an untouched field is
    // never wiped by a save that only edited another field.
    const { data: existing, error: readErr } = await db
      .from("brand_profiles")
      .select("brand_summary, brand_colors, brand_voice, prompt_guidance")
      .eq("tenant_id", t.tenantId)
      .maybeSingle();
    if (readErr) {
      return Response.json({ error: readErr.message }, { status: 500 });
    }
    const merged: Record<string, string | null> = {
      brand_summary: (existing?.brand_summary as string | null) ?? null,
      brand_colors: (existing?.brand_colors as string | null) ?? null,
      brand_voice: (existing?.brand_voice as string | null) ?? null,
      prompt_guidance: (existing?.prompt_guidance as string | null) ?? null,
    };
    const pairs: [string, string][] = [
      ["brandSummary", "brand_summary"],
      ["brandColors", "brand_colors"],
      ["brandVoice", "brand_voice"],
      ["promptGuidance", "prompt_guidance"],
    ];
    for (const [camel, snake] of pairs) {
      if (!(camel in incoming)) continue;
      const v = coerceField(incoming[camel]);
      if (v && typeof v === "object") {
        return Response.json({ error: v.error }, { status: 400 });
      }
      merged[snake] = (v as string | null | undefined) ?? null;
    }
    const { error } = await db
      .from("brand_profiles")
      .upsert(
        {
          tenant_id: t.tenantId,
          ...merged,
          updated_at: now,
          updated_by: gate.userId,
        },
        { onConflict: "tenant_id" },
      );
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  if (hasTheme) {
    const themeName = typeof body.themeName === "string" ? body.themeName : "";
    if (!THEME_NAMES.has(themeName)) {
      return Response.json(
        { error: `"${themeName}" is not one of the studio's themes.` },
        { status: 400 },
      );
    }
    if (typeof body.prompt !== "string") {
      return Response.json(
        { error: "prompt is required when themeName is sent." },
        { status: 400 },
      );
    }
    if (body.prompt.length > MAX_FIELD) {
      return Response.json(
        { error: `Theme prompts are limited to ${MAX_FIELD} characters.` },
        { status: 400 },
      );
    }
    const prompt = body.prompt.trim();
    if (prompt === "") {
      const { error } = await db
        .from("theme_prompts")
        .delete()
        .eq("tenant_id", t.tenantId)
        .eq("theme_name", themeName);
      if (error) return Response.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await db
        .from("theme_prompts")
        .upsert(
          {
            tenant_id: t.tenantId,
            theme_name: themeName,
            prompt,
            updated_at: now,
            updated_by: gate.userId,
          },
          { onConflict: "tenant_id,theme_name" },
        );
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true });
}
