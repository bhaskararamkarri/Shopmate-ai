# ShopMate AI — Project Architecture & Rules

## Overview
ShopMate AI is an AI-powered personal shopping agent with intelligent product discovery, comparison, recommendations, and PayPal Sandbox checkout.

## Technology Stack
- **Framework**: Next.js App Router (TypeScript)
- **Styling**: Tailwind CSS v4, shadcn/ui components (Radix primitives)
- **AI Orchestration**: Vercel AI SDK
- **Payments**: PayPal Orders API v2 & PayPal JavaScript SDK
- **Product Data**: Channel3 Product API + Local Demo Catalog fallback

## Core Architecture & Directory Structure
```
src/
├── app/                  # Next.js App Router pages & API routes
│   ├── api/              # Backend API endpoints (ai, chat, products, checkout, orders)
│   ├── chat/             # AI Shopping Chat page
│   ├── compare/          # Product Comparison page
│   ├── cart/             # Shopping Cart & Checkout page
│   ├── order-success/    # Payment Confirmation page
│   ├── layout.tsx        # Root layout with navigation & providers
│   ├── page.tsx          # Homepage / Landing & Featured products
│   └── globals.css       # Tailwind & theme styles
├── components/           # React components
│   ├── ui/               # shadcn/ui primitives
│   ├── navbar.tsx        # Navigation header
│   ├── product-card.tsx  # Product item card with price, rating, add to cart
│   ├── product-modal.tsx # Product detail & comparison modal
│   ├── chat-widget.tsx   # AI chat interface widget
│   └── cart-drawer.tsx   # Cart slide-over drawer
├── lib/                  # Utilities & services
│   ├── utils.ts          # shadcn cn() utility
│   ├── catalog.ts        # Product catalog service (Channel3 API + Demo catalog fallback)
│   ├── paypal.ts         # PayPal API v2 server integration helper
│   └── ai-tools.ts       # Vercel AI SDK tools definitions for product search & comparison
└── types/                # TypeScript interfaces
    └── index.ts          # Shared types (Product, CartItem, Order, ChatMessage)
```

## Critical Business & Security Rules
1. **Never invent product prices or availability.** All prices and inventory stats must come strictly from verified catalog records.
2. **Server-side calculation only.** Never allow client-side AI or JavaScript to calculate final payment totals. All cart totals, taxes, and shipping must be computed on the server.
3. **No exposed secrets.** Never expose PayPal Client Secrets, API keys, or private AI keys in client-side code. Use server actions or API routes.
4. **Explicit confirmation before payment.** Require explicit user confirmation before initiating PayPal payment capture.
5. **Verified payment confirmation.** Never claim a payment succeeded without validating the server-side PayPal order capture response (`status === 'COMPLETED'`).
6. **Demo vs Live distinction.** Clearly distinguish demo fallback data from live Channel3 catalog records.
