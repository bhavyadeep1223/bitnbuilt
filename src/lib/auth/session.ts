import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { HttpError } from "@/lib/api/httpError";
import type { UserRole } from "@prisma/client";

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  candidateId?: string;
  recruiterId?: string;
};

/**
 * Resolves the authenticated Supabase user to our own User/Candidate/Recruiter
 * records. Returns null when unauthenticated — callers must handle that
 * explicitly rather than assuming a session exists.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new ConfigError("Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser?.email) return null;

  const dbUser = await prisma.user.findUnique({
    where: { supabaseId: supabaseUser.id },
    include: { candidate: true, recruiter: true },
  });

  if (!dbUser) return null;

  return {
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    candidateId: dbUser.candidate?.id,
    recruiterId: dbUser.recruiter?.id,
  };
}

export async function requireCandidate(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || user.role !== "CANDIDATE" || !user.candidateId) {
    throw new AuthError("Candidate authentication required");
  }
  return user;
}

export async function requireRecruiter(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || user.role !== "RECRUITER" || !user.recruiterId) {
    throw new AuthError("Recruiter authentication required");
  }
  return user;
}

export class AuthError extends HttpError {
  constructor(message: string) {
    super(401, message);
  }
}

export class ConfigError extends HttpError {
  constructor(message: string) {
    super(500, message);
  }
}
