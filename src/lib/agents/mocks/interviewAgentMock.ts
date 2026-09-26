import {
  answerAnalysisSchema,
  openingQuestionSchema,
  type AnswerAnalysis,
  type OpeningQuestion,
} from "@/lib/ai/schemas";
import type { ClaimSummary, QaTurn } from "@/lib/agents/interviewAgent";

/** How many answered questions the mock interview runs before concluding — short, so the full loop is quick to demo. */
const MOCK_INTERVIEW_LENGTH = 3;

export function mockOpeningQuestion(input: { claims: ClaimSummary[] }): OpeningQuestion {
  const top = input.claims[0];
  return openingQuestionSchema.parse({
    question: top
      ? `[MOCK] Can you walk me through how you've used ${top.name} in a recent project?`
      : "[MOCK] Can you walk me through your most relevant recent project for this role?",
    targetClaimName: top?.name ?? null,
    difficulty: 2,
    questionType: "new_topic",
  });
}

export function mockAnalyzeAnswer(input: {
  claims: ClaimSummary[];
  history: QaTurn[];
  currentQuestion: string;
  currentDifficulty: number;
}): AnswerAnalysis {
  const turnIndex = input.history.length;
  const targetedClaim =
    input.claims.find((c) => input.currentQuestion.includes(c.name)) ?? input.claims[0];
  const nextClaim = input.claims.length > 0 ? input.claims[(turnIndex + 1) % input.claims.length] : undefined;
  const complete = turnIndex >= MOCK_INTERVIEW_LENGTH - 1;

  return answerAnalysisSchema.parse({
    topics: targetedClaim ? [targetedClaim.name] : [],
    knowledge_depth: targetedClaim ? { [targetedClaim.name]: 3 } : {},
    confidence: 0.65,
    evidence: [`[MOCK] Candidate described relevant experience with ${targetedClaim?.name ?? "the topic"}.`],
    missing_evidence: [],
    resume_items_covered: targetedClaim ? [targetedClaim.name] : [],
    resume_items_remaining: [],
    notable_claims: [],
    consistency_observations: [],
    reasoning_observations: ["[MOCK] Reasoning not evaluated by a real model in mock mode."],
    recommended_next_topic: nextClaim?.name ?? "wrap up",
    recommended_question_type: "new_topic",
    recommended_difficulty: Math.min(5, input.currentDifficulty + 1),
    next_question: complete
      ? "[MOCK] Thanks — that covers everything I needed for this mock run. This concludes the interview."
      : `[MOCK] Can you tell me more about your experience with ${nextClaim?.name ?? "another relevant area"}?`,
    interview_complete: complete,
  });
}
