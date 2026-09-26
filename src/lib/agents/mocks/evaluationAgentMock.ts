import { evaluationNarrativeSchema, type EvaluationNarrative } from "@/lib/ai/schemas";
import type { ClaimEvidence } from "@/lib/agents/evaluationAgent";

export function mockEvaluationNarrative(input: { claims: ClaimEvidence[] }): EvaluationNarrative {
  const verified = input.claims.filter((c) => c.coverageStatus === "VERIFIED");
  const gaps = input.claims.filter((c) => c.coverageStatus !== "VERIFIED" && c.importance !== "low");

  return evaluationNarrativeSchema.parse({
    strengths:
      verified.length > 0
        ? verified.map((c) => `[MOCK] Demonstrated practical understanding of ${c.name}.`)
        : ["[MOCK] No claims were fully verified in this mock run."],
    gaps:
      gaps.length > 0
        ? gaps.map((c) => `[MOCK] ${c.name} was not sufficiently verified.`)
        : ["[MOCK] No notable gaps identified."],
    reasoningNotes: ["[MOCK] Reasoning quality is not evaluated by a real model in mock mode."],
    consistencyNotes: ["[MOCK] Consistency is not evaluated by a real model in mock mode."],
    roleAlignment: {
      summary:
        "[MOCK] This is a placeholder role-alignment summary generated without a real Claude call — set a real ANTHROPIC_API_KEY to get an actual evaluation.",
      score: verified.length > 0 ? 0.6 : 0.3,
    },
  });
}
