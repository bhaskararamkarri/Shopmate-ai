import Image from "next/image";
import {
  Camera,
  Ear,
  Headphones,
  Keyboard,
  Lamp,
  Moon,
  Mouse,
  Speaker,
  Video,
  Watch,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import type { Product, ProductGlyph, ProductTint } from "@/types";

/**
 * Drawn product tile for demo records: a wash pastel surface with a line-art
 * glyph of the product type. When a real record carries `images`, the first
 * image renders instead — the drawn tile exists so the demo needs no
 * placeholder photography.
 */
const GLYPH_ICONS: Record<ProductGlyph, LucideIcon> = {
  headphones: Headphones,
  earbuds: Ear,
  speaker: Speaker,
  keyboard: Keyboard,
  mouse: Mouse,
  lamp: Lamp,
  watch: Watch,
  "sleep-ring": Moon,
  camera: Camera,
  "action-cam": Video,
};

const TINT_CLASSES: Record<ProductTint, string> = {
  blue: "bg-[#E1F3FE] text-[#1F6C9F]",
  red: "bg-[#FDEBEC] text-[#9F2F2D]",
  green: "bg-[#EDF3EC] text-[#346538]",
  amber: "bg-[#FBF3DB] text-[#956400]",
};

type TileVariant = "banner" | "thumb" | "mini";

const PRESETS: Record<TileVariant, { container: string; icon: string }> = {
  banner: { container: "w-full aspect-4/3 rounded-none", icon: "size-14" },
  thumb: { container: "size-24 rounded-xl", icon: "size-10" },
  mini: { container: "size-14 rounded-lg", icon: "size-6" },
};

export function ProductImage({
  product,
  variant = "mini",
  className,
  imageClassName,
}: {
  product: Product;
  variant?: TileVariant;
  className?: string;
  imageClassName?: string;
}) {
  const preset = PRESETS[variant];
  const tint = TINT_CLASSES[product.visual?.tint ?? "blue"];
  const Icon = GLYPH_ICONS[product.visual?.glyph ?? "headphones"];
  const image = product.images.find((src) => Boolean(src));

  if (image) {
    return (
      <span
        className={cn(
          "relative block overflow-hidden rounded-xl bg-secondary",
          preset.container,
          className,
        )}
      >
        <Image
          src={image}
          alt={product.name}
          fill
          sizes={variant === "banner" ? "(min-width: 1024px) 260px, 50vw" : "96px"}
          className={cn("object-cover", imageClassName)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center rounded-xl ring-1 ring-inset ring-navy/5",
        preset.container,
        tint,
        className,
      )}
    >
      <Icon className={cn("translate-y-0 shrink-0", preset.icon, imageClassName)} />
    </span>
  );
}
