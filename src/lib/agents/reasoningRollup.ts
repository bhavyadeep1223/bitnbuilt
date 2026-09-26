import type { AnswerAnalysis } from "@/lib/ai/schemas";

export type ConfidenceLabel = "HIGH" | "MODERATE" | "LOW";

export type ReasoningRollup = {
  consistency: ConfidenceLabel;
  reasoningDepth: ConfidenceLabel;
  rephraseAbility: ConfidenceLabel | "NOT_TESTED";
  notableInconsistencies: string[];
};

export type AnalyzedTurn = {
  /** The type of the question being answered (set when that question was generated). */
  questionType: string;
  analysis: AnswerAnalysis;
};

const REASONING_QUESTION_TYPES = new Set(["deeper_probe", "alternative_scenario", "contradiction_check"]);

function labelFromScore(score: number): ConfidenceLabel {
  if (score >= 0.65) return "HIGH";
  if (score >= 0.4) return "MODERATE";
  return "LOW";
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Folds every turn's structured analysis into the three labels the
 * evidence-based report needs — never derived from a single answer, always
 * from the whole interview's evidence.
 */
export function summarizeReasoning(turns: AnalyzedTurn[]): ReasoningRollup {
  const meaningfulInconsistencies = turns
    .flatMap((t) => t.analysis.consistency_observations)
    .filter((o) => o.confidence >= 0.5);

  const consistency: ConfidenceLabel =
    meaningfulInconsistencies.length === 0 ? "HIGH" : meaningfulInconsistencies.length === 1 ? "MODERATE" : "LOW";

  const reasoningTurns = turns.filter((t) => REASONING_QUESTION_TYPES.has(t.questionType));
  const reasoningDepth: ConfidenceLabel =
    reasoningTurns.length > 0
      ? labelFromScore(mean(reasoningTurns.map((t) => t.analysis.confidence)))
      : turns.length > 0
        ? labelFromScore(mean(turns.map((t) => t.analysis.confidence)))
        : "LOW";

  const rephraseTurns = turns.filter((t) => t.questionType === "rephrase_check");
  const rephraseAbility: ConfidenceLabel | "NOT_TESTED" =
    rephraseTurns.length > 0 ? labelFromScore(mean(rephraseTurns.map((t) => t.analysis.confidence))) : "NOT_TESTED";

  return {
    consistency,
    reasoningDepth,
    rephraseAbility,
    notableInconsistencies: meaningfulInconsistencies.map((o) => o.description).slice(0, 10),
  };
}
