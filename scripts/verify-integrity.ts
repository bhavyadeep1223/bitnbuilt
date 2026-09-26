/**
 * Regression check for Phase 6's pure integrity engines — personal timing
 * baseline, language-pattern deviation, and the reasoning/consistency
 * rollup. No API keys or database required.
 * Run with: npx tsx scripts/verify-integrity.ts
 */
import { computeBaseline, classifyDeviation, type TimingSample } from "@/lib/integrity/timingBaseline";
import {
  computeLanguageMetrics,
  computeLanguageBaseline,
  classifyLanguageDeviation,
} from "@/lib/integrity/languagePatterns";
import { summarizeReasoning, type AnalyzedTurn } from "@/lib/agents/reasoningRollup";
import type { AnswerAnalysis } from "@/lib/ai/schemas";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failures++;
  } else {
    console.log("PASS:", msg);
  }
}

// --- timingBaseline ---
{
  const samples: TimingSample[] = [
    { responseGapMs: 2000, longestPauseMs: 1500, totalDurationMs: 20000 },
    { responseGapMs: 2400, longestPauseMs: 1800, totalDurationMs: 22000 },
    { responseGapMs: 2200, longestPauseMs: 1600, totalDurationMs: 21000 },
  ];
  const tooFew = computeBaseline(samples.slice(0, 1));
  assert(tooFew === null, "baseline refuses to form from a single sample");

  const baseline = computeBaseline(samples);
  assert(baseline !== null, "baseline forms from 3 samples");
  assert(Math.round(baseline!.avgResponseGapMs) === 2200, `avg response gap is 2200 (got ${baseline!.avgResponseGapMs})`);

  const normal = classifyDeviation({ responseGapMs: 2500, longestPauseMs: 1700, totalDurationMs: 21000 }, baseline!);
  assert(normal.overall === "NORMAL", `small variation stays NORMAL (got ${normal.overall})`);

  const moderate = classifyDeviation({ responseGapMs: 4500, longestPauseMs: 1700, totalDurationMs: 21000 }, baseline!);
  assert(moderate.responseGap === "MODERATE_DEVIATION", `~2x gap is MODERATE (got ${moderate.responseGap})`);

  const significant = classifyDeviation({ responseGapMs: 9000, longestPauseMs: 1700, totalDurationMs: 21000 }, baseline!);
  assert(significant.responseGap === "SIGNIFICANT_DEVIATION", `~4x gap is SIGNIFICANT (got ${significant.responseGap})`);

  const tinyBaseline = computeBaseline([
    { responseGapMs: 300, longestPauseMs: 200, totalDurationMs: 5000 },
    { responseGapMs: 350, longestPauseMs: 250, totalDurationMs: 5200 },
  ]);
  const stillNormal = classifyDeviation({ responseGapMs: 1200, longestPauseMs: 200, totalDurationMs: 5000 }, tinyBaseline!);
  assert(
    stillNormal.responseGap === "NORMAL",
    `absolute floor prevents a tiny baseline from flagging ordinary variance (got ${stillNormal.responseGap})`
  );
}

// --- languagePatterns ---
{
  const terms = ["react", "redis", "postgresql"];
  const metrics = computeLanguageMetrics(
    "I used React and Redis for caching. Redis made the reads much faster.",
    terms
  );
  assert(metrics.wordCount === 13, `word count is 13 (got ${metrics.wordCount})`);
  assert(metrics.technicalTermHits === 2, `matched react + redis (got ${metrics.technicalTermHits})`);
  assert(metrics.vocabularyDensity < 1, "vocabulary density accounts for repeated words");

  const baselineSamples = [
    computeLanguageMetrics("This is a normal length answer with some detail about the project."),
    computeLanguageMetrics("Another answer of roughly similar length describing the same kind of work."),
    computeLanguageMetrics("A third answer, again similar in length and style to the first two."),
  ];
  const baseline = computeLanguageBaseline(baselineSamples)!;
  assert(baseline.sampleSize === 3, "baseline built from 3 samples");

  const similar = computeLanguageMetrics("A fourth answer that is about the same length as the others given.");
  assert(classifyLanguageDeviation(similar, baseline) === "NORMAL", "similar-length answer stays NORMAL");

  const terse = computeLanguageMetrics("Yes.");
  assert(
    classifyLanguageDeviation(terse, baseline) === "SIGNIFICANT_DEVIATION",
    "sudden terse answer is flagged (symmetric, not just verbose direction)"
  );
}

// --- reasoningRollup ---
{
  function fakeAnalysis(overrides: Partial<AnswerAnalysis>): AnswerAnalysis {
    return {
      topics: [],
      knowledge_depth: {},
      confidence: 0.8,
      evidence: [],
      missing_evidence: [],
      resume_items_covered: [],
      resume_items_remaining: [],
      notable_claims: [],
      consistency_observations: [],
      reasoning_observations: [],
      recommended_next_topic: "",
      recommended_question_type: "new_topic",
      recommended_difficulty: 3,
      next_question: "next",
      interview_complete: false,
      ...overrides,
    };
  }

  const cleanTurns: AnalyzedTurn[] = [
    { questionType: "new_topic", analysis: fakeAnalysis({ confidence: 0.8 }) },
    { questionType: "deeper_probe", analysis: fakeAnalysis({ confidence: 0.75 }) },
  ];
  const cleanRollup = summarizeReasoning(cleanTurns);
  assert(cleanRollup.consistency === "HIGH", `no flags => HIGH consistency (got ${cleanRollup.consistency})`);
  assert(cleanRollup.reasoningDepth === "HIGH", `strong reasoning-probe confidence => HIGH (got ${cleanRollup.reasoningDepth})`);
  assert(cleanRollup.rephraseAbility === "NOT_TESTED", "no rephrase_check turn => NOT_TESTED");

  const flaggedTurns: AnalyzedTurn[] = [
    ...cleanTurns,
    {
      questionType: "contradiction_check",
      analysis: fakeAnalysis({
        confidence: 0.3,
        consistency_observations: [
          { description: "10,000 users vs 200 users", relatedClaimRefs: [], confidence: 0.9 },
          { description: "Redis vs Memcached mismatch", relatedClaimRefs: [], confidence: 0.7 },
        ],
      }),
    },
  ];
  const flaggedRollup = summarizeReasoning(flaggedTurns);
  assert(flaggedRollup.consistency === "LOW", `2 confident flags => LOW (got ${flaggedRollup.consistency})`);
  assert(flaggedRollup.notableInconsistencies.length === 2, "both inconsistencies surfaced");
}

console.log(failures === 0 ? "\nAll integrity checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
