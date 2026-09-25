// Thin client for the platform's AI Gateway (per the existing stack: OpenAI
// GPT-5 / Google Gemini, multi-model orchestration via "Anvita AI";
// embeddings via text-embedding-3-large). Defaults to calling OpenAI's API
// directly with an OpenAI-compatible request shape so this module works
// standalone — set AI_GATEWAY_URL / AI_GATEWAY_API_KEY to route through the
// platform's actual internal gateway once merged, with no call-site changes.
//
// Every function here throws AiGatewayUnavailableError when no credential
// is configured or the request fails, rather than returning fabricated
// data. Callers (evidence-graph-core, compliance-core, cybersecurity-agent)
// catch this and fall back to their existing keyword-based behavior so a
// missing API key degrades the pipeline instead of breaking it.

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export class AiGatewayUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiGatewayUnavailableError";
  }
}

function baseUrl(): string {
  return Deno.env.get("AI_GATEWAY_URL") ?? DEFAULT_BASE_URL;
}

function embeddingModel(): string {
  return Deno.env.get("AI_GATEWAY_EMBEDDING_MODEL") ?? "text-embedding-3-large";
}

function chatModel(): string {
  return Deno.env.get("AI_GATEWAY_CHAT_MODEL") ?? "gpt-5";
}

function apiKey(): string {
  const key = Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  if (!key) {
    throw new AiGatewayUnavailableError(
      "No AI Gateway credential configured (set AI_GATEWAY_API_KEY or OPENAI_API_KEY).",
    );
  }
  return key;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const key = apiKey();
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: embeddingModel(), input: text }),
    });
  } catch (err) {
    throw new AiGatewayUnavailableError(
      `Embedding request could not be sent: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new AiGatewayUnavailableError(`Embedding request failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new AiGatewayUnavailableError("Embedding response did not contain a vector.");
  }
  return embedding;
}

export interface CompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

export async function generateCompletion(req: CompletionRequest): Promise<string> {
  const key = apiKey();
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: chatModel(),
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userPrompt },
        ],
        max_tokens: req.maxTokens ?? 800,
      }),
    });
  } catch (err) {
    throw new AiGatewayUnavailableError(
      `Completion request could not be sent: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new AiGatewayUnavailableError(`Completion request failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new AiGatewayUnavailableError("Completion response did not contain message content.");
  }
  return content;
}
