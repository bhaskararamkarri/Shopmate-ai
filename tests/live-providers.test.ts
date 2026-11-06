import { describe, expect, it } from "vitest";
import { runAgentTurn } from "@/lib/agent/agent";
import { getConfiguredProviders } from "@/lib/agent/provider";
import fs from "fs";
import path from "path";

// Load .env if present
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [k, ...v] = trimmed.split("=");
      if (k && !process.env[k]) {
        process.env[k] = v.join("=");
      }
    }
  }
}

describe("live provider failover validation", () => {
  it("executes a live multi-turn shopping journey using configured providers", async () => {
    // Enable multi-provider failover
    delete process.env.SHOPMATE_AI_PROVIDER;
    process.env.SHOPMATE_AI_PROVIDERS = "google,groq";

    const configured = getConfiguredProviders();
    console.log(
      "Live configured providers:",
      configured.map((c) => `${c.name} (${c.modelId})`),
    );

    if (configured.length === 0) {
      console.log("No live providers configured in .env, skipping live network call");
      return;
    }

    const start = Date.now();
    // Turn 1
    const turn1 = await runAgentTurn({
      history: [],
      message: "I need wireless noise cancelling headphones under $200",
    });

    const turn1Latency = Date.now() - start;
    console.log(
      `Turn 1 completed in ${turn1Latency}ms using model=${turn1.model} mode=${turn1.mode}`,
    );

    expect(turn1.success).toBe(true);
    expect(turn1.products.length).toBeGreaterThan(0);
    expect(turn1.intent.budgetMax).toBe(200);

    // Turn 2 — budget refinement
    const turn2Start = Date.now();
    const turn2 = await runAgentTurn({
      history: [
        { role: "user", content: "I need wireless noise cancelling headphones under $200" },
        { role: "assistant", content: turn1.content },
      ],
      message: "Actually, can you keep it under $100?",
      intent: turn1.intent,
    });

    const turn2Latency = Date.now() - turn2Start;
    console.log(
      `Turn 2 completed in ${turn2Latency}ms using model=${turn2.model} mode=${turn2.mode}`,
    );

    expect(turn2.success).toBe(true);
    expect(turn2.intent.budgetMax).toBe(100);
    expect(turn2.intent.budget?.amount).toBe(100);
    expect(turn2.products.some((p) => p.price <= 100)).toBe(true);
  }, 90_000);
});
