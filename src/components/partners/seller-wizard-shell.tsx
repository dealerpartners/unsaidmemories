"use client";

// ---------------------------------------------------------------------------
// partners/wizard-shell.tsx — the shared partner-onboarding wizard shell.
//
// VENDORED TEMPORARY SHELL (Crew B, ship/onb-seller): Crew A's canonical
// copy lives on branch ship/onb-core and is merged by the parent. This
// file implements exactly the contract Crew B was given so the swap is
// a one-line import change:
//
//   props { steps: { key, label }[], current, onStep, children, saving, error }
//
// `current` is the KEY of the active step; `onStep(key)` fires when the
// applicant picks a step in the stepper. Two optional extras the seller
// wizard uses — `completed` (keys shown with a check) and `locked`
// (keys rendered disabled with a lock; picking one does not fire
// onStep) — default to empty, so the contract surface is unchanged.
// ---------------------------------------------------------------------------

import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardShellStep {
  key: string;
  label: string;
}

export interface WizardShellProps {
  steps: WizardShellStep[];
  /** Key of the active step. */
  current: string;
  onStep: (key: string) => void;
  children: React.ReactNode;
  saving?: boolean;
  error?: string | null;
  /** Optional: keys rendered as completed (check instead of number). */
  completed?: ReadonlySet<string> | string[];
  /** Optional: keys rendered locked (sequential gating). */
  locked?: ReadonlySet<string> | string[];
}

function toSet(v: ReadonlySet<string> | string[] | undefined): Set<string> {
  if (!v) return new Set();
  return v instanceof Set ? new Set(v) : new Set(v);
}

export function WizardShell({
  steps,
  current,
  onStep,
  children,
  saving = false,
  error,
  completed,
  locked,
}: WizardShellProps) {
  const done = toSet(completed as ReadonlySet<string> | string[] | undefined);
  const lockedSet = toSet(locked as ReadonlySet<string> | string[] | undefined);
  const currentIdx = Math.max(
    0,
    steps.findIndex((s) => s.key === current),
  );
  const total = steps.length;

  return (
    <div className="min-h-full bg-background p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Seller Onboarding</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Step {currentIdx + 1} of {total} — {steps[currentIdx]?.label}
          </p>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={currentIdx + 1}
            aria-valuemin={1}
            aria-valuemax={total}
          >
            <div
              className="h-full rounded-full bg-brand-teal transition-all"
              style={{ width: `${((currentIdx + 1) / total) * 100}%` }}
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <nav aria-label="Onboarding steps" className="rounded-xl border bg-card p-4">
            <ol className="space-y-1">
              {steps.map((step, i) => {
                const isCurrent = step.key === current;
                const isDone = done.has(step.key);
                const isLocked = lockedSet.has(step.key);
                return (
                  <li key={step.key}>
                    <button
                      type="button"
                      disabled={isLocked}
                      aria-current={isCurrent ? "step" : undefined}
                      onClick={() => onStep(step.key)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                        isCurrent
                          ? "bg-brand-teal/10 font-semibold text-brand-teal"
                          : isLocked
                            ? "cursor-not-allowed text-muted-foreground/60"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
                          isCurrent
                            ? "border-brand-teal/40"
                            : isDone
                              ? "border-brand-teal bg-brand-teal text-white"
                              : "border-border bg-background",
                        )}
                      >
                        {isLocked ? (
                          <Lock className="h-3 w-3" />
                        ) : isDone && !isCurrent ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span className="truncate">{step.label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 px-3 text-xs text-muted-foreground">
              Steps unlock in order. Your progress saves to your application as you complete each
              step — leave and resume any time.
            </p>
          </nav>

          <div className="rounded-xl border bg-card">
            <div className="p-6">
              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-200">
                  {error}
                </div>
              )}
              {children}
              {saving && (
                <p className="mt-4 text-sm text-muted-foreground">Saving to your application…</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
