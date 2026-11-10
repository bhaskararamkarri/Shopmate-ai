import type { Product } from "@/types";
import type { SpecRow } from "@/lib/compare/compare-matrix";

export interface SpecGroup {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  rows: SpecRow[];
}

export interface NumericLeadResult {
  winnerIds: string[];
  ratioByProductId: Record<string, number>;
  deltaLabel: string | null;
}

interface BucketMeta {
  id: string;
  baseTitle: string;
  subtitle: string;
  icon: string;
  pattern: RegExp;
}

const BUCKETS: BucketMeta[] = [
  {
    id: "audio",
    baseTitle: "Audio & Acoustics",
    subtitle: "Soundstage, noise cancellation & acoustic architecture",
    icon: "graphic_eq",
    pattern:
      /(noise|anc|audio|sound|codec|frequency|spatial|mic|driver|output|watt|speaker|eq)/i,
  },
  {
    id: "battery",
    baseTitle: "Battery & Power Delivery",
    subtitle: "Continuous endurance and recharge turnaround",
    icon: "bolt",
    pattern: /(battery|charg|power|runtime|endurance|qi|mah|wattage)/i,
  },
  {
    id: "build",
    baseTitle: "Build, Ergonomics & Portability",
    subtitle: "Materials, weight, protection & durability",
    icon: "fitness_center",
    pattern:
      /(weight|water|ipx|ip\d|switch|keycap|case|fold|material|dimension|size|ergonom|warranty|fit|display|screen|resolution|sensor|stabiliz)/i,
  },
];

/**
 * Categorizes comparison spec rows into deterministic Stitch sections
 * ("Audio & Acoustics", "Battery & Power Delivery", "Build, Ergonomics & Portability",
 * "Connectivity & Specifications"), dropping empty sections and numbering consecutively.
 */
export function groupComparisonSpecRows(rows: SpecRow[]): SpecGroup[] {
  const bucketRows: Record<string, SpecRow[]> = {
    audio: [],
    battery: [],
    build: [],
    general: [],
  };

  for (const row of rows) {
    const matched = BUCKETS.find((b) => b.pattern.test(row.key));
    if (matched) {
      bucketRows[matched.id].push(row);
    } else {
      bucketRows.general.push(row);
    }
  }

  const orderedDefs: Array<{
    id: string;
    baseTitle: string;
    subtitle: string;
    icon: string;
  }> = [
    ...BUCKETS.map(({ id, baseTitle, subtitle, icon }) => ({
      id,
      baseTitle,
      subtitle,
      icon,
    })),
    {
      id: "general",
      baseTitle: "Connectivity & Specifications",
      subtitle: "Wireless protocols, pairing & catalog specifications",
      icon: "tune",
    },
  ];

  const groups: SpecGroup[] = [];
  let index = 1;
  for (const def of orderedDefs) {
    const items = bucketRows[def.id];
    if (items.length === 0) continue;
    groups.push({
      id: def.id,
      title: `${index}. ${def.baseTitle}`,
      subtitle: def.subtitle,
      icon: def.icon,
      rows: items,
    });
    index += 1;
  }

  return groups;
}

const SINGLE_NUMERIC_UNIT_RE =
  /^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z%°/+-]+(?:\s+[a-zA-Z]+)?)\s*$/;

const LOWER_IS_BETTER_KEY_RE =
  /(weight|latency|lag|delay|mass|price|cost|noise\s*floor)/i;
const HIGHER_IS_BETTER_KEY_RE =
  /(battery|life|endurance|brightness|output|watt|warranty|resolution|fps|refresh|distance|storage|capacity|speed|range)/i;

function normalizeUnit(raw: string): string {
  const clean = raw.toLowerCase().trim().replace(/\s+/g, " ");
  if (clean === "hr" || clean === "hrs" || clean === "hour" || clean === "hours") {
    return "hours";
  }
  if (clean === "yr" || clean === "yrs" || clean === "year" || clean === "years") {
    return "years";
  }
  if (clean === "day" || clean === "days") return "days";
  if (clean === "wk" || clean === "wks" || clean === "week" || clean === "weeks") {
    return "weeks";
  }
  if (clean === "w" || clean === "watt" || clean === "watts") return "watts";
  return clean;
}

function resolveBetterDirection(
  rowKey: string,
  products: Product[],
): "higher" | "lower" | null {
  for (const product of products) {
    const match = (product.attributes ?? []).find(
      (attr) => attr.label.toLowerCase() === rowKey.toLowerCase() && attr.better,
    );
    if (match?.better) return match.better;
  }
  if (LOWER_IS_BETTER_KEY_RE.test(rowKey)) return "lower";
  if (HIGHER_IS_BETTER_KEY_RE.test(rowKey)) return "higher";
  return null;
}

/**
 * Computes a unit-safe numeric winner ("SPEC LEAD") ONLY when >= 2 documented
 * products share an identical single numeric unit, contain no compound prose
 * clauses, have a clear directional advantage (not all tied), and know whether
 * higher or lower is better.
 */
export function computeUnitSafeLead(
  row: SpecRow,
  products: Product[],
): NumericLeadResult | null {
  const direction = resolveBetterDirection(row.key, products);
  if (!direction) return null;

  const parsedEntries: Array<{ productId: string; value: number; unit: string }> =
    [];

  for (const product of products) {
    const cell = row.values[product.id];
    if (!cell || cell.isMissing) continue;
    const raw = cell.value;
    if (raw.includes(",") || raw.includes(";") || raw.includes("/")) {
      return null;
    }
    const match = SINGLE_NUMERIC_UNIT_RE.exec(raw);
    if (!match) return null;
    const numeric = Number(match[1]);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    parsedEntries.push({
      productId: product.id,
      value: numeric,
      unit: normalizeUnit(match[2]),
    });
  }

  if (parsedEntries.length < 2) return null;

  const expectedUnit = parsedEntries[0].unit;
  if (!parsedEntries.every((entry) => entry.unit === expectedUnit)) {
    return null;
  }

  const values = parsedEntries.map((e) => e.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  if (minVal === maxVal) return null;

  const targetVal = direction === "higher" ? maxVal : minVal;
  const winnerIds = parsedEntries
    .filter((e) => e.value === targetVal)
    .map((e) => e.productId);

  if (winnerIds.length === 0 || winnerIds.length === parsedEntries.length) {
    return null;
  }

  const ratioByProductId: Record<string, number> = {};
  for (const entry of parsedEntries) {
    const ratio =
      direction === "higher"
        ? Math.round((entry.value / maxVal) * 100)
        : Math.round((minVal / entry.value) * 100);
    ratioByProductId[entry.productId] = Math.max(8, Math.min(100, ratio));
  }

  let deltaLabel: string | null = null;
  if (direction === "higher" && minVal > 0) {
    const pct = Math.round(((maxVal - minVal) / minVal) * 100);
    if (pct > 0) deltaLabel = `+${pct}% Lead`;
  } else if (direction === "lower" && maxVal > 0) {
    const pct = Math.round(((maxVal - minVal) / maxVal) * 100);
    if (pct > 0) deltaLabel = `-${pct}% Lighter`;
  }

  return {
    winnerIds,
    ratioByProductId,
    deltaLabel,
  };
}
