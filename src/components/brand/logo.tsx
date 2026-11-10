import React from "react";
import { cn } from "cn";

export interface ShopMateLogoProps extends React.SVGProps<SVGSVGElement> {
  variant?: "horizontal" | "icon" | "full" | "mascot";
  size?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: "h-7 w-auto",
  md: "h-9 w-auto",
  lg: "h-11 w-auto",
  xl: "h-14 w-auto",
} as const;

/**
 * MascotBagIcon
 * The official ShopMate AI mascot:
 * A friendly shopping bag robot with handle, glowing cyan smiling eyes,
 * electric violet orbit swoosh ring, and mouse cursor pointer.
 */
function MascotBagIcon({ idPrefix = "sm" }: { idPrefix?: string }) {
  const bagGrad = `${idPrefix}-bag-grad`;
  const handleGrad = `${idPrefix}-handle-grad`;
  const swooshGrad = `${idPrefix}-swoosh-grad`;
  const glowId = `${idPrefix}-glow`;

  return (
    <g>
      <defs>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={bagGrad} x1="15%" y1="10%" x2="85%" y2="90%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="45%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id={handleGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id={swooshGrad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
      </defs>

      {/* Ambient Radial Glow */}
      <circle cx="32" cy="32" r="30" fill={`url(#${glowId})`} />

      {/* Bag Handle */}
      <path
        d="M 23 23 C 23 15, 41 15, 41 23"
        stroke={`url(#${handleGrad})`}
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Bag Body */}
      <path
        d="M 18 24 L 46 24 C 48.5 24 50.4 25.8 50.8 28.2 L 53.6 47 C 54.1 49.8 51.9 52.2 49 52.2 L 15 52.2 C 12.1 52.2 9.9 49.8 10.4 47 L 13.2 28.2 C 13.6 25.8 15.5 24 18 24 Z"
        fill={`url(#${bagGrad})`}
      />

      {/* Bag Rim Highlight */}
      <path
        d="M 17 24 L 47 24"
        stroke="#A78BFA"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* Robot Face Screen */}
      <rect
        x="17"
        y="29"
        width="30"
        height="15"
        rx="7.5"
        fill="#0B0F19"
        stroke="#1E293B"
        strokeWidth="1"
      />

      {/* Smiling Glowing Eyes */}
      <path
        d="M 23 37 Q 26 33 29 37"
        stroke="#38BDF8"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 35 37 Q 38 33 41 37"
        stroke="#38BDF8"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* Cute Smile Mouth */}
      <path
        d="M 30.5 40.5 Q 32 41.8 33.5 40.5"
        stroke="#38BDF8"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* Orbit Swoosh Ring */}
      <path
        d="M 6 44 C 5 53, 20 57, 36 54 C 48 51.5, 56 46, 58 40"
        stroke={`url(#${swooshGrad})`}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.95"
      />

      {/* Mouse Cursor Pointer */}
      <g transform="translate(38, 40) scale(0.65)">
        <path
          d="M 0 0 L 16 12 L 9.5 13 L 13.5 22 L 9 24 L 5 15 L 0 20 Z"
          fill="#FFFFFF"
          stroke="#1E1B4B"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </g>

      {/* Sparkle Stars */}
      <path
        d="M 52 14 Q 52 18 56 18 Q 52 18 52 22 Q 52 18 48 18 Q 52 18 52 14 Z"
        fill="#C084FC"
      />
      <circle cx="58" cy="22" r="1.2" fill="#E879F9" />
    </g>
  );
}

/**
 * ShopMateLogo
 * The unified official vector brand logo for ShopMate AI.
 * Supports horizontal, icon-only, and full-tagline variants.
 */
