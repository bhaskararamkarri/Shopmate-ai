"use client";

import { useState } from "react";import {
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
 * Product tile imagery.
 *
 * - Live (channel3) records render their real merchant/CDN image through a
 *   plain <img>: image hosts are arbitrary third parties, so they are NOT
 *   proxied through the Next.js image optimizer (no server-side fetch of
 *   untrusted URLs). A failed load falls back to the drawn tile.
 * - Demo records keep the code-drawn pastel glyph tile — no stock photography
 *   is invented anywhere.
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

function DrawnTile({
  glyph,
  tint,
  variant,
  className,
  imageClassName,
  product,
}: {
  glyph: ProductGlyph;
  tint: ProductTint;
  variant: TileVariant;
  className?: string;
  imageClassName?: string;
  product?: Product;
}) {
  const preset = PRESETS[variant];
  const tintClasses = TINT_CLASSES[tint];
  const Icon = GLYPH_ICONS[glyph];

  return (
    <span
      aria-hidden={product ? undefined : true}
      className={cn(
        "flex items-center justify-center rounded-xl ring-1 ring-inset ring-navy/5",
        preset.container,
        tintClasses,
        className,
      )}
    >
      <Icon className={cn("translate-y-0 shrink-0", preset.icon, imageClassName)} />
    </span>
  );
}

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
  const image = product.images.find((src) => Boolean(src)) ?? "";
  const [failedImage, setFailedImage] = useState<string | null>(null);

  // Reset the error fallback when a different image arrives. Done at render
  // time (the documented alternative to a setState-in-effect reset).
  if (failedImage !== null && failedImage !== image) {
    setFailedImage(null);
  }
  const failed = image !== "" && failedImage === image;

  if (image && !failed) {
    return (
      <span
        className={cn(
          "relative block overflow-hidden rounded-xl bg-secondary",
          preset.container,
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Live product
            images sit on arbitrary merchant hosts; rendering them client-side
            avoids proxying untrusted URLs through the image optimizer. */}
        <img
          src={image}
          alt={product.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedImage(image)}
          className={cn("object-cover", preset.container, imageClassName)}
        />
      </span>
    );
  }

  return (
    <DrawnTile
      product={product}
      glyph={product.visual?.glyph ?? "headphones"}
      tint={product.visual?.tint ?? "blue"}
      variant={variant}
      className={className}
      imageClassName={imageClassName}
    />
  );
}
