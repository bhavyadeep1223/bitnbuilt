import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRecruiter } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/respond";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const recruiter = await requireRecruiter();

    const jobRole = await prisma.jobRole.findUnique({ where: { id } });
    if (!jobRole || jobRole.recruiterId !== recruiter.recruiterId!) {
      return NextResponse.json({ error: "Job role not found" }, { status: 404 });
    }

    const interviews = await prisma.interview.findMany({
      where: { jobRoleId: id },
      orderBy: { createdAt: "desc" },
      include: { candidate: { select: { name: true } } },
    });

    return NextResponse.json({
      jobRole: { id: jobRole.id, title: jobRole.title },
      interviews: interviews.map((i) => ({
        id: i.id,
        status: i.status,
        candidateName: i.candidate.name,
        createdAt: i.createdAt,
        startedAt: i.startedAt,
        endedAt: i.endedAt,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
