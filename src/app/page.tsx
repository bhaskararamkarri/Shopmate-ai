import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8 md:p-24">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs uppercase font-semibold">Phase 1 Complete</Badge>
            <Badge variant="default" className="text-xs uppercase font-semibold bg-emerald-600">Next.js App Router</Badge>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            ShopMate AI 🛍️🤖
          </h1>
          <p className="text-lg text-neutral-600 dark:text-neutral-400">
            An AI-powered personal shopping agent with intelligent product discovery, comparison, recommendations, and PayPal Sandbox checkout.
          </p>
        </div>

        {/* Status Card */}
        <Card className="border-neutral-200 dark:border-neutral-800 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">System Initialization Status</CardTitle>
            <CardDescription>
              Phase 1 environment verification and tooling setup are fully operational.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-neutral-700 dark:text-neutral-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-neutral-100 dark:bg-neutral-900 rounded-lg space-y-1">
                <span className="font-semibold text-neutral-900 dark:text-neutral-100 block">Framework & Styling</span>
                <span>Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui</span>
              </div>
              <div className="p-3 bg-neutral-100 dark:bg-neutral-900 rounded-lg space-y-1">
                <span className="font-semibold text-neutral-900 dark:text-neutral-100 block">Architecture & Rules</span>
                <span>Server-side price totals, strict verification rules, CLAUDE.md enforced</span>
              </div>
            </div>
            <div className="pt-2 flex items-center gap-3">
              <Button disabled variant="outline">AI Chat (Phase 2)</Button>
              <Button disabled variant="outline">Catalog (Phase 3)</Button>
              <Button disabled variant="outline">PayPal Checkout (Phase 5)</Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-neutral-500 dark:text-neutral-400 pt-8 border-t border-neutral-200 dark:border-neutral-800">
          ShopMate AI Architecture &bull; Ready for Phase 2 approval
        </div>
      </div>
    </main>
  );
}
