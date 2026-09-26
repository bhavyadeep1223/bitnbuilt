/**
 * Regression check for the pure (non-LLM) knowledge-depth engine — no API
 * keys or database required. Run with: npx tsx scripts/verify-engine.ts
 */
import { resolveClaimId } from "@/lib/agents/claimMatcher";
import {
  computeDepthUpdates,
  isSufficientlyVerified,
  type ExistingAssessment,
} from "@/lib/agents/verificationAgent";
import type { AnswerAnalysis } from "@/lib/ai/schemas";
import { computePauseMetrics } from "@/lib/timing/computePauseMetrics";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failures++;
  } else {
    console.log("PASS:", msg);
  }
}

const claims = [
  { id: "c1", name: "React" },
  { id: "c2", name: "Redis caching" },
  { id: "c3", name: "AWS certification" },
];

assert(resolveClaimId("React", claims) === "c1", "exact match resolves");
assert(resolveClaimId("react", claims) === "c1", "case-insensitive exact match");
assert(resolveClaimId("Redis", claims) === "c2", "substring match resolves");
assert(resolveClaimId("Kubernetes", claims) === null, "no match returns null");

function analysis(overrides: Partial<AnswerAnalysis> = {}): AnswerAnalysis {
  return {
    topics: ["React"],
    knowledge_depth: { React: 4 },
    confidence: 0.8,
    evidence: ["explained reconciliation clearly"],
    missing_evidence: [],
    resume_items_covered: ["React"],
    resume_items_remaining: [],
    notable_claims: [],
    consistency_observations: [],
    reasoning_observations: [],
    recommended_next_topic: "Redis caching",
    recommended_question_type: "new_topic",
    recommended_difficulty: 3,
    next_question: "next",
    interview_complete: false,
    ...overrides,
  };
}

const existing = new Map<string, ExistingAssessment>();

const round1 = computeDepthUpdates({ analysis: analysis(), claims, existingAssessments: existing });
assert(round1.length === 1, "one update produced for one topic");
assert(round1[0].resumeClaimId === "c1", "update targets resolved claim id");
assert(round1[0].depthLevel === 4, "fresh claim takes incoming depth directly");
assert(
  round1[0].coverageStatus === "VERIFIED",
  `depth 4 + confidence 0.8 verifies in one shot (got ${round1[0].coverageStatus})`
);

existing.set("c1", {
  depthLevel: 4,
  confidence: 0.8,
  evidence: round1[0].evidence,
  missingEvidence: [],
  questionsUsed: 1,
});
const round2 = computeDepthUpdates({
  analysis: analysis({ knowledge_depth: { React: 1 }, confidence: 0.3, evidence: ["vague"] }),
  claims,
  existingAssessments: existing,
});
assert(
  round2[0].depthLevel === Math.round(4 * 0.4 + 1 * 0.6),
  `weak follow-up blends toward new evidence, not overwritten (got ${round2[0].depthLevel})`
);
assert(round2[0].evidence.includes("vague"), "new evidence appended");
assert(round2[0].evidence.includes("explained reconciliation clearly"), "old evidence retained");

const round3 = computeDepthUpdates({
  analysis: analysis({ knowledge_depth: { Kubernetes: 3 } }),
  claims,
  existingAssessments: existing,
});
assert(round3.length === 0, "unmatched topic produces no update");

assert(isSufficientlyVerified("VERIFIED", "high", 1), "VERIFIED always sufficient");
assert(!isSufficientlyVerified("PARTIALLY_VERIFIED", "high", 3), "high importance never stops at partial");
assert(isSufficientlyVerified("PARTIALLY_VERIFIED", "low", 1), "low importance stops after one pass");
assert(!isSufficientlyVerified("NOT_VERIFIED", "low", 0), "not-verified is never sufficient");

// --- computePauseMetrics ---
{
  const start = 1000;
  const end = 1000 + 10_000;
  // speech at t=1000(start), 1500, 1700, then a 3s silence, then 6200, 6400, then end at 11000
  const events = [1500, 1700, 6200, 6400];
  const result = computePauseMetrics(events, start, end);
  assert(result.pauses.length === 2, `expects 2 pauses (got ${result.pauses.length})`);
  assert(result.longestPauseMs === 4600, `longest pause is end-gap 11000-6400=4600 (got ${result.longestPauseMs})`);
  assert(result.avgPauseMs !== null && result.avgPauseMs > 0, "avg pause computed");

  const noGaps = computePauseMetrics([1200, 1400, 1600], 1000, 2000);
  assert(noGaps.pauses.length === 0 && noGaps.longestPauseMs === null, "no pauses when gaps stay under threshold");
}

console.log(failures === 0 ? "\nAll checks passed (incl. timing)." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
