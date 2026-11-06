# Implementation Plan: Phase 8 Multi-Provider AI Reliability & Automatic Failover

ShopMate AI currently has a single active provider path (Groq/Gemini via static selection). When rate limits, quota exhaustion (e.g., HTTP 429), temporary spikes, or network timeouts hit the active provider, the shopping assistant turn fails.

This plan implements a resilient multi-provider engine with automatic failover across:
1. Google Gemini API (`google`) — primary
2. Cerebras Inference (`cerebras`) — secondary high-speed fallback
3. Groq (`groq`) — tertiary fallback
4. OpenRouter (`openrouter`) — optional final fallback
5. Ollama (`ollama`) — local development fallback

All recommendations, catalog grounding, comparison logic, and payment infrastructure remain strictly isolated and unaffected.

---

## User Review Checkpoints

| Checkpoint | Gate Criteria |
| :--- | :--- |
| **Provider Abstraction** | Providers configured via environment variables, models validated, `@ai-sdk/cerebras` wired cleanly. |
| **Failover Engine** | `runAgentTurn` executes isolated candidate attempts, handles 429/5xx/timeouts, preserves intent & tools without side effects. |
| **Verification Suite** | Vitest test suite with mocked multi-provider failovers, live API tests for available keys, TypeScript & build clean. |

---

## Proposed Changes

### 1. `src/lib/agent/provider.ts`
- Add `cerebras` and `openrouter` to `AIProviderName`: `"google" | "cerebras" | "groq" | "openrouter" | "ollama"`.
- Add `DEFAULT_MODELS`:
  - `google`: `gemini-3.8-flash`
  - `cerebras`: `llama-3.3-70b`
  - `groq`: `openai/gpt-oss-120b`
  - `openrouter`: `openrouter/free`
  - `ollama`: `gemma3:4b`
- Add provider factory methods:
  - `createCerebrasModel(apiKey, options)`
  - `createOpenRouterModel(apiKey, options)`
  - `createGoogleModel(apiKey, options)`
  - `createGroqModel(apiKey, options)`
- Implement candidate resolution:
  - `getConfiguredProviders(options?)`: returns ordered list of configured providers respecting `SHOPMATE_AI_PROVIDERS` / `SHOPMATE_AI_PROVIDER` override.
  - `isAnyAIConfigured()`: boolean check if at least one candidate provider has credentials.

### 2. `src/lib/agent/failover.ts`
- Implement error classifier `isFailoverEligibleError(error)`:
  - Returns true for HTTP 429, 500, 502, 503, 504.
  - Returns true for `TimeoutError`, `AbortError`, `ECONNRESET`, `ETIMEDOUT`, network fetch failures.
  - Returns true for rate-limit / high-demand error messages from AI SDK providers.
  - Returns false for user input errors, syntax errors, or non-transient exceptions.
- Implement `executeWithFailover(candidates, runner)`:
  - Executes runner with candidate.
  - Tracks attempt latency, error status, and attempt log.
  - Logs provider success or failover transition to server logs.
  - Returns `{ result, provider, model, latencyMs }` on success.
  - Throws `AgentTurnError` with full attempt trail if all candidates fail.

### 3. `src/lib/agent/agent.ts`
- Update `runAgentTurn` to use `executeWithFailover`:
  - For each candidate attempt, creates a fresh isolated `AgentToolContext` with cloned `baseIntent`.
  - Configures `ToolLoopAgent` with bounded output and provider-specific options.
  - If successful, grounds products if no tool was executed and calls `assembleTurn`.
  - Captures and passes provider name and latency in server logs.

### 4. `src/lib/agent/chat-contract.ts`
- Add optional `provider?: string` and `latencyMs?: number` to `ChatApiSuccess` for telemetry / debugging.

### 5. `tests/provider.test.ts` & `tests/failover.test.ts`
- Test candidate resolution, provider ordering, model overrides, and key detection.
- Test failover from Google (429) -> Cerebras -> Groq.
- Test timeout failover.
- Test all providers failing -> structured 502 `ai_unavailable`.
- Test unconfigured providers skipped automatically.
- Test tool context isolation across provider attempts.

### 6. `.env.example` & `README.md`
- Add `CEREBRAS_API_KEY` and `OPENROUTER_API_KEY` placeholders and documentation.
- Document multi-provider fallback priority and environment variables.

---

## Step-by-Step Implementation Tasks

### Task 1: Expand AI Provider Abstraction (`src/lib/agent/provider.ts`)
- Add Cerebras (`@ai-sdk/cerebras`) and OpenRouter (`@ai-sdk/openai-compatible`) support.
- Implement `getConfiguredProviders()`, per-provider model defaults, and timeouts.
- Write unit tests in `tests/provider.test.ts`.

### Task 2: Implement Failover Engine (`src/lib/agent/failover.ts`)
- Implement `isFailoverEligibleError(error)` and `executeWithFailover()`.
- Add unit tests verifying failover sequencing, error classification, and attempt logging.

### Task 3: Integrate Multi-Provider Failover in `runAgentTurn` (`src/lib/agent/agent.ts`)
- Refactor `runAgentTurn` to iterate through configured providers via `executeWithFailover`.
- Ensure clean context isolation per attempt to prevent partial side-effects.
- Update `tests/agent.test.ts` to verify failover behavior.

### Task 4: Live Provider & Tool-Calling Validation
- Verify live Groq and Gemini calls with the local environment keys.
- Test consecutive multi-turn conversation and budget refinements.

### Task 5: Documentation & Configuration Update
- Update `.env.example` and `README.md`.
- Document Vercel Preview configuration.

### Task 6: Full Verification Suite
- Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.
