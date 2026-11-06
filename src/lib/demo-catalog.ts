/**
 * ShopMate AI — Demo catalog.
 *
 * Everything in this module is clearly labeled mock data used only for the
 * Phase 2 frontend. It must never be merged with live Channel3 catalog
 * records; the live feed replaces this module in later phases.
 *
 * Rules kept by design:
 * - No real stock availability, retailer prices or reviews are invented here.
 * - Prices are mock values in USD, already round numbers for demo clarity.
 * - `demo: true` on every record keeps the origin explicit.
 */
import type { Product, ProductAttribute, ProductGlyph, ProductTint } from "@/types";

export interface DemoCategory {
  id: string;
  name: string;
  /** One-line description shown on the homepage category tiles. */
  tagline: string;
  /** Example prompt used to seed a chat started from the tile. */
  prompt: string;
}

export const DEMO_CATEGORIES: DemoCategory[] = [
  {
    id: "audio",
    name: "Audio",
    tagline: "Headphones, earbuds and speakers, ranked on comfort and battery.",
    prompt: "Quiet wireless headphones under $250",
  },
  {
    id: "wearables",
    name: "Wearables",
    tagline: "Watches and rings that track runs, sleep and recovery.",
    prompt: "Track runs and sleep without charging every night",
  },
  {
    id: "workspace",
    name: "Workspace",
    tagline: "Keyboards, mice and desk lamps for long sessions.",
    prompt: "A mechanical keyboard that works with two computers at once",
  },
  {
    id: "photography",
    name: "Photography",
    tagline: "Mirrorless and action cameras for sharp, steady footage.",
    prompt: "A camera that handles 4K handheld video",
  },
];

interface DemoProductSeed {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  description: string;
  specs: Record<string, string>;
  attributes: ProductAttribute[];
  glyph: ProductGlyph;
  tint: ProductTint;
  image?: string;
}

const seeds: DemoProductSeed[] = [
  {
    id: "demo-aurora-headphones",
    name: "Aurora ANC Headphones",
    brand: "Auralia",
    category: "Audio",
    price: 249,
    description:
      "Over-ear wireless headphones with adaptive noise cancellation, dual-device pairing and a quick-charge USB-C battery.",
    specs: {
      "Battery life": "34 hours",
      "Noise cancellation": "Active, adaptive",
      Weight: "9.6 oz",
      Pairing: "Bluetooth 5.3, dual device",
      Charging: "USB-C, 10 min quick charge",
      Warranty: "2 years",
    },
    attributes: [
      { label: "Battery life", value: "34 hours", better: "higher" },
      { label: "Weight", value: "9.6 oz", better: "lower" },
    ],
    glyph: "headphones",
    tint: "blue",
    image:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "demo-bloom-earbuds",
    name: "Bloom ANC Earbuds",
    brand: "Auralia",
    category: "Audio",
    price: 129,
    description:
      "Compact in-ear earbuds with active noise cancellation, a pocket-size case and wireless Qi charging.",
    specs: {
      "Battery life": "8 hours buds, 24 with case",
      "Noise cancellation": "Active",
      Weight: "0.4 oz each",
      Pairing: "Bluetooth 5.3, multipoint",
      Charging: "USB-C case, Qi",
      Warranty: "2 years",
    },
    attributes: [
      { label: "Battery life", value: "8 hours buds, 24 with case", better: "higher" },
      { label: "Weight", value: "0.4 oz each", better: "lower" },
    ],
    glyph: "earbuds",
    tint: "red",
    image:
      "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "demo-pulse-speaker",
    name: "Pulse Portable Speaker",
    brand: "Pipeworks",
    category: "Audio",
    price: 89,
    description:
      "Pocket-size Bluetooth speaker rated for rain, with stereo pairing and 18 hours of playback.",
    specs: {
      "Battery life": "18 hours",
      "Water resistance": "IPX7",
      Weight: "1.3 lb",
      Pairing: "Bluetooth 5.2, stereo pair",
      Output: "12 W",
      Warranty: "1 year",
    },
    attributes: [
      { label: "Battery life", value: "18 hours", better: "higher" },
      { label: "Weight", value: "1.3 lb", better: "lower" },
    ],
    glyph: "speaker",
    tint: "green",
    image:
      "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "demo-lithe-keyboard",
    name: "Lithe MX Mechanical Keyboard",
    brand: "Lithe",
    category: "Workspace",
    price: 139,
    description:
      "75-percent hot-swap mechanical keyboard that stays connected to two computers at once for three months per charge.",
    specs: {
      Layout: "75%",
      Switches: "Tactile, hot-swap",
      "Battery life": "160 hours",
      Connection: "2.4 GHz, Bluetooth, USB-C",
      Backlight: "White, adjustable",
      Warranty: "3 years",
    },
    attributes: [
      { label: "Battery life", value: "160 hours", better: "higher" },
      { label: "Warranty", value: "3 years", better: "higher" },
    ],
    glyph: "keyboard",
    tint: "amber",
    image:
      "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "demo-marker-mouse",
    name: "Marker Ergonomic Mouse",
    brand: "Pipeworks",
    category: "Workspace",
    price: 79,
    description:
      "Vertical ergonomic mouse with six programmable buttons that stretches to 70 days between charges.",
    specs: {
      Sensor: "8,000 DPI",
      "Battery life": "70 days",
      Buttons: "6, programmable",
      Connection: "2.4 GHz and Bluetooth",
      Weight: "4.8 oz",
      Warranty: "2 years",
    },
    attributes: [
      { label: "Battery life", value: "70 days", better: "higher" },
      { label: "Warranty", value: "2 years", better: "higher" },
    ],
    glyph: "mouse",
    tint: "blue",
    image:
      "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "demo-verve-lamp",
    name: "Verve LED Desk Lamp",
    brand: "Lumos & Co",
    category: "Workspace",
    price: 59,
    description:
      "High color-accuracy desk lamp with five presets and two passthrough USB-C ports for the desk.",
    specs: {
      Brightness: "1,100 lumens",
      "Color range": "2700 to 5000 K",
      "Color accuracy": "CRI 95",
      Modes: "5 presets",
      Ports: "2 USB-C passthrough",
      Warranty: "2 years",
    },
    attributes: [
      { label: "Color accuracy", value: "CRI 95", better: "higher" },
    ],
    glyph: "lamp",
    tint: "amber",
    image:
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "demo-stride-watch",
    name: "Stride Fitness Watch",
    brand: "Northlane",
    category: "Wearables",
    price: 199,
    description:
      "Multisport watch with dual-band GPS, pool-safe housing and a battery measured in weeks, not nights.",
    specs: {
      "Battery life": "14 days",
      GPS: "Dual-band",
      "Water rating": "5 ATM",
      Screen: "1.2-inch AMOLED",
      Weight: "1.5 oz",
      Warranty: "2 years",
    },
    attributes: [
      { label: "Battery life", value: "14 days", better: "higher" },
      { label: "Weight", value: "1.5 oz", better: "lower" },
    ],
    glyph: "watch",
    tint: "green",
    image:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "demo-arc-ring",
    name: "Arc Sleep Ring",
    brand: "Northlane",
    category: "Wearables",
    price: 299,
    description:
      "Titanium sleep ring that reads overnight recovery, heart-rate variability and readiness with four sensors.",
    specs: {
      "Battery life": "7 days",
      Sensors: "4, sleep and HRV",
      "Water rating": "5 ATM",
      Charging: "80 minutes to full",
      Weight: "0.2 oz",
      Warranty: "1 year",
    },
    attributes: [
      { label: "Battery life", value: "7 days", better: "higher" },
      { label: "Weight", value: "0.2 oz", better: "lower" },
    ],
    glyph: "sleep-ring",
    tint: "red",
    image:
      "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "demo-lumen-camera",
    name: "Lumen M50 Mirrorless",
    brand: "Averlo",
    category: "Photography",
    price: 899,
    description:
      "APS-C mirrorless body with in-body stabilization and clean 4K60 indoors or on the street.",
    specs: {
      Sensor: "33 MP APS-C",
      Stabilization: "IBIS, 7 stops",
      Video: "4K60 10-bit",
      "Weather sealing": "Dust and light rain",
      Weight: "21.2 oz body",
      Warranty: "2 years",
    },
    attributes: [
      { label: "Stabilization", value: "IBIS, 7 stops", better: "higher" },
    ],
    glyph: "camera",
    tint: "blue",
    image:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "demo-orbit-camera",
    name: "Orbit Action Camera",
    brand: "Averlo",
    category: "Photography",
    price: 289,
    description:
      "Pocket action camera that slides into rain and shallow water and stills the frame at 4K120.",
    specs: {
      Sensor: "4K120 video",
      Waterproof: "33 ft without housing",
      Stabilization: "HyperSteady 3.0",
      "Battery life": "70 minutes",
      Weight: "5.6 oz",
      Warranty: "1 year",
    },
    attributes: [
      { label: "Waterproof", value: "33 ft without housing", better: "higher" },
    ],
    glyph: "action-cam",
    tint: "green",
    image:
      "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80",
  },
];

