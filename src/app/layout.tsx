import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ShopProvider } from "@/lib/store";
import { Navbar } from "@/components/shop/navbar";
import { Footer } from "@/components/shop/footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ShopMate AI — Your Personal AI Shopping Assistant",
    template: "%s — ShopMate AI",
  },
  description:
    "Ask a plain-language question, get ranked picks with honest trade-offs, and build a cart you steer. AI shopping agent with product discovery, comparison and checkout-ready totals.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="flex min-h-svh flex-col bg-background font-sans text-foreground">
        <ShopProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
          >
            Skip to content
          </a>
          <Navbar />
          <main id="main-content" className="flex flex-1 flex-col">
            {children}
          </main>
          <Footer />
        </ShopProvider>
      </body>
    </html>
  );
}
