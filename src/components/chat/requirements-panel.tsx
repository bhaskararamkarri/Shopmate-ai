"use client";

import { useMemo } from "react";
import { AlertCircle, CheckCircle2, DollarSign, HelpCircle, Sparkles, Tag, Target } from "lucide-react";
import { DEMO_PROMPTS } from "@/lib/demo-catalog";
import { formatMoney } from "@/lib/format";
import type { Product, ShoppingIntentSummary } from "@/types";

interface RequirementsPanelProps {
  intent: ShoppingIntentSummary | null;
  products?: Product[];
  onRefine: (query: string) => void;
  onReset?: () => void;
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
  products = [],
  onRefine,
  onReset,
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

  const progressPct = Math.round((criteriaCount / 5) * 100);
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

  const telemetrySummary = useMemo(() => {
    if (products.length === 0) return null;
    const currencies = Array.from(
      new Set(products.map((p) => (p.currency || "USD").toUpperCase())),
    );
    const sameCurrency = currencies.length === 1;
    const prices = products.map((p) => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const specFieldsTotal = products.reduce(
      (sum, p) => sum + Object.keys(p.specs ?? {}).length,
      0,
    );
    const normalizedPoints = prices.map((price, idx) => {
      const x =
        products.length === 1
          ? 140
          : Math.round((idx / (products.length - 1)) * 260) + 10;
      const span = maxPrice - minPrice;
      const ratio = span > 0 ? (price - minPrice) / span : 0.5;
      const y = Math.round(28 - ratio * 22);
      return `${x},${y}`;
    });
    return {
      sameCurrency,
      currency: currencies[0] || "USD",
      minPrice,
      maxPrice,
      specFieldsTotal,
      pointsAttr: normalizedPoints.join(" "),
    };
  }, [products]);

  const activeTopic =
    intent?.productCategory ||
    intent?.category ||
    intent?.query ||
    "Open Shopping Session";

  return (
    <aside
      aria-label="Shopping requirements & refinements"
      className="flex w-full flex-col gap-3.5"
    >
      {/* Card 1: Active Stream */}
      <section className="space-y-3 rounded-xl border border-border-subtle bg-surface-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Active Stream
          </span>
          <span
            className={
              pending
                ? "inline-flex items-center gap-1 rounded-full bg-primary-fixed px-2 py-0.5 text-[11px] font-semibold text-on-primary-fixed"
                : "inline-flex items-center gap-1 rounded-full bg-secondary-fixed/50 px-2 py-0.5 text-[11px] font-semibold text-secondary"
            }
          >
            <span
              className={
                pending
                  ? "size-1.5 animate-ping rounded-full bg-primary"
                  : "size-1.5 rounded-full bg-secondary"
              }
              aria-hidden="true"
            />
            {pending ? "Evaluating" : "Live"}
          </span>
        </div>

        <div>
          <h2 className="text-base font-semibold leading-tight tracking-tight text-on-surface">
            {activeTopic}
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            {products.length > 0
              ? `${products.length} verified catalog ${products.length === 1 ? "option" : "options"} in current turn`
              : "Describe what you want to compare or verify"}
          </p>
        </div>

        <div className="space-y-1.5 rounded-lg bg-surface-container-low p-2.5">
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className="text-on-surface-variant">Criteria Captured</span>
            <span className="font-mono text-primary">{criteriaCount} / 5</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* Card 2: Active Constraints & Quick Tuning */}
      <section className="space-y-4 rounded-xl border border-border-subtle bg-surface-card p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-on-surface">
            <span
              className="material-symbols-outlined text-[18px] text-primary"
              aria-hidden="true"
            >
              tune
            </span>
            <span>Active Constraints</span>
          </div>
          {onReset && criteriaCount > 0 ? (
            <button
              type="button"
              onClick={onReset}
              className="text-[11px] font-semibold text-text-muted transition-colors hover:text-primary"
            >
              Reset
            </button>
          ) : null}
        </div>

        {criteriaCount === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant/70 bg-surface-container-low/60 p-3.5 text-center text-xs text-text-muted">
            <Sparkles className="mx-auto mb-1.5 size-4 text-primary/70" />
            <p className="font-semibold text-on-surface">No criteria captured yet</p>
            <p className="mt-1 text-[11px] leading-relaxed">
              Mention your budget, product type, or must-have features in chat.
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            {hasCategory ? (
              <div className="flex items-start gap-2 rounded-lg bg-surface-container-low p-2.5">
                <Tag className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    Category
                  </span>
                  <span className="font-semibold text-on-surface">
                    {intent?.productCategory || intent?.category}
                  </span>
                </div>
              </div>
            ) : null}

            {hasBudget ? (
              <div className="flex items-start gap-2 rounded-lg bg-surface-container-low p-2.5">
                <DollarSign className="mt-0.5 size-3.5 shrink-0 text-secondary" />
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    Target Budget
                  </span>
                  <span className="font-mono font-semibold text-on-surface">
                    {budgetDisplay}
                  </span>
                </div>
              </div>
            ) : null}

            {hasUse ? (
              <div className="flex items-start gap-2 rounded-lg bg-surface-container-low p-2.5">
                <Target className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    Intended Use
                  </span>
                  <span className="font-medium text-on-surface">
                    {intent?.intendedUse}
                  </span>
                </div>
              </div>
            ) : null}

            {hasPriorities ? (
              <div className="rounded-lg bg-surface-container-low p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  <CheckCircle2 className="size-3 text-secondary" />
                  <span>Priorities</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {intent?.priorities.map((p) => (
                    <span
                      key={p}
                      className="rounded-full border border-border-subtle bg-surface-card px-2 py-0.5 text-[11px] font-medium text-on-surface"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {hasFeatures ? (
              <div className="rounded-lg bg-surface-container-low p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  <Sparkles className="size-3 text-primary" />
                  <span>Required Features & Specs</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(intent?.requiredFeatures ?? []).map((f) => (
                    <span
                      key={f}
                      className="rounded-full bg-primary-fixed px-2 py-0.5 text-[11px] font-medium text-on-primary-fixed"
                    >
                      {f}
                    </span>
                  ))}
                  {Object.entries(intent?.requiredSpecs ?? {}).map(([k, v]) => (
                    <span
                      key={k}
                      className="rounded-full bg-primary-fixed px-2 py-0.5 text-[11px] font-medium text-on-primary-fixed"
                    >
                      {k}: {v}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {hasClarifications ? (
          <div className="space-y-1.5 rounded-xl border border-tertiary-fixed-dim/50 bg-tertiary-fixed/40 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-on-tertiary-fixed">
              <HelpCircle className="size-3.5" />
              <span>Clarification Needed</span>
            </div>
            <ul className="space-y-1 text-[12px] text-on-tertiary-fixed-variant">
              {intent?.clarifications.map((question) => (
                <li key={question} className="leading-snug">
                  • {question}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Budget Ceiling Presets */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Adjust Budget Ceiling
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            {BUDGET_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={pending}
                onClick={() => onRefine(preset.value)}
                className="h-8 rounded-lg border border-border-subtle bg-surface-container-low font-mono text-xs font-medium text-on-surface transition-colors hover:border-primary/40 hover:bg-surface-container hover:text-primary disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Refine Priorities */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Refine Priorities
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITY_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={pending}
                onClick={() => onRefine(preset.value)}
                className="rounded-full border border-border-subtle bg-surface-card px-2.5 py-1 text-left text-xs font-medium text-on-surface transition-colors hover:border-primary/40 hover:bg-surface-container-low hover:text-primary disabled:opacity-50"
              >
                + {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target Use Case */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Target Use Case
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {USE_CASE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={pending}
                onClick={() => onRefine(preset.value)}
                className="rounded-lg border border-border-subtle bg-surface-container-low px-2.5 py-2 text-left text-xs font-medium text-on-surface transition-colors hover:border-primary/40 hover:bg-surface-container hover:text-primary disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Card 3: Catalog Metrics Extracted (Strictly Grounded in Evaluated Products) */}
      <section className="space-y-2.5 rounded-xl border border-border-subtle bg-surface-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-on-surface">
            Catalog Metrics Extracted
          </span>
          <span
            className="material-symbols-outlined text-[18px] text-text-muted"
            aria-hidden="true"
          >
            analytics
          </span>
        </div>

        {telemetrySummary ? (
          <div className="space-y-2">
            <div className="space-y-1.5 rounded-lg bg-surface-container-low p-2.5">
              <div className="flex items-center justify-between text-[11px] font-medium">
                <span className="text-on-surface-variant">Shortlist Price Spread</span>
                <span className="font-mono font-semibold text-primary">
                  {telemetrySummary.sameCurrency
                    ? `${formatMoney(telemetrySummary.minPrice, telemetrySummary.currency)} – ${formatMoney(telemetrySummary.maxPrice, telemetrySummary.currency)}`
                    : "Mixed currencies"}
                </span>
              </div>
              <svg
                className="h-8 w-full stroke-primary"
                fill="none"
                viewBox="0 0 280 32"
                aria-hidden="true"
              >
                <polyline
                  points={telemetrySummary.pointsAttr}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-2.5">
              <div>
                <span className="block text-[11px] font-medium text-text-muted">
                  Verified Spec Fields
                </span>
                <span className="text-sm font-semibold text-on-surface">
                  {telemetrySummary.specFieldsTotal} documented attrs
                </span>
              </div>
              <div className="grid size-9 place-items-center rounded-full bg-secondary-fixed/40 text-secondary">
                <span
                  className="material-symbols-outlined text-[18px]"
                  aria-hidden="true"
                >
                  verified
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-surface-container-low p-3 text-xs text-text-muted">
            Price spread and documented spec counts appear automatically once catalog options are retrieved.
          </p>
        )}
      </section>

      {/* Card 4: Quick Exploration Prompts */}
      <section className="space-y-2 rounded-xl border border-border-subtle bg-surface-card p-4 shadow-sm">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Quick Exploration Prompts
        </span>
        <div className="space-y-1.5">
          {DEMO_PROMPTS.slice(0, 3).map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={pending}
              onClick={() => onRefine(prompt)}
              className="flex w-full items-center justify-between gap-2 rounded-lg p-2 text-left text-xs font-medium text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-50"
            >
              <span className="truncate">{prompt}</span>
              <span
                className="material-symbols-outlined shrink-0 text-[16px] text-text-muted"
                aria-hidden="true"
              >
                chevron_right
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-surface-container-low p-2 text-[11px] text-text-muted">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>Criteria apply strictly to this active session.</span>
        </div>
      </section>
    </aside>
  );
}