export const DEMO_PRODUCTS: Product[] = seeds.map((seed) => ({
  id: seed.id,
  name: seed.name,
  description: seed.description,
  price: seed.price,
  currency: "USD",
  // Mock availability only exists so the type contract is exercised; the UI
  // does not display stock for demo records (nothing here is real inventory).
  availability: "in_stock" as const,
  images: seed.image ? [seed.image] : [],
  ratings: 0,
  reviews: 0,
  category: seed.category,
  brand: seed.brand,
  specs: seed.specs,
  sku: seed.id,
  source: "demo" as const,
  demo: true,
  visual: { glyph: seed.glyph, tint: seed.tint },
  attributes: seed.attributes,
}));

export const DEMO_PRODUCT_MAP = new Map(DEMO_PRODUCTS.map((p) => [p.id, p]));

export function getDemoProduct(id: string): Product | undefined {
  return DEMO_PRODUCT_MAP.get(id);
}

export function demoProductsInCategory(categoryName: string): Product[] {
  return DEMO_PRODUCTS.filter((p) => p.category === categoryName);
}

/** Products promoted to the homepage featured rail. */
export const FEATURED_PRODUCT_IDS = [
  "demo-aurora-headphones",
  "demo-lithe-keyboard",
  "demo-stride-watch",
  "demo-lumen-camera",
];

export function getFeaturedDemoProducts(): Product[] {
  return FEATURED_PRODUCT_IDS.map((id) => DEMO_PRODUCT_MAP.get(id)).filter(
    (p): p is Product => Boolean(p),
  );
}

/** Example prompts surfaced on the homepage and in the chat empty state. */
export const DEMO_PROMPTS: string[] = [
  "Quiet wireless headphones under $250",
  "A mechanical keyboard that works with two computers at once",
  "Track runs and sleep without charging every night",
  "A camera that stays steady in 4K handheld video",
];
