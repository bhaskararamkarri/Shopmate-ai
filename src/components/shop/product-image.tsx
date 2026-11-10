"use client";

import { useState } from "react";
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
 * Product tile imagery.
 *
 * - Records with curated or live merchant imagery render through a plain <img>
 *   inside a Stitch #FAFAFC framed well (arbitrary hosts aren't proxied through
 *   the image optimizer). Failed loads fall back cleanly to DrawnTile.
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
  blue: "bg-[#EEF4FF] text-[#3B5CCC]",
  red: "bg-[#FEF1F2] text-[#B4232C]",
  green: "bg-[#ECFDF5] text-[#047857]",
  amber: "bg-[#FFFBEB] text-[#B45309]",
};

type TileVariant = "banner" | "thumb" | "mini";

const PRESETS: Record<TileVariant, { container: string; icon: string }> = {
  banner: { container: "w-full aspect-4/3 rounded-xl", icon: "size-14" },
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
        "flex items-center justify-center rounded-xl border border-border",
        preset.container,
        tintClasses,
        className,
      )}
    >
      <Icon
        className={cn("translate-y-0 shrink-0", preset.icon, imageClassName)}
      />
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

  if (failedImage !== null && failedImage !== image) {
    setFailedImage(null);
  }
  const failed = image !== "" && failedImage === image;

  if (image && !failed) {
    return (
      <span
        className={cn(
          "relative block overflow-hidden rounded-xl border border-border bg-[#FAFAFC]",
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
          loading="eager"
          referrerPolicy="no-referrer"
          onError={() => setFailedImage(image)}
          className={cn("size-full object-cover", imageClassName)}
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
