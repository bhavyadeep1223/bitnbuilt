import { z } from "zod";

/**
 * Every shape Claude is allowed to hand back to the app. Nothing from the
 * model reaches the DB or the client until it has passed one of these —
 * candidate-influenced text is untrusted input, structured output included.
 */

export const claimTypeSchema = z.enum([
  "SKILL",
  "TECHNOLOGY",
  "PROJECT",
  "EXPERIENCE",
  "EDUCATION",
  "CERTIFICATION",
  "ACHIEVEMENT",
  "CLAIM",
]);

export const resumeClaimSchema = z.object({
  type: claimTypeSchema,
  name: z.string().min(1).max(200),
  importance: z.enum(["low", "medium", "high"]),
  claimedLevel: z.string().max(100).nullable(),
  sourceText: z.string().max(2000).nullable(),
});

export const knowledgeMapSchema = z.object({
  claims: z.array(resumeClaimSchema).max(60),
});
export type KnowledgeMap = z.infer<typeof knowledgeMapSchema>;

export const consistencyObservationSchema = z.object({
  description: z.string().max(500),
  relatedClaimRefs: z.array(z.string()).max(10),
  confidence: z.number().min(0).max(1),
});

export const notableClaimSchema = z.object({
  statement: z.string().max(300),
  category: z.enum(["scale", "technology", "timeline", "team", "role", "outcome", "other"]),
});

export const answerAnalysisSchema = z.object({
  topics: z.array(z.string().max(100)).max(10),
  knowledge_depth: z.record(z.string(), z.number().min(1).max(5)),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().max(500)).max(10),
  missing_evidence: z.array(z.string().max(500)).max(10),
  resume_items_covered: z.array(z.string().max(200)).max(20),
  resume_items_remaining: z.array(z.string().max(200)).max(20),
  // Concrete, checkable factual assertions (a number, a specific tech choice,
  // a timeline) worth remembering for the rest of the interview — kept
  // separate from the capped recent-turn history so a contradiction between
  // question 2 and question 15 is still visible to later prompts.
  notable_claims: z.array(notableClaimSchema).max(3),
  consistency_observations: z.array(consistencyObservationSchema).max(5),
  reasoning_observations: z.array(z.string().max(500)).max(5),
  recommended_next_topic: z.string().max(200),
  recommended_question_type: z.enum([
    "clarification",
    "deeper_probe",
    "alternative_scenario",
    "simplify",
    "rephrase_check",
    "new_topic",
    "contradiction_check",
  ]),
  recommended_difficulty: z.number().int().min(1).max(5),
  next_question: z.string().min(1).max(1000),
  interview_complete: z.boolean(),
});
export type AnswerAnalysis = z.infer<typeof answerAnalysisSchema>;

export const openingQuestionSchema = z.object({
  question: z.string().min(1).max(1000),
  targetClaimName: z.string().max(200).nullable(),
  difficulty: z.number().int().min(1).max(5),
  questionType: z.string().max(100),
});
export type OpeningQuestion = z.infer<typeof openingQuestionSchema>;

/**
 * Only the genuinely qualitative parts — everything Claude here must ground
 * in the evidence bullets it's given, never invent. Coverage lists
 * (verified/partially/unverified), timing notes, and the integrity summary
 * are derived deterministically from stored data elsewhere, not asked of
 * the model, since that data is already known and shouldn't be restated
 * (or subtly altered) by an LLM.
 */
export const evaluationNarrativeSchema = z.object({
  strengths: z.array(z.string().max(500)).max(10),
  gaps: z.array(z.string().max(500)).max(10),
  reasoningNotes: z.array(z.string().max(500)).max(10),
  consistencyNotes: z.array(z.string().max(500)).max(10),
  roleAlignment: z.object({
    summary: z.string().max(1000),
    score: z.number().min(0).max(1),
  }),
});
export type EvaluationNarrative = z.infer<typeof evaluationNarrativeSchema>;
