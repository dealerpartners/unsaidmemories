/**
 * POST /api/admin/inspire — Pollinations.ai inspiration engine
 * (architecture doc §12).
 *
 * Pollinations is an INSPIRATION provider only: it generates concept
 * artwork that enters the Konva editor as an editable image layer. It
 * never publishes or fulfills anything.
 *
 * Flow: gate → validate prompt → call gen.pollinations.ai with the
 * SERVER-ONLY key → persist the image to Supabase Storage (never trust
 * the provider URL as durable storage) → index in design_assets →
 * return { assetId, imageUrl (signed), prompt, style }.
 *
 * Body: { prompt, style?, designId?, projectId?, surprise?, themeName? }
 * With surprise:true the server picks a curated seed prompt (§12.7's
 * local-seed approach) and returns it so the user can refine it.
 * With a valid themeName, the tenant's saved theme prompt and brand
 * profile (see /api/admin/studio/theme-settings) are composed into
 * the generation prompt — user prompt → theme prompt → brand
 * guidance → style suffix — and the response reports what was
 * applied (appliedTheme / appliedBrand). No themeName (or no saved
 * settings) composes exactly as before.
 */

import type { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";
import { getTenantId } from "@/lib/tenant";
import { THEMES } from "@/lib/admin/studio-themes";
import { PLATFORM_TENANT_ID } from "@/lib/fabric/publish";
import { BUCKETS, signedUrl, uploadBytes, uploadDataUrl } from "@/lib/fabric/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const POLLINATIONS_BASE = "https://gen.pollinations.ai";

/** §12.6 merchandise prompt recipes, keyed by preset name. */
const STYLE_SUFFIXES: Record<string, string> = {
  "Screen-print graphic":
    "isolated central artwork, limited color palette, bold shapes, screen-print-friendly, no product mockup",
  "Minimal line art":
    "minimal line art, crisp contours, restrained detail, clean negative space, no product mockup",
  "Vintage tee":
    "vintage t-shirt illustration, distressed ink texture, strong silhouette, limited colors, no shirt shown",
  "Sticker style":
    "die-cut sticker illustration, bold outline, crisp edges, centered composition, no mockup",
  "Portrait":
    "stylized portrait illustration, expressive face, clean outline, centered composition, no text unless requested",
  "Mug graphic":
    "wide horizontal composition, readable at small size, strong contrast, isolated artwork, no mug shown",
  "Embroidery concept":
    "simple bold shapes, minimal tiny details, limited thread-like colors, embroidery concept preview",
};

const SURPRISE_SEEDS: { prompt: string; style: string }[] = [
  { prompt: "a grandmother's recipe card reimagined as a retro badge with rolling pin and wheat", style: "Vintage tee" },
  { prompt: "two friends as constellations connected by a single golden thread", style: "Minimal line art" },
  { prompt: "a beloved grandmother on a porch swing at golden hour, storybook style", style: "Portrait" },
  { prompt: "the words 'kin keeper' in warm hand-lettered script with small flowers", style: "Screen-print graphic" },
  { prompt: "a porch swing under string lights with two coffee cups", style: "Mug graphic" },
  { prompt: "a family tree whose branches are holding hands", style: "Minimal line art" },
];

interface InspireBody {
  prompt?: unknown;
  style?: unknown;
  designId?: unknown;
  projectId?: unknown;
  surprise?: unknown;
  /**
   * The studio's currently selected theme (a name from
   * lib/admin/studio-themes). When valid, the tenant's theme prompt
   * + brand profile are composed into the generation prompt.
   * Unknown names are ignored, never an error.
   */
  themeName?: unknown;
  /** Aspect-ratio lock from the studio (e.g. "4:5") or explicit size. */
  ratio?: unknown;
  width?: unknown;
  height?: unknown;
  /**
   * Sketch-to-AI: a data-URL PNG of the user's sketch board. When
   * present, the sketch is first saved to the design's asset vault,
   * then offered to Pollinations as an image-to-image input
   * (model "kontext"). If that path is unavailable, the response
   * reports mode "reference": the sketch stays pinned as the
   * reference and the picture is generated from the words alone.
   */
  imageDataUrl?: unknown;
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: InspireBody = {};
  try {
    body = (await req.json()) as InspireBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  let style = typeof body.style === "string" ? body.style.trim() : "";
  if (body.surprise === true && !prompt) {
    const seed = SURPRISE_SEEDS[Math.floor(Math.random() * SURPRISE_SEEDS.length)];
    prompt = seed.prompt;
    style = style || seed.style;
  }
  if (!prompt) {
    return Response.json({ error: "Prompt is required" }, { status: 400 });
  }
  if (prompt.length > 700) {
    return Response.json(
      { error: "Enter a prompt up to 700 characters." },
      { status: 400 },
    );
  }

  // Aspect-ratio lock: explicit width/height win; otherwise the ratio
  // maps to a generation size whose shape matches the print area.
  const RATIO_SIZES: Record<string, [number, number]> = {
    "1:1": [1024, 1024],
    "4:5": [1024, 1280],
    "3:2": [1280, 853],
  };
  const clampDim = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(2048, Math.max(256, Math.round(v)))
      : null;
  const ratioSize =
    typeof body.ratio === "string" ? RATIO_SIZES[body.ratio] : undefined;
  const genWidth = clampDim(body.width) ?? ratioSize?.[0] ?? 1024;
  const genHeight = clampDim(body.height) ?? ratioSize?.[1] ?? 1024;

  const { getIntegrationKey } = await import("@/lib/integrations/keys");
  const apiKey = await getIntegrationKey("POLLINATIONS_API_KEY");
  if (!apiKey) {
    return Response.json(
      {
        error:
          "AI inspiration is not configured on the server (POLLINATIONS_API_KEY missing).",
      },
      { status: 503 },
    );
  }

  const db = createServerClient();

  // ── Theme + brand composition ──────────────────────────────────
  // When the studio sends a valid themeName, load the tenant's
  // saved settings (same tables + tenant resolution as
  // /api/admin/studio/theme-settings) and compose them between the
  // user's prompt and the style suffix, in this order:
  //   user prompt → theme prompt → brand guidance → style suffix.
  // Settings are an enhancement only: an unknown theme name is
  // ignored, and any load failure (or simply no saved settings)
  // leaves the composed prompt byte-identical to the pre-settings
  // behavior below.
  let appliedTheme: string | null = null;
  let appliedBrand = false;
  const contextParts: string[] = [];
  const themeName =
    typeof body.themeName === "string" ? body.themeName.trim() : "";
  if (themeName && THEMES.some((t) => t.name === themeName)) {
    try {
      const tenantId = getTenantId();
      const [themeRes, brandRes] = await Promise.all([
        db
          .from("theme_prompts")
          .select("prompt")
          .eq("tenant_id", tenantId)
          .eq("theme_name", themeName)
          .maybeSingle(),
        db
          .from("brand_profiles")
          .select("brand_summary, brand_colors, brand_voice, prompt_guidance")
          .eq("tenant_id", tenantId)
          .maybeSingle(),
      ]);
      const themePrompt =
        typeof themeRes.data?.prompt === "string"
          ? themeRes.data.prompt.trim()
          : "";
      if (themePrompt) {
        contextParts.push(themePrompt);
        appliedTheme = themeName;
      }
      const b = brandRes.data;
      if (b) {
        const brandParts = [
          typeof b.brand_summary === "string" ? b.brand_summary.trim() : "",
          typeof b.brand_colors === "string" && b.brand_colors.trim()
            ? `Brand colors: ${b.brand_colors.trim()}`
            : "",
          typeof b.brand_voice === "string" && b.brand_voice.trim()
            ? `Brand voice: ${b.brand_voice.trim()}`
            : "",
          typeof b.prompt_guidance === "string" ? b.prompt_guidance.trim() : "",
        ].filter(Boolean);
        if (brandParts.length) {
          contextParts.push(brandParts.join(", "));
          appliedBrand = true;
        }
      }
    } catch {
      // Settings could not be loaded — generate exactly as before.
      appliedTheme = null;
      appliedBrand = false;
      contextParts.length = 0;
    }
  }

  const suffix =
    STYLE_SUFFIXES[style] ??
    "clean composition, strong silhouette, merchandise-ready graphic, centered subject, crisp edges, high contrast";
  const finalPrompt = contextParts.length
    ? `${prompt}. ${contextParts.join(". ")}. ${suffix}, avoid mockup photography, avoid garment/product photos, no watermark`
    : `${prompt}. ${suffix}, avoid mockup photography, ` +
      "avoid garment/product photos, no watermark";
  const slug =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "concept";

  // ── Sketch-to-AI (whiteboard delivery) ──────────────────────────
  // Save the sketch to the design's asset vault FIRST (it is the
  // user's own work — it must survive even if generation fails),
  // then try image-to-image with it. Any failure of the img2img
  // attempt falls back to words-only generation with the sketch
  // reported back as the pinned reference (mode "reference").
  let mode: "text" | "img2img" | "reference" = "text";
  let genModel = "flux";
  let sketchAssetId: string | null = null;
  let sketchImageUrl: string | null = null;
  let upstream: Response | null = null;

  const sketchDataUrl =
    typeof body.imageDataUrl === "string" &&
    body.imageDataUrl.startsWith("data:image/") &&
    body.imageDataUrl.length < 12_000_000
      ? body.imageDataUrl
      : null;
  if (sketchDataUrl) {
    try {
      const sketchPath = `sketches/${Date.now()}-${slug}.png`;
      const ref = (await uploadDataUrl(db, BUCKETS.assets, sketchPath, sketchDataUrl)).ref;
      const { data: sketchAsset } = await db
        .from("design_assets")
        .insert({
          tenant_id: PLATFORM_TENANT_ID,
          project_id: typeof body.projectId === "string" ? body.projectId : null,
          design_id: typeof body.designId === "string" ? body.designId : null,
          kind: "sketch",
          storage_path: sketchPath,
          bucket: BUCKETS.assets,
          mime_type: "image/png",
          provider: "studio-sketch",
          prompt,
          metadata: { source: "whiteboard" },
        })
        .select("id")
        .single();
      sketchAssetId = sketchAsset?.id ?? null;
      sketchImageUrl = await signedUrl(db, ref);

      if (sketchImageUrl) {
        const i2i = new URL(
          `${POLLINATIONS_BASE}/image/${encodeURIComponent(finalPrompt)}`,
        );
        i2i.searchParams.set("model", "kontext");
        i2i.searchParams.set("image", sketchImageUrl);
        i2i.searchParams.set("width", String(genWidth));
        i2i.searchParams.set("height", String(genHeight));
        i2i.searchParams.set("nologo", "true");
        try {
          const r = await fetch(i2i, {
            headers: { Authorization: `Bearer ${apiKey}` },
            cache: "no-store",
            signal: AbortSignal.timeout(90_000),
          });
          const ct = r.headers.get("content-type") ?? "";
          if (r.ok && ct.startsWith("image/")) {
            upstream = r;
            mode = "img2img";
            genModel = "kontext";
          } else {
            mode = "reference";
          }
        } catch {
          mode = "reference";
        }
      }
    } catch {
      // Vault/generation hiccup on the sketch path — never lose the
      // request: fall through to the plain text-to-image flow.
      mode = "reference";
    }
  }

  if (!upstream) {
    const url = new URL(
      `${POLLINATIONS_BASE}/image/${encodeURIComponent(finalPrompt)}`,
    );
    url.searchParams.set("model", "flux");
    url.searchParams.set("width", String(genWidth));
    url.searchParams.set("height", String(genHeight));
    url.searchParams.set("nologo", "true");

    try {
      upstream = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      return Response.json(
        { error: "Image generation timed out. Try again." },
        { status: 504 },
      );
    }
  }

  if (!upstream.ok) {
    if (upstream.status === 401) {
      return Response.json(
        { error: "Pollinations rejected the server key. Check POLLINATIONS_API_KEY." },
        { status: 502 },
      );
    }
    if (upstream.status === 402) {
      return Response.json(
        { error: "Pollinations budget exhausted (402). Top up the Pollen balance to keep generating." },
        { status: 402 },
      );
    }
    if (upstream.status === 429) {
      return Response.json(
        { error: "Pollinations rate limit hit. Wait a moment and retry." },
        { status: 429 },
      );
    }
    return Response.json(
      { error: "Image generation failed. Try again or change the prompt." },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return Response.json(
      { error: "The image provider returned an unexpected response." },
      { status: 502 },
    );
  }
  const bytes = Buffer.from(await upstream.arrayBuffer());

  // Persist to Supabase Storage + index in design_assets (§12.3).
  const path = `inspiration/${Date.now()}-${slug}.png`;
  const ref = await uploadBytes(db, BUCKETS.assets, path, bytes, "image/png");

  const { data: asset, error: aErr } = await db
    .from("design_assets")
    .insert({
      tenant_id: PLATFORM_TENANT_ID,
      project_id: typeof body.projectId === "string" ? body.projectId : null,
      design_id: typeof body.designId === "string" ? body.designId : null,
      kind: "inspiration",
      storage_path: path,
      bucket: BUCKETS.assets,
      mime_type: "image/png",
      width: genWidth,
      height: genHeight,
      provider: "pollinations",
      prompt,
      metadata: {
        style: style || null,
        model: genModel,
        finalPrompt,
        mode,
        sketchAssetId,
      },
    })
    .select("id")
    .single();
  if (aErr) {
    return Response.json(
      { error: `Generated but failed to index the asset: ${aErr.message}` },
      { status: 500 },
    );
  }

  const imageUrl = await signedUrl(db, ref);
  return Response.json({
    assetId: asset.id,
    imageUrl,
    ref,
    prompt,
    style: style || null,
    // Sketch-to-AI reporting: "img2img" = the picture was generated
    // FROM the sketch; "reference" = image-to-image was unavailable,
    // the sketch is saved in the vault (sketchAssetId) and pinned as
    // the reference while the picture came from the words alone;
    // "text" = no sketch was sent.
    mode,
    model: genModel,
    sketchAssetId,
    sketchImageUrl,
    // Theme-settings reporting: appliedTheme = the theme whose saved
    // prompt was composed into this generation (null when none was);
    // appliedBrand = the tenant's brand profile contributed at
    // least one non-empty field to the composed prompt.
    appliedTheme,
    appliedBrand,
  });
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  return Response.json({
    endpoint: "/api/admin/inspire",
    method: "POST",
    provider: "pollinations",
    body: {
      prompt: "string (required, <=700 chars)",
      style: "string (optional preset name)",
      surprise: "boolean (optional — curated seed prompt)",
      themeName: "string (optional — a studio theme name; composes the tenant's saved theme prompt + brand profile into the prompt)",
      designId: "string (optional)",
      projectId: "string (optional)",
      imageDataUrl: "string (optional — sketch PNG data URL; saved to the vault, then tried as an image-to-image input)",
    },
    returns: {
      assetId: "string",
      imageUrl: "string (signed)",
      prompt: "string",
      mode: '"img2img" | "reference" | "text"',
      sketchAssetId: "string | null",
      sketchImageUrl: "string | null",
      appliedTheme: "string | null",
      appliedBrand: "boolean",
    },
    configured: Boolean(process.env.POLLINATIONS_API_KEY),
    presets: Object.keys(STYLE_SUFFIXES),
  });
}
