/**
 * Regression check for the zero-cost mock AI agents (used when no
 * ANTHROPIC_API_KEY is set, or MOCK_AI=true). No API keys required — these
 * are pure functions, never network calls.
 * Run with: npx tsx scripts/verify-mocks.ts
 */
import { mockBuildKnowledgeMap } from "@/lib/agents/mocks/profileAgentMock";
import { mockOpeningQuestion, mockAnalyzeAnswer } from "@/lib/agents/mocks/interviewAgentMock";
import { mockEvaluationNarrative } from "@/lib/agents/mocks/evaluationAgentMock";
import type { ClaimSummary, QaTurn } from "@/lib/agents/interviewAgent";
import type { ClaimEvidence } from "@/lib/agents/evaluationAgent";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failures++;
  } else {
    console.log("PASS:", msg);
  }
}

// --- profileAgentMock ---
{
  const withReact = mockBuildKnowledgeMap({
    resumeText: "Built a dashboard using React and PostgreSQL for the backend store.",
  });
  const names = withReact.claims.map((c) => c.name);
  assert(names.includes("React"), "keyword scan finds React in resume text");
  assert(names.includes("PostgreSQL"), "keyword scan finds PostgreSQL in resume text");

  const noMatches = mockBuildKnowledgeMap({ resumeText: "Completely unrelated text with no tech keywords." });
  assert(noMatches.claims.length > 0, "falls back to default claims when nothing matches, never empty");
}

// --- interviewAgentMock: opening question ---
{
  const claims: ClaimSummary[] = [
    { name: "React", type: "TECHNOLOGY", importance: "high", claimedLevel: null, coverageStatus: "NOT_VERIFIED", depthLevel: null },
  ];
  const opening = mockOpeningQuestion({ claims });
  assert(opening.question.includes("React"), "opening question references the top claim");
  assert(opening.targetClaimName === "React", "opening question targets the top claim by name");

  const noClaims = mockOpeningQuestion({ claims: [] });
  assert(noClaims.question.length > 0, "opening question still valid with zero claims");
}

// --- interviewAgentMock: answer analysis progression to completion ---
{
  const claims: ClaimSummary[] = [
    { name: "React", type: "TECHNOLOGY", importance: "high", claimedLevel: null, coverageStatus: "NOT_VERIFIED", depthLevel: null },
    { name: "Redis", type: "TECHNOLOGY", importance: "medium", claimedLevel: null, coverageStatus: "NOT_VERIFIED", depthLevel: null },
  ];

  function turn(historyLen: number): ReturnType<typeof mockAnalyzeAnswer> {
    const history: QaTurn[] = Array.from({ length: historyLen }, (_, i) => ({
      index: i,
      question: "q",
      answer: "a",
      difficulty: 2,
    }));
    return mockAnalyzeAnswer({ claims, history, currentQuestion: "About React", currentDifficulty: 2 });
  }

  const first = turn(0);
  assert(first.interview_complete === false, "mock interview is not complete on turn 1");
  assert(first.topics.includes("React"), "mock analysis targets the claim named in the current question");
  assert(first.recommended_difficulty === 3, "difficulty increments by 1 each turn");

  const last = turn(2);
  assert(last.interview_complete === true, "mock interview concludes after its fixed turn count");

  const cappedDifficulty = mockAnalyzeAnswer({ claims, history: [], currentQuestion: "x", currentDifficulty: 5 });
  assert(cappedDifficulty.recommended_difficulty === 5, "difficulty never exceeds the schema's max of 5");
}

// --- evaluationAgentMock ---
{
  const claimsMixed: ClaimEvidence[] = [
    { name: "React", importance: "high", coverageStatus: "VERIFIED", depthLevel: 4, evidence: ["ev"], missingEvidence: [] },
    { name: "SQL", importance: "high", coverageStatus: "NOT_VERIFIED", depthLevel: null, evidence: [], missingEvidence: [] },
    { name: "CSS", importance: "low", coverageStatus: "NOT_VERIFIED", depthLevel: null, evidence: [], missingEvidence: [] },
  ];
  const narrative = mockEvaluationNarrative({ claims: claimsMixed });
  assert(narrative.strengths.some((s) => s.includes("React")), "verified claim appears as a strength");
  assert(narrative.gaps.some((g) => g.includes("SQL")), "unverified important claim appears as a gap");
  assert(!narrative.gaps.some((g) => g.includes("CSS")), "unverified LOW-importance claim is not listed as a gap");
  assert(narrative.roleAlignment.score > 0 && narrative.roleAlignment.score <= 1, "role alignment score is in range");

  const allUnverified = mockEvaluationNarrative({
    claims: [{ name: "X", importance: "high", coverageStatus: "NOT_VERIFIED", depthLevel: null, evidence: [], missingEvidence: [] }],
  });
  assert(allUnverified.strengths[0].includes("No claims"), "no false strengths invented when nothing is verified");
}

console.log(failures === 0 ? "\nAll mock-agent checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
