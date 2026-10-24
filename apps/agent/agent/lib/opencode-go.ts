import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

// OpenCode Go (https://opencode.ai/docs/go) exposes its models over three API
// surfaces and each model is served on exactly one of them. baseURL covers all
// three paths: /responses, /messages, /chat/completions.
const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
const DEFAULT_MODEL = "deepseek-v4.1-flash";
const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;

// Models served through the OpenAI Responses API (`/responses`).
const RESPONSES_MODELS = new Set([
  "grok-4.7",
  "grok-4.6",
  "gpt-6-luna",
  "gpt-5.6-luna",
  "muse-spark-1.3-contributor",
  "muse-spark-1.2-contributor",
]);

// Models served through the Anthropic Messages API (`/messages`).
const MESSAGES_MODELS = new Set([
  "claude-haiku-5-5",
  "minimax-m3",
  "minimax-m2.7",
  "qwen3.8-max",
  "qwen3.8-flash",
  "qwen3.7-plus",
]);

// Every other Go model is served through OpenAI-compatible /chat/completions.

try {
  // eve does not auto-load .env for authored code; load it for local dev.
  // Deployed environments inject variables directly and may not have the file.
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // No readable .env — rely on the environment.
}

export function opencodeGoModelId(): string {
  return process.env.OPENCODE_GO_MODEL ?? DEFAULT_MODEL;
}

export function opencodeGoContextWindowTokens(): number {
  return Number(process.env.OPENCODE_GO_CONTEXT_WINDOW_TOKENS) || DEFAULT_CONTEXT_WINDOW_TOKENS;
}

export function opencodeGoModel(modelId: string, sessionId: string): LanguageModel {
  const apiKey = process.env.OPENCODE_GO_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENCODE_GO_API_KEY is not set. Copy .env.example to .env and paste your OpenCode Go key, or export it in the environment.",
    );
  }

  // OpenCode Go asks clients to identify themselves with a user agent and to
  // send a stable per-conversation id in x-opencode-session for routing and
  // prompt caching.
  const headers = {
    "user-agent": "nomai-agent/1.0",
    "x-opencode-session": sessionId,
  };
  const options = { name: "opencode-go", baseURL: OPENCODE_GO_BASE_URL, apiKey, headers };

  if (RESPONSES_MODELS.has(modelId)) {
    return createOpenAI(options)(modelId);
  }
  if (MESSAGES_MODELS.has(modelId)) {
    return createAnthropic(options)(modelId);
  }
  return createOpenAICompatible(options)(modelId);
}
