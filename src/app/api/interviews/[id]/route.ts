import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionUser, AuthError } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/respond";
import { loadIntegrityReport } from "@/lib/integrity/loadIntegrityReport";
import { expireIfNeeded } from "@/lib/engine/expiry";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();
    if (!user) throw new AuthError("Authentication required");

    const interview = await prisma.interview.findUnique({
      where: { id },
      include: {
        jobRole: { select: { title: true, description: true } },
        resumeProfile: {
          include: { claims: { orderBy: { importance: "desc" } } },
        },
        questions: {
          orderBy: { index: "asc" },
          include: { answer: true },
        },
      },
    });

    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    // Candidates may only see their own interview; recruiters may see any
    // interview tied to a job role they own.
    const isOwner = interview.candidateId === user.candidateId;
    const isOwningRecruiter =
      !!user.recruiterId &&
      (await prisma.jobRole.count({
        where: { id: interview.jobRoleId, recruiterId: user.recruiterId },
      })) > 0;

    if (!isOwner && !isOwningRecruiter) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (await expireIfNeeded(interview.id, interview)) {
      interview.status = "EXPIRED";
    }

    // Internal scoring/reasoning notes are recruiter-only — never shown to
    // the candidate mid-interview or after (spec: no hidden reasoning leaks).
    const questions = interview.questions.map((q) => ({
      id: q.id,
      index: q.index,
      text: q.text,
      difficulty: q.difficulty,
      questionType: q.questionType,
      answer: q.answer
        ? {
            transcript: q.answer.transcript,
            submittedAt: q.answer.submittedAt,
            ...(isOwningRecruiter ? { analysis: q.answer.analysis } : {}),
          }
        : null,
    }));

    const integrityReport = isOwningRecruiter ? await loadIntegrityReport(interview.id) : null;

    return NextResponse.json({
      viewerRole: isOwningRecruiter ? "RECRUITER" : "CANDIDATE",
      interview: {
        id: interview.id,
        status: interview.status,
        startedAt: interview.startedAt,
        endedAt: interview.endedAt,
        jobRole: interview.jobRole,
        resumeProfile: { claims: interview.resumeProfile.claims },
        questions,
        ...(integrityReport ? { integrityReport } : {}),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
