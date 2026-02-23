import type { GraphPackage } from "../graph/installGraphService";
import { vibeTemplateRegistry } from "./vibeTemplates";
import { buildSystemPrompt, buildGenerationPrompt, buildRepairPrompt, buildRefinementPrompt } from "./promptBuilder";

/**
 * LLM adapter interface for generating GraphPackage JSON from prompts.
 *
 * The adapter returns `unknown` intentionally — callers must validate
 * the shape via graphPackageSchema before use. This mirrors the contract
 * where real LLM output is unstructured JSON.
 */
export interface LlmAdapter {
  generateGraphPackage(prompt: string, appName?: string): Promise<unknown>;

  /**
   * Repair a previously generated package by feeding validation errors
   * back to the model. Only real adapters implement this — stub returns null.
   */
  repairGraphPackage(
    originalPrompt: string,
    previousOutput: string,
    errors: string,
  ): Promise<unknown>;

  /**
   * Refine an existing package by applying a natural-language instruction.
   * Only real adapters implement this — stub returns null (caller falls back
   * to deterministic refinement).
   */
  refineGraphPackage(
    existingPackageJson: string,
    refinementInstruction: string,
  ): Promise<unknown>;

  /**
   * Streaming variant of generateGraphPackage. Yields token strings as they
   * arrive from the LLM. Callers accumulate tokens into a buffer, then
   * extract JSON + validate after the stream completes.
   * Stub adapter streams a fake JSON output token-by-token.
   */
  streamGenerate(prompt: string, appName?: string): AsyncGenerator<string, void, unknown>;

  /**
   * Streaming variant of refineGraphPackage.
   * Stub adapter returns null-yielding generator.
   */
  streamRefine(
    existingPackageJson: string,
    refinementInstruction: string,
  ): AsyncGenerator<string, void, unknown>;
}

/**
 * Stub LLM adapter that reuses the existing keyword matching from
 * vibeTemplateRegistry. Returns matched templates as raw `unknown`
 * to simulate unstructured LLM JSON output.
 *
 * This preserves backward compatibility — the stub produces the same
 * packages as the original generatePackageFromPrompt logic.
 */
class StubLlmAdapter implements LlmAdapter {
  async generateGraphPackage(prompt: string, appName?: string): Promise<unknown> {
    const lower = prompt.toLowerCase();

    let bestMatch: { template: GraphPackage; score: number } | null = null;
    for (const entry of vibeTemplateRegistry) {
      let score = 0;
      for (const kw of entry.keywords) {
        if (lower.includes(kw)) score++;
      }
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { template: entry.template, score };
      }
    }

    if (!bestMatch) {
      return null;
    }

    // Deep clone and optionally customize packageKey
    const pkg = structuredClone(bestMatch.template);
    if (appName) {
      const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      pkg.packageKey = `vibe.${slug}`;
    }

    // Return as unknown to simulate raw LLM JSON output
    return pkg as unknown;
  }

  async repairGraphPackage(): Promise<unknown> {
    // Stub cannot repair — return null to signal no repair capability
    return null;
  }

  async refineGraphPackage(): Promise<unknown> {
    // Stub cannot refine via LLM — return null to signal fallback to deterministic
    return null;
  }

  async *streamGenerate(prompt: string, appName?: string): AsyncGenerator<string, void, unknown> {
    const result = await this.generateGraphPackage(prompt, appName);
    if (result === null) return;
    // Stream the JSON string token-by-token (chunked by ~20 chars to simulate tokens)
    const json = JSON.stringify(result, null, 2);
    const chunkSize = 20;
    for (let i = 0; i < json.length; i += chunkSize) {
      yield json.slice(i, i + chunkSize);
    }
  }

  async *streamRefine(): AsyncGenerator<string, void, unknown> {
    // Stub cannot refine — yield nothing
  }
}

/**
 * Anthropic LLM adapter. Uses the Messages API via native fetch.
 * Requires ANTHROPIC_API_KEY env var.
 */
