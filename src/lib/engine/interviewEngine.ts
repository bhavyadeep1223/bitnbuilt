import "server-only";
import { prisma } from "@/lib/db/prisma";
import { HttpError } from "@/lib/api/httpError";
import { appendEvent } from "@/lib/integrity/eventLog";
import { resolveClaimId } from "@/lib/agents/claimMatcher";
import {
  computeDepthUpdates,
  type ExistingAssessment,
} from "@/lib/agents/verificationAgent";
import {
  generateOpeningQuestion,
  analyzeAnswerAndGenerateNext,
  type ClaimSummary,
  type QaTurn,
  type ClaimLogEntry,
} from "@/lib/agents/interviewAgent";
import type { AnswerAnalysis } from "@/lib/ai/schemas";
import { expireIfNeeded } from "@/lib/engine/expiry";
import { Prisma } from "@prisma/client";

/** Hard ceiling so a misbehaving model (or a very thorough candidate) can't run the interview forever. */
const MAX_QUESTIONS = 20;

export class InterviewStateError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}

export class InterviewNotFoundError extends HttpError {
  constructor(message = "Interview not found") {
    super(404, message);
  }
}

type ClaimRow = { id: string; name: string; importance: string };

/**
 * Rebuilds the running "notable claims" log from every prior answer's
 * stored analysis — deliberately not capped like the recent-turn history,
 * so a contradiction between question 2 and question 15 is still visible.
 */
function extractClaimLog(
  priorQuestions: { index: number; answer: { analysis: unknown } | null }[]
): ClaimLogEntry[] {
  const log: ClaimLogEntry[] = [];
  for (const q of priorQuestions) {
    const analysis = q.answer?.analysis as { notable_claims?: unknown[] } | undefined;
    if (!analysis || !Array.isArray(analysis.notable_claims)) continue;
    for (const claim of analysis.notable_claims) {
      if (
        claim &&
        typeof claim === "object" &&
        "statement" in claim &&
        "category" in claim &&
        typeof (claim as { statement: unknown }).statement === "string"
      ) {
        log.push({
          questionIndex: q.index,
          statement: (claim as { statement: string }).statement,
          category: String((claim as { category: unknown }).category),
        });
      }
    }
  }
  return log;
}

async function loadInterviewClaimState(interviewId: string, resumeProfileId: string) {
  const [claimRows, assessmentRows] = await Promise.all([
    prisma.resumeClaim.findMany({ where: { resumeProfileId } }),
    prisma.skillAssessment.findMany({ where: { interviewId } }),
  ]);

  const assessmentByClaim = new Map(assessmentRows.map((a) => [a.resumeClaimId, a]));

  const claims: ClaimSummary[] = claimRows.map((c) => {
    const a = assessmentByClaim.get(c.id);
    return {
      name: c.name,
      type: c.type,
      importance: c.importance as ClaimSummary["importance"],
      claimedLevel: c.claimedLevel,
      coverageStatus: c.coverageStatus,
      depthLevel: a?.depthLevel ?? null,
    };
  });

  const existingAssessments = new Map<string, ExistingAssessment>();
  for (const a of assessmentRows) {
    existingAssessments.set(a.resumeClaimId, {
      depthLevel: a.depthLevel,
      confidence: a.confidence,
      evidence: (a.evidence as string[]) ?? [],
      missingEvidence: (a.missingEvidence as string[]) ?? [],
      questionsUsed: ((a.verifyingQuestionIds as string[]) ?? []).length,
    });
  }

  const claimRowsForMatching: ClaimRow[] = claimRows.map((c) => ({
    id: c.id,
    name: c.name,
    importance: c.importance,
  }));

  return { claims, claimRowsForMatching, assessmentByClaim, existingAssessments };
}

export async function startInterview(interviewId: string, candidateId: string) {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { jobRole: true },
  });
  if (!interview || interview.candidateId !== candidateId) {
    throw new InterviewNotFoundError();
  }
  if (await expireIfNeeded(interviewId, interview)) {
    throw new InterviewStateError("This interview session has expired");
  }

  if (interview.status === "ACTIVE") {
    const current = await prisma.question.findFirst({
      where: { interviewId },
      orderBy: { index: "desc" },
    });
    if (current) return { question: current, resumed: true };
  }

  if (interview.status !== "PENDING" && interview.status !== "ACTIVE") {
    throw new InterviewStateError(`Interview cannot be started from status ${interview.status}`);
  }

  const { claims, claimRowsForMatching } = await loadInterviewClaimState(
    interviewId,
    interview.resumeProfileId
  );

  const opening = await generateOpeningQuestion({
    jobTitle: interview.jobRole.title,
    jobDescription: interview.jobRole.description,
    claims,
  });

  const targetClaimId = opening.targetClaimName
    ? resolveClaimId(opening.targetClaimName, claimRowsForMatching)
    : null;

  try {
    const question = await prisma.$transaction(async (tx) => {
      const q = await tx.question.create({
        data: {
          interviewId,
          index: 0,
          text: opening.question,
          difficulty: opening.difficulty,
          questionType: opening.questionType,
          targetClaimId,
          generatedFromState: { kind: "opening" },
        },
      });
      await tx.interview.update({
        where: { id: interviewId },
        data: { status: "ACTIVE", startedAt: new Date() },
      });
      await appendEvent(tx, interviewId, "interview_started", { jobRoleId: interview.jobRoleId });
      await appendEvent(tx, interviewId, "question_generated", { questionId: q.id, index: 0 });
      return q;
    });

    return { question, resumed: false };
  } catch (error) {
    // A concurrent double-start race lost to another request that already
    // created question 0 — treat it as a resume rather than an error.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const current = await prisma.question.findFirst({ where: { interviewId }, orderBy: { index: "desc" } });
      if (current) return { question: current, resumed: true };
    }
    throw error;
  }
}

