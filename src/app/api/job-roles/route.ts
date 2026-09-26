import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRecruiter, getSessionUser } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/respond";
import { checkRateLimit, clientIdentifier } from "@/lib/security/rateLimit";

const createSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().min(10).max(10_000),
});

/**
 * Public listing (so a candidate can pick which role they're interviewing
 * for) by default; `?mine=true` scopes to the signed-in recruiter's own
 * roles for their dashboard.
 */
export async function GET(request: Request) {
  try {
    const mine = new URL(request.url).searchParams.get("mine") === "true";
    const user = mine ? await getSessionUser() : null;

    const jobRoles = await prisma.jobRole.findMany({
      where: mine ? { recruiterId: user?.recruiterId ?? "__none__" } : undefined,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        recruiter: { select: { company: true, name: true } },
      },
      take: 100,
    });
    return NextResponse.json({ jobRoles });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const rate = checkRateLimit(`job-roles:${clientIdentifier(request)}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const recruiter = await requireRecruiter();
    const body = createSchema.parse(await request.json());

    const jobRole = await prisma.jobRole.create({
      data: {
        recruiterId: recruiter.recruiterId!,
        title: body.title,
        description: body.description,
      },
    });

    return NextResponse.json({ jobRole }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