class AnthropicLlmAdapter implements LlmAdapter {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model ?? "claude-sonnet-4-20250514";
  }

  async generateGraphPackage(prompt: string, appName?: string): Promise<unknown> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildGenerationPrompt(prompt, appName);
    return this.callApi(systemPrompt, userPrompt);
  }

  async repairGraphPackage(
    originalPrompt: string,
    previousOutput: string,
    errors: string,
  ): Promise<unknown> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildRepairPrompt(originalPrompt, previousOutput, errors);
    return this.callApi(systemPrompt, userPrompt);
  }

  async refineGraphPackage(
    existingPackageJson: string,
    refinementInstruction: string,
  ): Promise<unknown> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildRefinementPrompt(existingPackageJson, refinementInstruction);
    return this.callApi(systemPrompt, userPrompt);
  }

  async *streamGenerate(prompt: string, appName?: string): AsyncGenerator<string, void, unknown> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildGenerationPrompt(prompt, appName);
    yield* this.streamApi(systemPrompt, userPrompt);
  }

  async *streamRefine(
    existingPackageJson: string,
    refinementInstruction: string,
  ): AsyncGenerator<string, void, unknown> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildRefinementPrompt(existingPackageJson, refinementInstruction);
    yield* this.streamApi(systemPrompt, userPrompt);
  }

  private async callApi(systemPrompt: string, userPrompt: string): Promise<unknown> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${body}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
    };
    const textBlock = data.content.find((b) => b.type === "text");
    if (!textBlock?.text) {
      return null;
    }

    return extractJson(textBlock.text);
  }

  private async *streamApi(systemPrompt: string, userPrompt: string): AsyncGenerator<string, void, unknown> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        stream: true,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${body}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") return;
          try {
            const event = JSON.parse(payload) as {
              type: string;
              delta?: { type: string; text?: string };
            };
            if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
              yield event.delta.text;
            }
          } catch {
            // skip malformed SSE events
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * OpenAI LLM adapter. Uses the Chat Completions API via native fetch.
 * Requires OPENAI_API_KEY env var.
 */
class OpenAiLlmAdapter implements LlmAdapter {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model ?? "gpt-4o";
  }

  async generateGraphPackage(prompt: string, appName?: string): Promise<unknown> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildGenerationPrompt(prompt, appName);
    return this.callApi(systemPrompt, userPrompt);
  }

  async repairGraphPackage(
    originalPrompt: string,
    previousOutput: string,
    errors: string,
  ): Promise<unknown> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildRepairPrompt(originalPrompt, previousOutput, errors);
    return this.callApi(systemPrompt, userPrompt);
  }

  async refineGraphPackage(
    existingPackageJson: string,
    refinementInstruction: string,
  ): Promise<unknown> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildRefinementPrompt(existingPackageJson, refinementInstruction);
    return this.callApi(systemPrompt, userPrompt);
  }

  async *streamGenerate(prompt: string, appName?: string): AsyncGenerator<string, void, unknown> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildGenerationPrompt(prompt, appName);
    yield* this.streamApi(systemPrompt, userPrompt);
  }

  async *streamRefine(
    existingPackageJson: string,
    refinementInstruction: string,
  ): AsyncGenerator<string, void, unknown> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildRefinementPrompt(existingPackageJson, refinementInstruction);
    yield* this.streamApi(systemPrompt, userPrompt);
  }

  private async callApi(systemPrompt: string, userPrompt: string): Promise<unknown> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    return extractJson(content);
  }

  private async *streamApi(systemPrompt: string, userPrompt: string): AsyncGenerator<string, void, unknown> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") return;
          try {
            const event = JSON.parse(payload) as {
              choices: Array<{ delta: { content?: string } }>;
            };
            const token = event.choices[0]?.delta?.content;
            if (token) yield token;
          } catch {
            // skip malformed SSE events
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * Extract JSON from potentially noisy LLM output.
 * Handles: raw JSON, markdown code fences, leading/trailing text.
 */
export function extractJson(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Continue to extraction
  }

  // Try extracting from markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]!.trim());
    } catch {
      // Continue
    }
  }

  // Try finding the first { ... } block
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      // Fall through
    }
  }

  return null;
}

/**
 * Factory function for creating an LLM adapter.
 * Selection order:
 *   1. VIBE_LLM_PROVIDER env var (explicit: "anthropic", "openai", "stub")
 *   2. ANTHROPIC_API_KEY present → Anthropic
 *   3. OPENAI_API_KEY present → OpenAI
 *   4. Fallback → Stub
 */
export function createLlmAdapter(): LlmAdapter {
  const provider = process.env.VIBE_LLM_PROVIDER?.toLowerCase();

  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("VIBE_LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set");
    return new AnthropicLlmAdapter(apiKey, process.env.VIBE_LLM_MODEL);
  }

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("VIBE_LLM_PROVIDER=openai but OPENAI_API_KEY is not set");
    return new OpenAiLlmAdapter(apiKey, process.env.VIBE_LLM_MODEL);
  }

  if (provider === "stub") {
    return new StubLlmAdapter();
  }

  // Auto-detect from env
  if (process.env.ANTHROPIC_API_KEY) {
    return new AnthropicLlmAdapter(process.env.ANTHROPIC_API_KEY, process.env.VIBE_LLM_MODEL);
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAiLlmAdapter(process.env.OPENAI_API_KEY, process.env.VIBE_LLM_MODEL);
  }

  return new StubLlmAdapter();
}
