import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireCandidate } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/respond";
import { checkRateLimit, clientIdentifier } from "@/lib/security/rateLimit";

const createSchema = z.object({
  jobRoleId: z.string().min(1),
  resumeProfileId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const rate = checkRateLimit(`interviews-create:${clientIdentifier(request)}`, {
      limit: 10,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const candidate = await requireCandidate();
    const body = createSchema.parse(await request.json());

    const [jobRole, resumeProfile, activeInterview] = await Promise.all([
      prisma.jobRole.findUnique({ where: { id: body.jobRoleId } }),
      prisma.resumeProfile.findFirst({
        where: { id: body.resumeProfileId, candidateId: candidate.candidateId! },
      }),
      prisma.interview.findFirst({
        where: { candidateId: candidate.candidateId!, status: { in: ["PENDING", "ACTIVE"] } },
      }),
    ]);

    if (!jobRole) {
      return NextResponse.json({ error: "Job role not found" }, { status: 404 });
    }
    if (!resumeProfile) {
      return NextResponse.json({ error: "Resume not found for this candidate" }, { status: 404 });
    }
    if (activeInterview) {
      return NextResponse.json(
        { error: "You already have an active interview in progress", interviewId: activeInterview.id },
        { status: 409 }
      );
    }

    const interview = await prisma.interview.create({
      data: {
        candidateId: candidate.candidateId!,
        jobRoleId: jobRole.id,
        resumeProfileId: resumeProfile.id,
        status: "PENDING",
      },
    });

    return NextResponse.json({ interview }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET() {
  try {
    const candidate = await requireCandidate();
    const interviews = await prisma.interview.findMany({
      where: { candidateId: candidate.candidateId! },
      orderBy: { createdAt: "desc" },
      include: { jobRole: { select: { title: true } } },
    });
    return NextResponse.json({ interviews });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
