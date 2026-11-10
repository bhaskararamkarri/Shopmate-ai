import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";
import { ShopProvider } from "@/lib/store";
import { Navbar } from "@/components/shop/navbar";
import { MobileBottomNav } from "@/components/shop/mobile-bottom-nav";
import { Footer } from "@/components/shop/footer";
import { ComparisonDrawer } from "@/components/compare/comparison-drawer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/* Editorial display serif — preserved for display accents. */
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://shopmate-ai.vercel.app",
  ),
  title: {
    default: "ShopMate AI — Shop smarter. Compare better. Buy with confidence.",
    template: "%s — ShopMate AI",
  },
  description:
    "Shop smarter. Compare better. Buy with confidence. An AI shopping decision engine: describe what you need, get a verified shortlist and honest trade-offs from the live catalog, compare side by side, and test sandbox checkout safely.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "ShopMate AI — Shop smarter. Compare better. Buy with confidence.",
    description:
      "An AI shopping decision engine: describe what you need, get a verified shortlist and honest trade-offs from the live catalog.",
    siteName: "ShopMate AI",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "ShopMate AI — Shop smarter. Compare better. Buy with confidence.",
      },
    ],
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${inter.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased`}
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="flex min-h-svh flex-col bg-background font-sans text-on-surface">
        <ShopProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-on-primary"
          >
            Skip to content
          </a>
          <Navbar />
          <main id="main-content" className="flex flex-1 flex-col pb-24 lg:pb-8">
            {children}
          </main>
          <Footer />
          <MobileBottomNav />
          <ComparisonDrawer />
        </ShopProvider>
      </body>
    </html>
  );
}
