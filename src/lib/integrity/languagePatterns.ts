import type { DeviationLevel } from "@/lib/integrity/timingBaseline";

/**
 * Deterministic, zero-LLM-cost language metrics — a soft integrity signal,
 * never proof of anything on its own. Computed per answer, then compared
 * against the candidate's own early-interview baseline (same philosophy as
 * the timing baseline: personal norm, not a universal threshold).
 */
export type LanguageMetrics = {
  wordCount: number;
  avgSentenceLength: number;
  vocabularyDensity: number;
  technicalTermHits: number;
};

export type LanguageBaseline = {
  avgWordCount: number;
  avgSentenceLength: number;
  avgVocabularyDensity: number;
  sampleSize: number;
};

const MIN_BASELINE_SAMPLES = 2;
const DEFAULT_BASELINE_WINDOW = 3;

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeLanguageMetrics(text: string, technicalTerms: string[] = []): LanguageMetrics {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const lowerWords = words.map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, "")).filter(Boolean);
  const uniqueWords = new Set(lowerWords);

  const lowerText = text.toLowerCase();
  const technicalTermHits = technicalTerms.filter((term) => lowerText.includes(term.toLowerCase())).length;

  return {
    wordCount: words.length,
    avgSentenceLength: sentences.length > 0 ? words.length / sentences.length : words.length,
    vocabularyDensity: lowerWords.length > 0 ? uniqueWords.size / lowerWords.length : 0,
    technicalTermHits,
  };
}

export function computeLanguageBaseline(
  samples: LanguageMetrics[],
  windowSize = DEFAULT_BASELINE_WINDOW
): LanguageBaseline | null {
  const window = samples.slice(0, windowSize);
  if (window.length < MIN_BASELINE_SAMPLES) return null;

  return {
    avgWordCount: mean(window.map((s) => s.wordCount)),
    avgSentenceLength: mean(window.map((s) => s.avgSentenceLength)),
    avgVocabularyDensity: mean(window.map((s) => s.vocabularyDensity)),
    sampleSize: window.length,
  };
}

/**
 * Ratio-based in whichever direction moved (using the reciprocal for a
 * drop), with an absolute floor so a tiny baseline can't make ordinary
 * variance look significant. A plain |current-baseline|/baseline measure
 * would be wrong here: it's capped at 1.0 for a decrease (current can't go
 * below 0) but unbounded for an increase, so it could never flag a sudden
 * drop to a one-word answer as "significant" — this fixes that asymmetry.
 */
function deviationLevel(current: number, baseline: number, absFloor: number): DeviationLevel {
  const diff = Math.abs(current - baseline);
  if (diff < absFloor) return "NORMAL";
  const ratio = baseline <= 0 ? Infinity : current >= baseline ? current / baseline : baseline / current;
  if (ratio >= 3) return "SIGNIFICANT_DEVIATION";
  if (ratio >= 1.75) return "MODERATE_DEVIATION";
  return "NORMAL";
}

const levelRank: Record<DeviationLevel, number> = { NORMAL: 0, MODERATE_DEVIATION: 1, SIGNIFICANT_DEVIATION: 2 };
function worse(a: DeviationLevel, b: DeviationLevel): DeviationLevel {
  return levelRank[a] >= levelRank[b] ? a : b;
}

/**
 * Symmetric — a sudden jump AND a sudden drop both count as deviation
 * (e.g. unusually terse vs. unusually verbose compared to the candidate's
 * own norm). technicalTermHits is deliberately excluded: it tracks the
 * topic being discussed more than the candidate's own style, so it isn't a
 * stable personal baseline signal.
 */
export function classifyLanguageDeviation(
  current: LanguageMetrics,
  baseline: LanguageBaseline
): DeviationLevel {
  const wordCountLevel = deviationLevel(current.wordCount, baseline.avgWordCount, 4);
  const densityLevel = deviationLevel(current.vocabularyDensity, baseline.avgVocabularyDensity, 0.1);
  return worse(wordCountLevel, densityLevel);
}
