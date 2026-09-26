import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireCandidate } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/respond";
import { checkRateLimit, clientIdentifier } from "@/lib/security/rateLimit";
import { extractResumeText } from "@/lib/resume/extractText";
import { buildKnowledgeMap } from "@/lib/agents/profileAgent";
import { AiOutputError } from "@/lib/ai/claude";

const fieldsSchema = z.object({
  jobRoleId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const rate = checkRateLimit(`resume-upload:${clientIdentifier(request)}`, {
      limit: 5,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many uploads, please wait" }, { status: 429 });
    }

    const candidate = await requireCandidate();

    const form = await request.formData();
    const { jobRoleId } = fieldsSchema.parse({ jobRoleId: form.get("jobRoleId") });
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No resume file provided" }, { status: 400 });
    }

    const jobRole = await prisma.jobRole.findUnique({ where: { id: jobRoleId } });
    if (!jobRole) {
      return NextResponse.json({ error: "Job role not found" }, { status: 404 });
    }

    const resumeText = await extractResumeText(file);

    const knowledgeMap = await buildKnowledgeMap({
      resumeText,
      jobTitle: jobRole.title,
      jobDescription: jobRole.description,
    });

    const resumeProfile = await prisma.resumeProfile.create({
      data: {
        candidateId: candidate.candidateId!,
        rawText: resumeText,
        fileName: file.name.slice(0, 200),
        parsedAt: new Date(),
        claims: {
          create: knowledgeMap.claims.map((claim) => ({
            type: claim.type,
            name: claim.name,
            importance: claim.importance,
            claimedLevel: claim.claimedLevel,
            sourceText: claim.sourceText,
          })),
        },
      },
      include: { claims: true },
    });

    return NextResponse.json({
      resumeProfileId: resumeProfile.id,
      claims: resumeProfile.claims.map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        importance: c.importance,
        claimedLevel: c.claimedLevel,
        coverageStatus: c.coverageStatus,
      })),
    });
  } catch (error) {
    if (error instanceof AiOutputError) {
      return NextResponse.json(
        { error: "Could not analyze this resume right now — please try again" },
        { status: 502 }
      );
    }
    return apiErrorResponse(error);
  }
}
