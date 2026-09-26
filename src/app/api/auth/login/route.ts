import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { apiErrorResponse } from "@/lib/api/respond";
import { checkRateLimit, clientIdentifier } from "@/lib/security/rateLimit";

const bodySchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  role: z.enum(["CANDIDATE", "RECRUITER"]),
  name: z.string().min(1).max(200).optional(),
});

/**
 * Single endpoint for both sign-in and first-time sign-up: tries Supabase
 * sign-in first, falls back to sign-up on failure, then mirrors the account
 * into our own User/Candidate/Recruiter rows. A hackathon-scale
 * simplification — split into /login and /register if this ships past MVP.
 */
export async function POST(request: Request) {
  const rate = checkRateLimit(`auth:${clientIdentifier(request)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many attempts, slow down" }, { status: 429 });
  }

  try {
    const body = bodySchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();

    let signIn = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (signIn.error) {
      const signUp = await supabase.auth.signUp({
        email: body.email,
        password: body.password,
      });
      if (signUp.error || !signUp.data.user) {
        return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
      }
      signIn = await supabase.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });
    }

    const supabaseUser = signIn.data.user;
    if (signIn.error || !supabaseUser) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    let dbUser = await prisma.user.findUnique({
      where: { supabaseId: supabaseUser.id },
      include: { candidate: true, recruiter: true },
    });

    if (!dbUser) {
      const name = body.name ?? body.email.split("@")[0];
      dbUser = await prisma.user.create({
        data: {
          email: body.email,
          supabaseId: supabaseUser.id,
          role: body.role,
          candidate: body.role === "CANDIDATE" ? { create: { name } } : undefined,
          recruiter: body.role === "RECRUITER" ? { create: { name } } : undefined,
        },
        include: { candidate: true, recruiter: true },
      });
    }

    if (dbUser.role !== body.role) {
      return NextResponse.json(
        { error: `This account is registered as ${dbUser.role.toLowerCase()}, not ${body.role.toLowerCase()}` },
        { status: 409 }
      );
    }

    return NextResponse.json({
      role: dbUser.role,
      candidateId: dbUser.candidate?.id ?? null,
      recruiterId: dbUser.recruiter?.id ?? null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
