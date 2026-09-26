import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import { z } from "zod";
import { isMockMode } from "@/lib/ai/mock";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

// Constructed lazily (only once actually needed) rather than at module load,
// so nothing ever instantiates a real API client while in mock mode.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export class AiOutputError extends Error {}

/**
 * Forces Claude to respond through a single tool call whose input schema is
 * `schema`, so "structured output" is enforced by the API rather than by
 * asking nicely in the prompt. Validates the result before returning it; on
 * failure, retries once with the validation error fed back to the model.
 */
export async function runStructured<T>(opts: {
  system: string;
  prompt: string;
  schema: ZodType<T>;
  toolName: string;
  toolDescription: string;
  maxTokens?: number;
}): Promise<T> {
  if (isMockMode()) {
    // Every agent should branch to its own mock before ever reaching here —
    // this is a safety net, not the mocking mechanism itself, so a real
    // (paid) call can never happen silently just because an agent forgot.
    throw new Error(
      `runStructured("${opts.toolName}") was reached while in mock mode — the calling agent is missing its mock branch.`
    );
  }

  const jsonSchema = z.toJSONSchema(opts.schema, { target: "draft-7" });

  const tool: Anthropic.Tool = {
    name: opts.toolName,
    description: opts.toolDescription,
    input_schema: jsonSchema as Anthropic.Tool.InputSchema,
  };

  const attempt = async (extraUserContent?: string) => {
    const message = await getClient().messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 2048,
      system: opts.system,
      tools: [tool],
      tool_choice: { type: "tool", name: opts.toolName },
      messages: [
        {
          role: "user",
          content: extraUserContent ? `${opts.prompt}\n\n${extraUserContent}` : opts.prompt,
        },
      ],
    });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (!toolUse) {
      throw new AiOutputError("Claude did not return a tool_use block");
    }
    return opts.schema.safeParse(toolUse.input);
  };

  const first = await attempt();
  if (first.success) return first.data;

  const repaired = await attempt(
    `Your previous response failed validation with this error, respond again with corrected input only: ${JSON.stringify(
      first.error.issues
    )}`
  );
  if (repaired.success) return repaired.data;

  throw new AiOutputError(
    `Claude output failed schema validation twice: ${JSON.stringify(repaired.error.issues)}`
  );
}
