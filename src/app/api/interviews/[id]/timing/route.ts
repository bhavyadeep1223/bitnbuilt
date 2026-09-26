import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireCandidate } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/respond";
import { checkRateLimit, clientIdentifier } from "@/lib/security/rateLimit";
import { computePauseMetrics } from "@/lib/timing/computePauseMetrics";

const bodySchema = z.object({
  questionId: z.string().min(1),
  questionEndTs: z.number(),
  responseStartTs: z.number().nullable(),
  answerStartTs: z.number(),
  answerEndTs: z.number(),
  speechEventTimestamps: z.array(z.number()).max(500),
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const TEN_MINUTES = 10 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rate = checkRateLimit(`interview-timing:${clientIdentifier(request)}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { id } = await params;
    const candidate = await requireCandidate();
    const body = bodySchema.parse(await request.json());

    const question = await prisma.question.findUnique({
      where: { id: body.questionId },
      include: { interview: true },
    });
    if (
      !question ||
      question.interviewId !== id ||
      question.interview.candidateId !== candidate.candidateId!
    ) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    // All derived numbers are computed server-side from raw timestamps —
    // the client never sends a pre-computed "score".
    const responseGapMs =
      body.responseStartTs != null
        ? clamp(body.responseStartTs - body.questionEndTs, 0, TEN_MINUTES)
        : null;
    const totalDurationMs = clamp(body.answerEndTs - body.answerStartTs, 0, THIRTY_MINUTES);
    const { pauses, longestPauseMs, avgPauseMs } = computePauseMetrics(
      body.speechEventTimestamps,
      body.answerStartTs,
      body.answerEndTs
    );

    const data = {
      questionEndTs: new Date(body.questionEndTs),
      responseStartTs: body.responseStartTs != null ? new Date(body.responseStartTs) : null,
      responseGapMs,
      answerStartTs: new Date(body.answerStartTs),
      answerEndTs: new Date(body.answerEndTs),
      totalDurationMs,
      pauses,
      longestPauseMs,
      avgPauseMs,
    };

    // Upsert, not create: a retried request (network hiccup, double-submit)
    // must overwrite the same question's timing rather than add a second
    // sample, which would otherwise double-weight that turn in the
    // baseline/deviation math downstream.
    await prisma.timingEvent.upsert({
      where: { questionId: body.questionId },
      create: { interviewId: id, questionId: body.questionId, ...data },
      update: data,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
