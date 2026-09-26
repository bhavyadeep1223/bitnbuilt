import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireCandidate } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/respond";
import { checkRateLimit, clientIdentifier } from "@/lib/security/rateLimit";
import { appendEvent, isEventLogSeqConflict } from "@/lib/integrity/eventLog";
import type { Prisma } from "@prisma/client";

const bodySchema = z.object({
  type: z.enum([
    "FOCUS_LOST",
    "FOCUS_RESTORED",
    "TAB_HIDDEN",
    "TAB_VISIBLE",
    "FULLSCREEN_EXIT",
    "FULLSCREEN_ENTER",
    "MIC_DISCONNECT",
    "MIC_RECONNECT",
    "AUDIO_INPUT_CHANGE",
  ]),
  timestamp: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Observations only — this endpoint never labels anything as cheating.
 * Browser signals are recorded and left for the recruiter-facing integrity
 * report to present as one input among several, always with interpretation
 * caveats attached.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rate = checkRateLimit(`integrity-event:${clientIdentifier(request)}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { id } = await params;
    const candidate = await requireCandidate();
    const body = bodySchema.parse(await request.json());

    const interview = await prisma.interview.findUnique({ where: { id } });
    if (!interview || interview.candidateId !== candidate.candidateId!) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    const timestamp = new Date(body.timestamp);

    // Two of the candidate's own browser events (e.g. blur + visibilitychange
    // on the same alt-tab) can arrive as separate requests close enough to
    // race on the event log's sequence number. Retrying the whole
    // transaction (not just the append) is what actually resolves it, since
    // a conflict inside one transaction poisons that transaction entirely.
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.integrityEvent.create({
            data: {
              interviewId: id,
              type: body.type,
              timestamp,
              metadata: (body.metadata ?? {}) as Prisma.InputJsonValue,
            },
          });
          await appendEvent(tx, id, "integrity_event", { type: body.type, metadata: body.metadata ?? {} });
        });
        break;
      } catch (error) {
        if (isEventLogSeqConflict(error) && attempt < MAX_ATTEMPTS) continue;
        throw error;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
