import { NextResponse } from "next/server";
import { requireCandidate } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/respond";
import { checkRateLimit, clientIdentifier } from "@/lib/security/rateLimit";
import { startInterview } from "@/lib/engine/interviewEngine";
import { AiOutputError } from "@/lib/ai/claude";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rate = checkRateLimit(`interview-start:${clientIdentifier(request)}`, {
      limit: 10,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { id } = await params;
    const candidate = await requireCandidate();
    const { question, resumed } = await startInterview(id, candidate.candidateId!);

    return NextResponse.json({
      resumed,
      question: { id: question.id, text: question.text, index: question.index },
    });
  } catch (error) {
    if (error instanceof AiOutputError) {
      return NextResponse.json(
        { error: "Could not start the interview right now — please try again" },
        { status: 502 }
      );
    }
    return apiErrorResponse(error);
  }
}
