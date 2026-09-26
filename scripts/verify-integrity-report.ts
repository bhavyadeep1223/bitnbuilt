/**
 * Regression check for the composite integrity report (Phase 7).
 * Run with: npx tsx scripts/verify-integrity-report.ts
 */
import { buildIntegrityReport } from "@/lib/integrity/buildIntegrityReport";
import type { AnalyzedTurn } from "@/lib/agents/reasoningRollup";
import type { AnswerAnalysis } from "@/lib/ai/schemas";
import type { TimingSample } from "@/lib/integrity/timingBaseline";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failures++;
  } else {
    console.log("PASS:", msg);
  }
}

function fakeAnalysis(overrides: Partial<AnswerAnalysis> = {}): AnswerAnalysis {
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

// --- clean interview: should read as high-confidence, no concerns ---
{
  const turns: AnalyzedTurn[] = Array.from({ length: 5 }, () => ({
    questionType: "new_topic",
    analysis: fakeAnalysis({ confidence: 0.85 }),
  }));
  const timingSamples: TimingSample[] = Array.from({ length: 5 }, () => ({
    responseGapMs: 2200,
    longestPauseMs: 1500,
    totalDurationMs: 20000,
  }));
  const answerTexts = Array.from(
    { length: 5 },
    (_, i) => `This is a fairly typical answer number ${i} describing the project in similar detail each time.`
  );

  const report = buildIntegrityReport({ turns, timingSamples, answerTexts, browserIntegrityEventCount: 0 });
  assert(report.crossQuestionConsistency === "HIGH", `clean interview => HIGH consistency (got ${report.crossQuestionConsistency})`);
  assert(report.timingPattern === "NORMAL", `steady timing => NORMAL (got ${report.timingPattern})`);
  assert(report.languagePattern === "NORMAL", `steady language => NORMAL (got ${report.languagePattern})`);
  assert(report.verificationConfidence >= 85, `clean interview scores high (got ${report.verificationConfidence})`);
  assert(
    report.observations.length === 1 && report.observations[0].includes("No notable"),
    `clean interview has no observations (got ${JSON.stringify(report.observations)})`
  );
  assert(
    !report.observations.some((o) => /cheat/i.test(o)),
    "no observation ever uses the word 'cheat'"
  );
}

// --- too few answers: everything should read as insufficient data, not falsely flagged ---
{
  const turns: AnalyzedTurn[] = [{ questionType: "new_topic", analysis: fakeAnalysis() }];
  const report = buildIntegrityReport({
    turns,
    timingSamples: [{ responseGapMs: 2000, longestPauseMs: 1000, totalDurationMs: 15000 }],
    answerTexts: ["A single short answer."],
    browserIntegrityEventCount: 0,
  });
  assert(report.timingPattern === "INSUFFICIENT_DATA", `1 sample => INSUFFICIENT_DATA (got ${report.timingPattern})`);
  assert(report.languagePattern === "INSUFFICIENT_DATA", `1 sample => INSUFFICIENT_DATA (got ${report.languagePattern})`);
}

// --- flagged interview: inconsistency + timing spike + browser events should all surface, without ever saying "cheating" ---
{
  const turns: AnalyzedTurn[] = [
    { questionType: "new_topic", analysis: fakeAnalysis({ confidence: 0.8 }) },
    { questionType: "new_topic", analysis: fakeAnalysis({ confidence: 0.8 }) },
    { questionType: "new_topic", analysis: fakeAnalysis({ confidence: 0.8 }) },
    {
      questionType: "contradiction_check",
      analysis: fakeAnalysis({
        confidence: 0.4,
        consistency_observations: [
          { description: "10,000 users vs 200 users", relatedClaimRefs: [], confidence: 0.9 },
        ],
      }),
    },
  ];
  const timingSamples: TimingSample[] = [
    { responseGapMs: 2000, longestPauseMs: 1000, totalDurationMs: 15000 },
    { responseGapMs: 2200, longestPauseMs: 1100, totalDurationMs: 16000 },
    { responseGapMs: 2100, longestPauseMs: 1050, totalDurationMs: 15500 },
    { responseGapMs: 9000, longestPauseMs: 6000, totalDurationMs: 15000 },
  ];
  const answerTexts = [
    "A fairly typical answer describing the project in reasonable detail.",
    "Another fairly typical answer describing the project in reasonable detail.",
    "A third fairly typical answer describing the project in reasonable detail.",
    "Yes.",
  ];

  const report = buildIntegrityReport({
    turns,
    timingSamples,
    answerTexts,
    browserIntegrityEventCount: 4,
  });

  assert(report.crossQuestionConsistency === "MODERATE", `1 confident flag => MODERATE (got ${report.crossQuestionConsistency})`);
  assert(report.timingPattern === "SIGNIFICANT_DEVIATION", `9000ms spike vs ~2100 baseline => SIGNIFICANT (got ${report.timingPattern})`);
  assert(report.languagePattern === "SIGNIFICANT_DEVIATION", `"Yes." vs verbose baseline => SIGNIFICANT (got ${report.languagePattern})`);
  assert(report.verificationConfidence < 70, `multiple flags pull score down meaningfully (got ${report.verificationConfidence})`);
  assert(report.observations.length >= 3, `all four signal categories surface an observation (got ${report.observations.length})`);
  assert(!report.observations.some((o) => /cheat/i.test(o)), "no observation ever uses the word 'cheat', even when flagged");
  assert(
    report.observations.some((o) => o.includes("also reflect question difficulty")),
    "timing observation carries the non-accusatory caveat"
  );
}

console.log(failures === 0 ? "\nAll integrity-report checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
