import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { HttpError } from "@/lib/api/httpError";
import { loadIntegrityReport } from "@/lib/integrity/loadIntegrityReport";
import { buildTimingNotes } from "@/lib/integrity/timingNotes";
import { summarizeReasoning, type AnalyzedTurn } from "@/lib/agents/reasoningRollup";
import { generateEvaluationNarrative, type ClaimEvidence } from "@/lib/agents/evaluationAgent";
import type { AnswerAnalysis } from "@/lib/ai/schemas";
import type { IntegrityReport } from "@/lib/integrity/buildIntegrityReport";

export class EvaluationNotAvailableError extends HttpError {
  constructor(message = "The evaluation report is only available once the interview is complete") {
    super(409, message);
  }
}

export type EvaluationReportView = {
  strengths: string[];
  gaps: string[];
  verifiedSkills: string[];
  partiallyVerified: string[];
  unverifiedClaims: string[];
  reasoningNotes: string[];
  consistencyNotes: string[];
  timingNotes: string[];
  integritySummary: IntegrityReport;
  roleAlignment: { summary: string; score: number };
  confidenceScore: number;
  createdAt: Date;
};

function toView(row: {
  strengths: unknown;
  gaps: unknown;
  verifiedSkills: unknown;
  partiallyVerified: unknown;
  unverifiedClaims: unknown;
  reasoningNotes: unknown;
  consistencyNotes: unknown;
  timingNotes: unknown;
  integritySummary: unknown;
  roleAlignment: unknown;
  confidenceScore: number;
  createdAt: Date;
}): EvaluationReportView {
  return {
    strengths: row.strengths as string[],
    gaps: row.gaps as string[],
    verifiedSkills: row.verifiedSkills as string[],
    partiallyVerified: row.partiallyVerified as string[],
    unverifiedClaims: row.unverifiedClaims as string[],
    reasoningNotes: row.reasoningNotes as string[],
    consistencyNotes: row.consistencyNotes as string[],
    timingNotes: row.timingNotes as string[],
    integritySummary: row.integritySummary as IntegrityReport,
    roleAlignment: row.roleAlignment as { summary: string; score: number },
    confidenceScore: row.confidenceScore,
    createdAt: row.createdAt,
  };
}

/**
 * Generates the final report on first request after completion and caches
 * it — unlike the integrity report (cheap pure logic, recomputed on every
 * read), this involves one LLM call, so it's persisted rather than redone.
 */
export async function getOrCreateEvaluationReport(interviewId: string): Promise<EvaluationReportView> {
  const existing = await prisma.evaluationReport.findUnique({ where: { interviewId } });
  if (existing) return toView(existing);

  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { jobRole: true },
  });
  if (!interview) throw new EvaluationNotAvailableError("Interview not found");
  if (interview.status !== "COMPLETED") throw new EvaluationNotAvailableError();

  const [claims, skillAssessments, questions, integrityReport] = await Promise.all([
    prisma.resumeClaim.findMany({ where: { resumeProfileId: interview.resumeProfileId } }),
    prisma.skillAssessment.findMany({ where: { interviewId } }),
    prisma.question.findMany({ where: { interviewId }, orderBy: { index: "asc" }, include: { answer: true } }),
    loadIntegrityReport(interviewId),
  ]);

  const assessmentByClaim = new Map(skillAssessments.map((a) => [a.resumeClaimId, a]));
  const claimEvidence: ClaimEvidence[] = claims.map((c) => {
    const a = assessmentByClaim.get(c.id);
    return {
      name: c.name,
      importance: c.importance as ClaimEvidence["importance"],
      coverageStatus: c.coverageStatus,
      depthLevel: a?.depthLevel ?? null,
      evidence: (a?.evidence as string[]) ?? [],
      missingEvidence: (a?.missingEvidence as string[]) ?? [],
    };
  });

  const turns: AnalyzedTurn[] = questions
    .filter((q) => q.answer)
    .map((q) => ({ questionType: q.questionType, analysis: q.answer!.analysis as unknown as AnswerAnalysis }));
  const reasoning = summarizeReasoning(turns);

  const narrative = await generateEvaluationNarrative({
    jobTitle: interview.jobRole.title,
    jobDescription: interview.jobRole.description,
    claims: claimEvidence,
    reasoning,
    timingPattern: integrityReport.timingPattern,
    languagePattern: integrityReport.languagePattern,
  });

  const verifiedSkills = claims.filter((c) => c.coverageStatus === "VERIFIED").map((c) => c.name);
  const partiallyVerified = claims.filter((c) => c.coverageStatus === "PARTIALLY_VERIFIED").map((c) => c.name);
  const unverifiedClaims = claims
    .filter((c) => c.coverageStatus === "NOT_VERIFIED" && c.importance !== "low")
    .map((c) => c.name);
  const timingNotes = buildTimingNotes(integrityReport);

  try {
    const created = await prisma.evaluationReport.create({
      data: {
        interviewId,
        strengths: narrative.strengths,
        gaps: narrative.gaps,
        verifiedSkills,
        partiallyVerified,
        unverifiedClaims,
        reasoningNotes: narrative.reasoningNotes,
        consistencyNotes: narrative.consistencyNotes,
        timingNotes,
        integritySummary: integrityReport as unknown as Prisma.InputJsonValue,
        roleAlignment: narrative.roleAlignment as unknown as Prisma.InputJsonValue,
        confidenceScore: integrityReport.verificationConfidence / 100,
      },
    });
    return toView(created);
  } catch (error) {
    // Another concurrent request created it first — read it back instead of erroring.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const row = await prisma.evaluationReport.findUnique({ where: { interviewId } });
      if (row) return toView(row);
    }
    throw error;
  }
}
