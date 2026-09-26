import { summarizeReasoning, type AnalyzedTurn, type ConfidenceLabel } from "@/lib/agents/reasoningRollup";
import { computeBaseline, classifyDeviation, type TimingSample, type DeviationLevel } from "@/lib/integrity/timingBaseline";
import {
  computeLanguageMetrics,
  computeLanguageBaseline,
  classifyLanguageDeviation,
} from "@/lib/integrity/languagePatterns";

export type PatternSummary = DeviationLevel | "INSUFFICIENT_DATA";

export type IntegrityReport = {
  crossQuestionConsistency: ConfidenceLabel;
  reasoningDepth: ConfidenceLabel;
  rephraseAbility: ConfidenceLabel | "NOT_TESTED";
  timingPattern: PatternSummary;
  languagePattern: PatternSummary;
  browserIntegrityEventCount: number;
  /** A transparent, rubric-based number — never a black-box "cheating score". */
  verificationConfidence: number;
  observations: string[];
};

const levelRank: Record<DeviationLevel, number> = { NORMAL: 0, MODERATE_DEVIATION: 1, SIGNIFICANT_DEVIATION: 2 };
const rankLevel: DeviationLevel[] = ["NORMAL", "MODERATE_DEVIATION", "SIGNIFICANT_DEVIATION"];

/** Averages several per-answer deviation readings into one overall label, rather than reporting on a single worst spike (a difficulty question or a one-off pause shouldn't dominate the summary). */
function averageDeviationLevel(levels: DeviationLevel[]): PatternSummary {
  if (levels.length === 0) return "INSUFFICIENT_DATA";
  const avgRank = levels.reduce((sum, l) => sum + levelRank[l], 0) / levels.length;
  return rankLevel[Math.round(avgRank)];
}

export function summarizeTimingPattern(samples: TimingSample[]): PatternSummary {
  const baseline = computeBaseline(samples);
  if (!baseline) return "INSUFFICIENT_DATA";
  const rest = samples.slice(baseline.sampleSize);
  if (rest.length === 0) return "NORMAL";
  return averageDeviationLevel(rest.map((s) => classifyDeviation(s, baseline).overall));
}

export function summarizeLanguagePattern(answerTexts: string[], technicalTerms: string[] = []): PatternSummary {
  const metrics = answerTexts.map((t) => computeLanguageMetrics(t, technicalTerms));
  const baseline = computeLanguageBaseline(metrics);
  if (!baseline) return "INSUFFICIENT_DATA";
  const rest = metrics.slice(baseline.sampleSize);
  if (rest.length === 0) return "NORMAL";
  return averageDeviationLevel(rest.map((m) => classifyLanguageDeviation(m, baseline)));
}

/**
 * Combines every Phase 6 signal into one transparent report. The score and
 * every label are derived by an explicit, fixed rubric below — nothing here
 * is an opaque model judgment, and nothing in this module ever declares
 * cheating; deviations are framed as needing interpretation, consistent
 * with the product's integrity rules.
 */
export function buildIntegrityReport(input: {
  turns: AnalyzedTurn[];
  timingSamples: TimingSample[];
  answerTexts: string[];
  technicalTerms?: string[];
  browserIntegrityEventCount: number;
}): IntegrityReport {
  const reasoning = summarizeReasoning(input.turns);
  const timingPattern = summarizeTimingPattern(input.timingSamples);
  const languagePattern = summarizeLanguagePattern(input.answerTexts, input.technicalTerms ?? []);

  let score = 90;
  if (reasoning.consistency === "MODERATE") score -= 10;
  if (reasoning.consistency === "LOW") score -= 25;
  if (reasoning.reasoningDepth === "MODERATE") score -= 5;
  if (reasoning.reasoningDepth === "LOW") score -= 15;
  if (timingPattern === "MODERATE_DEVIATION") score -= 5;
  if (timingPattern === "SIGNIFICANT_DEVIATION") score -= 10;
  if (languagePattern === "MODERATE_DEVIATION") score -= 5;
  if (languagePattern === "SIGNIFICANT_DEVIATION") score -= 10;
  score -= Math.min(15, Math.max(0, input.browserIntegrityEventCount - 2) * 2);
  const verificationConfidence = Math.max(0, Math.min(100, Math.round(score)));

  const observations: string[] = [];
  if (reasoning.consistency !== "HIGH") {
    observations.push(
      reasoning.notableInconsistencies.length > 0
        ? `Possible inconsistency: ${reasoning.notableInconsistencies[0]}`
        : "One or more answers may need clarification."
    );
  }
  if (timingPattern === "MODERATE_DEVIATION" || timingPattern === "SIGNIFICANT_DEVIATION") {
    observations.push(
      "Response timing deviated from this candidate's own baseline in at least one answer — this can also reflect question difficulty or nervousness."
    );
  }
  if (languagePattern === "MODERATE_DEVIATION" || languagePattern === "SIGNIFICANT_DEVIATION") {
    observations.push("Answer length or vocabulary varied from this candidate's typical pattern in at least one response.");
  }
  if (input.browserIntegrityEventCount > 2) {
    observations.push(
      `The browser reported ${input.browserIntegrityEventCount} focus/visibility change(s) during the interview.`
    );
  }
  if (observations.length === 0) {
    observations.push("No notable integrity concerns were observed.");
  }

  return {
    crossQuestionConsistency: reasoning.consistency,
    reasoningDepth: reasoning.reasoningDepth,
    rephraseAbility: reasoning.rephraseAbility,
    timingPattern,
    languagePattern,
    browserIntegrityEventCount: input.browserIntegrityEventCount,
    verificationConfidence,
    observations,
  };
}
