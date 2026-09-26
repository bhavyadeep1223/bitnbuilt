import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRecruiter } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/respond";
import { getOrCreateEvaluationReport } from "@/lib/engine/evaluationEngine";
import { AiOutputError } from "@/lib/ai/claude";
import { checkRateLimit, clientIdentifier } from "@/lib/security/rateLimit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Cheap once cached, but the first call for a given interview triggers a
    // real (paid) LLM call — worth rate-limiting even behind recruiter auth.
    const rate = checkRateLimit(`interview-report:${clientIdentifier(request)}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { id } = await params;
    const recruiter = await requireRecruiter();

    const interview = await prisma.interview.findUnique({ where: { id } });
    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }
    const ownsRole =
      (await prisma.jobRole.count({
        where: { id: interview.jobRoleId, recruiterId: recruiter.recruiterId! },
      })) > 0;
    if (!ownsRole) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const report = await getOrCreateEvaluationReport(id);
    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof AiOutputError) {
      return NextResponse.json(
        { error: "Could not generate the evaluation report right now — please try again" },
        { status: 502 }
      );
    }
    return apiErrorResponse(error);
  }
}
