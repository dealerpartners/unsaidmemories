"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Palette, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PORTAL_THEMES,
  PORTAL_THEME_LABELS,
  PORTAL_THEME_SWATCH,
  broadcastPortalTheme,
  isPortalTheme,
  type PortalTheme,
} from "@/lib/portal-theme";

// ============================================================================
// PortalThemeSetting — the Appearance section for a signed-in user's own
// portal/profile settings. ONE shared component, mounted in the established
// per-user settings surfaces (customer Settings, employee HR & Profile).
//
// The choice colors the top band + sidebar of the shared portal shell
// (Sunny, 2026-10-14: White · Black · Orange · Turquoise — "We
// shouldn't force people into a Gray"). It persists on the user's account
// through the session-scoped /api/account/theme route — never local state —
// and "Saved" shows only after the server confirms, at which point the
// shell recolors in place via broadcastPortalTheme. "Default (gray)"
// clears the preference and restores the shell's standard appearance.
// ============================================================================

type Choice = PortalTheme | "default";

const CHOICES: { value: Choice; label: string; swatch: string }[] = [
  ...PORTAL_THEMES.map((t) => ({
    value: t as Choice,
    label: PORTAL_THEME_LABELS[t],
    swatch: PORTAL_THEME_SWATCH[t],
  })),
  { value: "default" as Choice, label: "Default (gray)", swatch: "#4a4a4a" },
];

export function PortalThemeSetting() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>("default");
  const [savedChoice, setSavedChoice] = useState<Choice>("default");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/account/theme", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Could not load your theme");
        const current: Choice = isPortalTheme(j.theme) ? j.theme : "default";
        setChoice(current);
        setSavedChoice(current);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not load your theme");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const res = await fetch("/api/account/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: choice === "default" ? null : choice }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not save your theme");
      const confirmed: Choice = isPortalTheme(j.theme) ? j.theme : "default";
      setChoice(confirmed);
      setSavedChoice(confirmed);
      setSaved(true);
      broadcastPortalTheme(isPortalTheme(j.theme) ? j.theme : null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save your theme");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Palette className="size-5" />
        <h2 className="text-lg font-semibold">Appearance</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Choose the color of your portal&rsquo;s top band and sidebar. It
        follows your account across every portal you use.
      </p>
      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {CHOICES.map((c) => {
              const selected = choice === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  disabled={loading || saving}
                  onClick={() => {
                    setChoice(c.value);
                    setSaved(false);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer disabled:opacity-60",
                    selected
                      ? "border-primary ring-1 ring-primary text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
                  )}
                  aria-pressed={selected}
                >
                  <span
                    className="inline-block size-4 shrink-0 rounded-full border border-black/20"
                    style={{ backgroundColor: c.swatch }}
                  />
                  {c.label}
                  {selected && <Check className="size-4 text-primary" />}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving || loading || choice === savedChoice}>
              {saving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              {saved ? "Saved!" : "Save appearance"}
            </Button>
            {saveError && <span className="text-sm text-destructive">{saveError}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
