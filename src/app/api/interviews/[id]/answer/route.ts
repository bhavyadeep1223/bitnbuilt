import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCandidate } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/respond";
import { checkRateLimit, clientIdentifier } from "@/lib/security/rateLimit";
import { submitAnswer } from "@/lib/engine/interviewEngine";
import { AiOutputError } from "@/lib/ai/claude";

const bodySchema = z.object({
  transcript: z.string().min(1).max(10_000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rate = checkRateLimit(`interview-answer:${clientIdentifier(request)}`, {
      limit: 30,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { id } = await params;
    const candidate = await requireCandidate();
    const { transcript } = bodySchema.parse(await request.json());

    // Only ever return what the candidate needs to keep going — internal
    // scoring, evidence, and reasoning notes stay server-side (recruiter view).
    const result = await submitAnswer(id, candidate.candidateId!, transcript);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AiOutputError) {
      return NextResponse.json(
        { error: "Could not process that answer right now — please try again" },
        { status: 502 }
      );
    }
    return apiErrorResponse(error);
  }
}
