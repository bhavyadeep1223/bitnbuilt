import "server-only";
import { prisma } from "@/lib/db/prisma";
import { buildIntegrityReport, type IntegrityReport } from "@/lib/integrity/buildIntegrityReport";
import type { AnalyzedTurn } from "@/lib/agents/reasoningRollup";
import type { AnswerAnalysis } from "@/lib/ai/schemas";
import type { TimingSample } from "@/lib/integrity/timingBaseline";

export async function loadIntegrityReport(interviewId: string): Promise<IntegrityReport> {
  const [questions, timingEvents, browserIntegrityEventCount] = await Promise.all([
    prisma.question.findMany({
      where: { interviewId },
      orderBy: { index: "asc" },
      include: { answer: true },
    }),
    prisma.timingEvent.findMany({
      where: { interviewId },
      include: { question: { select: { index: true } } },
    }),
    prisma.integrityEvent.count({ where: { interviewId } }),
  ]);

  const answeredQuestions = questions.filter((q) => q.answer);

  const turns: AnalyzedTurn[] = answeredQuestions.map((q) => ({
    questionType: q.questionType,
    analysis: q.answer!.analysis as unknown as AnswerAnalysis,
  }));

  const timingSamples: TimingSample[] = [...timingEvents]
    .sort((a, b) => a.question.index - b.question.index)
    .map((t) => ({
      responseGapMs: t.responseGapMs,
      longestPauseMs: t.longestPauseMs,
      totalDurationMs: t.totalDurationMs,
    }));

  const answerTexts = answeredQuestions.map((q) => q.answer!.transcript);

  return buildIntegrityReport({ turns, timingSamples, answerTexts, browserIntegrityEventCount });
}