export type SubmitAnswerResult = {
  interviewComplete: boolean;
  nextQuestion: string | null;
  progress: { questionIndex: number; maxQuestions: number };
};

export async function submitAnswer(
  interviewId: string,
  candidateId: string,
  transcript: string
): Promise<SubmitAnswerResult> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { jobRole: true },
  });
  if (!interview || interview.candidateId !== candidateId) {
    throw new InterviewNotFoundError();
  }
  if (await expireIfNeeded(interviewId, interview)) {
    throw new InterviewStateError("This interview session has expired");
  }
  if (interview.status !== "ACTIVE") {
    throw new InterviewStateError(`Interview is not active (status ${interview.status})`);
  }

  const currentQuestion = await prisma.question.findFirst({
    where: { interviewId },
    orderBy: { index: "desc" },
    include: { answer: true },
  });
  if (!currentQuestion) throw new InterviewStateError("Interview has no current question");
  if (currentQuestion.answer) throw new InterviewStateError("Current question already answered");

  const priorQuestions = await prisma.question.findMany({
    where: { interviewId, index: { lt: currentQuestion.index } },
    orderBy: { index: "asc" },
    include: { answer: true },
  });
  const history: QaTurn[] = priorQuestions
    .filter((q) => q.answer)
    .map((q) => ({ index: q.index, question: q.text, answer: q.answer!.transcript, difficulty: q.difficulty }));
  const claimLog = extractClaimLog(priorQuestions);

  const { claims, claimRowsForMatching, existingAssessments } = await loadInterviewClaimState(
    interviewId,
    interview.resumeProfileId
  );

  const analysis: AnswerAnalysis = await analyzeAnswerAndGenerateNext({
    jobTitle: interview.jobRole.title,
    jobDescription: interview.jobRole.description,
    claims,
    history,
    claimLog,
    currentQuestion: currentQuestion.text,
    currentAnswer: transcript,
    currentDifficulty: currentQuestion.difficulty,
  });

  const depthUpdates = computeDepthUpdates({ analysis, claims: claimRowsForMatching, existingAssessments });

  const reachedCap = currentQuestion.index + 1 >= MAX_QUESTIONS;
  const isComplete = analysis.interview_complete || reachedCap;
  const nextTargetClaimId = !isComplete
    ? resolveClaimId(analysis.recommended_next_topic, claimRowsForMatching)
    : null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.answer.create({
        data: {
          questionId: currentQuestion.id,
          transcript,
          analysis: analysis as unknown as Prisma.InputJsonValue,
        },
      });
      await appendEvent(tx, interviewId, "answer_submitted", { questionId: currentQuestion.id });

      for (const update of depthUpdates) {
        const existingVerifyingIds =
          (existingAssessments.get(update.resumeClaimId)?.questionsUsed ?? 0) > 0
            ? await tx.skillAssessment
                .findUnique({
                  where: { interviewId_resumeClaimId: { interviewId, resumeClaimId: update.resumeClaimId } },
                })
                .then((row) => (row?.verifyingQuestionIds as string[]) ?? [])
            : [];
        const verifyingQuestionIds = Array.from(new Set([...existingVerifyingIds, currentQuestion.id]));

        await tx.skillAssessment.upsert({
          where: { interviewId_resumeClaimId: { interviewId, resumeClaimId: update.resumeClaimId } },
          create: {
            interviewId,
            resumeClaimId: update.resumeClaimId,
            depthLevel: update.depthLevel,
            confidence: update.confidence,
            evidence: update.evidence,
            missingEvidence: update.missingEvidence,
            verifyingQuestionIds,
          },
          update: {
            depthLevel: update.depthLevel,
            confidence: update.confidence,
            evidence: update.evidence,
            missingEvidence: update.missingEvidence,
            verifyingQuestionIds,
          },
        });

        await tx.resumeClaim.update({
          where: { id: update.resumeClaimId },
          data: { coverageStatus: update.coverageStatus, verifiedLevel: update.depthLevel },
        });
      }

      if (isComplete) {
        await tx.interview.update({
          where: { id: interviewId },
          data: { status: "COMPLETED", endedAt: new Date() },
        });
        await appendEvent(tx, interviewId, "interview_completed", { reachedCap });
      } else {
        const nextQuestion = await tx.question.create({
          data: {
            interviewId,
            index: currentQuestion.index + 1,
            text: analysis.next_question,
            difficulty: analysis.recommended_difficulty,
            questionType: analysis.recommended_question_type,
            targetClaimId: nextTargetClaimId,
            generatedFromState: { basedOnQuestionId: currentQuestion.id },
          },
        });
        await appendEvent(tx, interviewId, "question_generated", {
          questionId: nextQuestion.id,
          index: nextQuestion.index,
        });
      }
    });
  } catch (error) {
    // A near-simultaneous double-submit (e.g. a double-click) can race past
    // the pre-check above; the unique constraints on Answer/Question are the
    // real guard, so translate that conflict into a clean message instead of
    // a generic 500.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new InterviewStateError("Current question already answered");
    }
    throw error;
  }

  return {
    interviewComplete: isComplete,
    nextQuestion: isComplete ? null : analysis.next_question,
    progress: { questionIndex: currentQuestion.index, maxQuestions: MAX_QUESTIONS },
  };
}
