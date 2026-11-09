import { generateText, tool } from "ai";
import { z } from "zod";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  createGoogleModel,
  createCerebrasModel,
  createGroqModel,
  createOpenRouterModel,
  resolveModelId,
} from "../src/lib/agent/provider";

// Load .env.local then .env
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
}

interface TestResult {
  provider: string;
  model: string;
  configured: boolean;
  authStatus: "PASS" | "FAIL" | "NOT_CONFIGURED";
  generation: {
    status: "PASS" | "FAIL" | "SKIPPED";
    latencyMs: number;
    response?: string;
    error?: string;
  };
  toolCalling: {
    status: "PASS" | "FAIL" | "SKIPPED";
    latencyMs: number;
    toolCalled?: boolean;
    error?: string;
  };
}

const providers = [
  {
    name: "google" as const,
    getKey: () =>
      process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY,
    create: (key: string, modelId: string) =>
      createGoogleModel(key, { modelId }),
  },
  {
    name: "cerebras" as const,
    getKey: () => process.env.CEREBRAS_API_KEY,
    create: (key: string, modelId: string) =>
      createCerebrasModel(key, { modelId }),
  },
  {
    name: "groq" as const,
    getKey: () => process.env.GROQ_API_KEY,
    create: (key: string, modelId: string) =>
      createGroqModel(key, { modelId }),
  },
  {
    name: "openrouter" as const,
    getKey: () => process.env.OPENROUTER_API_KEY,
    create: (key: string, modelId: string) =>
      createOpenRouterModel(key, { modelId }),
  },
];

const mockTool = tool({
  description: "Search products in the catalog",
  inputSchema: z.object({
    query: z.string().describe("Search query terms"),
    limit: z.number().optional().describe("Maximum items"),
  }),
  execute: async ({ query }) => {
    return {
      results: [
        {
          id: "shoe-1",
          title: `Demo running shoes for ${query}`,
          price: 99,
        },
      ],
    };
  },
});

function sanitizeError(err: unknown): string {
  if (!err) return "Unknown error";
  let str = (err as Error).message || String(err);
  // Redact any potential API key patterns or bearer tokens
  str = str.replace(/(?:key|bearer|token|secret)[=:\s]+[A-Za-z0-9_\-\.]{10,}/gi, "[REDACTED]");
  return str.slice(0, 300);
}

async function run() {
  console.log("=================================================");
  console.log("       ShopMate AI — Live Provider Tests        ");
  console.log("=================================================");

  const results: TestResult[] = [];

  for (const p of providers) {
    const key = p.getKey();
    const modelId = resolveModelId(p.name);
    console.log(`\nTesting provider: [${p.name.toUpperCase()}] with model: [${modelId}]`);

    if (!key || key.trim().length === 0) {
      console.log(`  -> Key not configured, skipping.`);
      results.push({
        provider: p.name,
        model: modelId,
        configured: false,
        authStatus: "NOT_CONFIGURED",
        generation: { status: "SKIPPED", latencyMs: 0 },
        toolCalling: { status: "SKIPPED", latencyMs: 0 },
      });
      continue;
    }

    const model = p.create(key.trim(), modelId);

    // Test 1: Simple Generation & Auth Verification
    let genStatus: "PASS" | "FAIL" = "FAIL";
    let genLatency = 0;
    let genResponse: string | undefined;
    let genError: string | undefined;

    try {
      const start = Date.now();
      const res = await generateText({
        model,
        prompt: "Respond with the word 'HELLO' and nothing else.",
      });
      genLatency = Date.now() - start;
      genStatus = "PASS";
      genResponse = res.text.trim().replace(/\r?\n/g, " ").slice(0, 50);
      console.log(`  [Generation] PASS (${genLatency}ms): "${genResponse}"`);
    } catch (e) {
      genStatus = "FAIL";
      genError = sanitizeError(e);
      console.log(`  [Generation] FAIL: ${genError}`);
    }

    // Test 2: Tool Calling Verification
    let toolStatus: "PASS" | "FAIL" = "FAIL";
    let toolLatency = 0;
    let toolCalled = false;
    let toolError: string | undefined;

    try {
      const start = Date.now();
      const res = await generateText({
        model,
        tools: {
          searchProducts: mockTool,
        },
        prompt: "Use the searchProducts tool to search for 'running shoes'.",
      });
      toolLatency = Date.now() - start;
      toolCalled = (res.toolCalls && res.toolCalls.length > 0) || false;
      if (toolCalled || res.text.length > 0) {
        toolStatus = "PASS";
        console.log(`  [Tool Calling] PASS (${toolLatency}ms, toolCalls=${res.toolCalls?.length ?? 0})`);
      } else {
        toolStatus = "FAIL";
        toolError = "No tool call executed and no response text";
        console.log(`  [Tool Calling] FAIL: ${toolError}`);
      }
    } catch (e) {
      toolStatus = "FAIL";
      toolError = sanitizeError(e);
      console.log(`  [Tool Calling] FAIL: ${toolError}`);
    }

    results.push({
      provider: p.name,
      model: modelId,
      configured: true,
      authStatus: genStatus === "PASS" ? "PASS" : "FAIL",
      generation: {
        status: genStatus,
        latencyMs: genLatency,
        response: genResponse,
        error: genError,
      },
      toolCalling: {
        status: toolStatus,
        latencyMs: toolLatency,
        toolCalled,
        error: toolError,
      },
    });
  }

  console.log("\n=================================================");
  console.log("                 SUMMARY TABLE                   ");
  console.log("=================================================");
  console.table(
    results.map((r) => ({
      Provider: r.provider,
      Model: r.model,
      Configured: r.configured,
      Auth: r.authStatus,
      GenStatus: r.generation.status,
      GenLatency: `${r.generation.latencyMs}ms`,
      ToolStatus: r.toolCalling.status,
      ToolLatency: `${r.toolCalling.latencyMs}ms`,
    }))
  );

  return results;
}

run().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});

