"use client";

import { useMemo } from "react";
import {
  SlidersHorizontal,
  DollarSign,
  Tag,
  Target,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ShoppingIntentSummary } from "@/types";

interface RequirementsPanelProps {
  intent: ShoppingIntentSummary | null;
  onRefine: (query: string) => void;
  pending?: boolean;
}

const BUDGET_PRESETS = [
  { label: "< $50", value: "Please keep the budget strictly under $50" },
  { label: "< $100", value: "Please keep the budget strictly under $100" },
  { label: "< $200", value: "Please keep the budget strictly under $200" },
  { label: "< $350", value: "Please keep the budget strictly under $350" },
  { label: "< $500", value: "Please keep the budget strictly under $500" },
];

const PRIORITY_PRESETS = [
  { label: "Battery Life", value: "Prioritize maximum battery life and endurance" },
  { label: "Noise Cancellation", value: "Prioritize strong active noise cancellation (ANC)" },
  { label: "Comfort / Fit", value: "Prioritize lightweight comfort for long wear" },
  { label: "Sound Quality", value: "Prioritize premium audiophile sound fidelity and bass" },
  { label: "Water Resistance", value: "Must have water / sweat resistance rating" },
  { label: "Built-in Mic", value: "Must have clear microphone for calls and meetings" },
];

const USE_CASE_PRESETS = [
  { label: "Travel & Commute", value: "Intended use is frequent travel and noisy daily commutes" },
  { label: "Gym & Sports", value: "Intended use is workouts, running, and athletic training" },
  { label: "Work & Calls", value: "Intended use is remote work, zoom meetings, and daily calls" },
  { label: "Casual Everyday", value: "Intended use is relaxed daily home listening" },
];

export function RequirementsPanel({
  intent,
  onRefine,
  pending = false,
}: RequirementsPanelProps) {
  const hasCategory = Boolean(intent?.productCategory || intent?.category);
  const hasBudget = Boolean(
    intent?.budgetMax !== undefined || intent?.budget?.amount !== undefined,
  );
  const hasUse = Boolean(intent?.intendedUse);
  const hasFeatures = Boolean(
    (intent?.requiredFeatures && intent.requiredFeatures.length > 0) ||
      (intent?.requiredSpecs && Object.keys(intent.requiredSpecs).length > 0),
  );
  const hasPriorities = Boolean(intent?.priorities && intent.priorities.length > 0);
  const hasClarifications = Boolean(
    intent?.clarifications && intent.clarifications.length > 0,
  );

  const criteriaCount = useMemo(() => {
    let count = 0;
    if (hasCategory) count++;
    if (hasBudget) count++;
    if (hasUse) count++;
    if (hasFeatures) count++;
    if (hasPriorities) count++;
    return count;
  }, [hasCategory, hasBudget, hasUse, hasFeatures, hasPriorities]);

  const currency = intent?.currency || intent?.budget?.currency || "USD";
  const budgetDisplay = useMemo(() => {
    if (!hasBudget) return null;
    const max = intent?.budgetMax ?? intent?.budget?.amount;
    const min = intent?.budgetMin;
    if (min !== undefined && max !== undefined) {
      return `${min} – ${max} ${currency}`;
    }
    return `Up to ${max} ${currency}`;
  }, [hasBudget, intent?.budgetMax, intent?.budget?.amount, intent?.budgetMin, currency]);

  return (
    <aside
      aria-label="Shopping requirements & refinements"
      className="flex h-full w-full flex-col overflow-y-auto border-border bg-card/60 p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Shopping Context
          </h2>
        </div>
        {criteriaCount > 0 && (
          <Badge variant="secondary" className="text-[11px] font-medium">
            {criteriaCount} detected
          </Badge>
        )}
      </div>

      <div className="mt-4 flex-1 space-y-5">
        {/* Active Requirements Card */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active Requirements
          </h3>

          {criteriaCount === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-3.5 text-center text-xs text-muted-foreground">
              <Sparkles className="mx-auto mb-1.5 size-4 text-muted-foreground/60" />
              <p>No requirements identified yet.</p>
              <p className="mt-1 text-[11px]">
                Mention your budget, target category, or required features in chat.
              </p>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl border border-border bg-background p-3 text-xs">
              {hasCategory && (
                <div className="flex items-start gap-2">
                  <Tag className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <div>
                    <span className="font-medium text-muted-foreground">Category: </span>
                    <span className="font-semibold text-foreground">
                      {intent?.productCategory || intent?.category}
                    </span>
                  </div>
                </div>
              )}

              {hasBudget && (
                <div className="flex items-start gap-2">
                  <DollarSign className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <span className="font-medium text-muted-foreground">Budget: </span>
                    <span className="font-semibold text-foreground">
                      {budgetDisplay}
                    </span>
                  </div>
                </div>
              )}

              {hasUse && (
                <div className="flex items-start gap-2">
                  <Target className="mt-0.5 size-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                  <div>
                    <span className="font-medium text-muted-foreground">Intended Use: </span>
                    <span className="text-foreground">{intent?.intendedUse}</span>
                  </div>
                </div>
              )}

              {hasPriorities && (
                <div className="flex items-start gap-2 pt-1">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="space-y-1">
                    <span className="font-medium text-muted-foreground">Priorities:</span>
                    <div className="flex flex-wrap gap-1">
                      {intent?.priorities.map((p) => (
                        <span
                          key={p}
                          className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {hasFeatures && (
                <div className="flex items-start gap-2 pt-1">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                  <div className="space-y-1">
                    <span className="font-medium text-muted-foreground">Features:</span>
                    <div className="flex flex-wrap gap-1">
                      {(intent?.requiredFeatures ?? []).map((f) => (
                        <span
                          key={f}
                          className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                        >
                          {f}
                        </span>
                      ))}
                      {Object.entries(intent?.requiredSpecs ?? {}).map(([k, v]) => (
                        <span
                          key={k}
                          className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                        >
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Clarifications Needed */}
        {hasClarifications && (
          <section className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <HelpCircle className="size-3.5" />
              <span>Clarification Needed</span>
            </div>
            <ul className="space-y-1.5 text-[12px] text-muted-foreground">
              {intent?.clarifications.map((question) => (
                <li key={question} className="leading-snug">
                  • {question}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Interactive Refinement: Budget Presets */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Adjust Budget Ceiling
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {BUDGET_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => onRefine(preset.value)}
                className="h-7 text-xs font-medium"
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </section>

        {/* Interactive Refinement: Priority Toggles */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Refine Priorities
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITY_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={pending}
                onClick={() => onRefine(preset.value)}
                className="rounded-lg border border-border bg-background px-2.5 py-1 text-left text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent disabled:opacity-50"
              >
                + {preset.label}
              </button>
            ))}
          </div>
        </section>

        {/* Interactive Refinement: Intended Use Presets */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Target Use Case
          </h3>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {USE_CASE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={pending}
                onClick={() => onRefine(preset.value)}
                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>

        {/* Privacy Note */}
        <div className="flex items-center gap-2 rounded-lg bg-secondary/50 p-2 text-[11px] text-muted-foreground">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>Intent is maintained within this session only.</span>
        </div>
      </div>
    </aside>
  );
}