export function ShopMateLogo({
  variant = "horizontal",
  size = "md",
  showTagline = false,
  className,
  ...props
}: ShopMateLogoProps) {
  const sizeClass = SIZE_MAP[size];

  // 1. Icon-Only Variant
  if (variant === "icon" || variant === "mascot") {
    return (
      <svg
        viewBox="0 0 64 64"
        fill="none"
        role="img"
        aria-label="ShopMate AI"
        className={cn("shrink-0 select-none", sizeClass, className)}
        {...props}
      >
        <title>ShopMate AI</title>
        <MascotBagIcon idPrefix="icon" />
      </svg>
    );
  }

  // 2. Full Variant (With Tagline)
  if (variant === "full" || showTagline) {
    return (
      <svg
        viewBox="0 0 340 68"
        fill="none"
        role="img"
        aria-label="ShopMate AI"
        className={cn("shrink-0 select-none", sizeClass, className)}
        {...props}
      >
        <title>ShopMate AI</title>
        <defs>
          <linearGradient id="sm-full-mate" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <linearGradient id="sm-full-tag-swoosh" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0" />
            <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Mascot */}
        <g transform="translate(4, 2)">
          <MascotBagIcon idPrefix="full" />
        </g>

        {/* "ShopMate" Wordmark */}
        <text
          x="76"
          y="38"
          fontFamily="system-ui, -apple-system, 'Geist', sans-serif"
          fontSize="28"
          fontWeight="800"
          letterSpacing="-0.03em"
          fill="#FFFFFF"
        >
          Shop
          <tspan fill="url(#sm-full-mate)">Mate</tspan>
        </text>

        {/* "v1.0" Pill Badge */}
        <g transform="translate(230, 18)">
          <rect x="0" y="0" width="42" height="22" rx="7" fill="#8B5CF6" />
          <text
            x="21"
            y="15.5"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontSize="12"
            fontWeight="900"
            fill="#FFFFFF"
            textAnchor="middle"
            letterSpacing="0.02em"
          >
            v1.0
          </text>
          {/* Burst Rays */}
          <path d="M 32 -3 L 36 -6" stroke="#C084FC" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M 37 3 L 42 2" stroke="#C084FC" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M 35 10 L 40 12" stroke="#C084FC" strokeWidth="1.75" strokeLinecap="round" />
        </g>

        {/* Official Tagline */}
        <text
          x="77"
          y="56"
          fontFamily="system-ui, -apple-system, 'Geist', sans-serif"
          fontSize="11.5"
          fontWeight="500"
          fill="#94A3B8"
          letterSpacing="0.01em"
        >
          Shop smarter. Choose with confidence.
        </text>

        {/* Tagline Underline Swoosh */}
        <path
          d="M 175 62 Q 235 59 310 63"
          stroke="url(#sm-full-tag-swoosh)"
          strokeWidth="1.75"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }

  // 3. Horizontal Variant (Default — Optimized for Navbar & Compact Headers)
  return (
    <svg
      viewBox="0 0 248 46"
      fill="none"
      role="img"
      aria-label="ShopMate AI"
      className={cn("shrink-0 select-none", sizeClass, className)}
      {...props}
    >
      <title>ShopMate AI</title>
      <defs>
        <linearGradient id="sm-hz-mate" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>

      {/* Mascot Scaled to 42x42 */}
      <g transform="translate(1, 1) scale(0.6875)">
        <MascotBagIcon idPrefix="hz" />
      </g>

      {/* Wordmark "ShopMate" */}
      <text
        x="54"
        y="31"
        fontFamily="system-ui, -apple-system, 'Geist', sans-serif"
        fontSize="24"
        fontWeight="800"
        letterSpacing="-0.03em"
        fill="#FFFFFF"
      >
        Shop
        <tspan fill="url(#sm-hz-mate)">Mate</tspan>
      </text>

      {/* "v1.0" Pill Badge */}
      <g transform="translate(182, 13)">
        <rect x="0" y="0" width="38" height="20" rx="6" fill="#8B5CF6" />
        <text
          x="19"
          y="14.5"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontSize="12"
          fontWeight="900"
          fill="#FFFFFF"
          textAnchor="middle"
          letterSpacing="0.02em"
        >
          v1.0
        </text>
        {/* Burst Rays */}
        <path d="M 36 -2 L 40 -5" stroke="#C084FC" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M 41 3 L 45 2" stroke="#C084FC" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M 39 9 L 43 11" stroke="#C084FC" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

