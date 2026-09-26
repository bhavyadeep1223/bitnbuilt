import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isSessionExpired } from "@/lib/engine/sessionExpiry";

/** Lazily flips an overdue ACTIVE interview to EXPIRED on next access — no background job required. Returns true if it just expired (or already had). */
export async function expireIfNeeded(
  interviewId: string,
  interview: { status: string; startedAt: Date | null }
): Promise<boolean> {
  if (interview.status === "EXPIRED") return true;
  if (!isSessionExpired(interview)) return false;

  await prisma.interview
    .update({ where: { id: interviewId }, data: { status: "EXPIRED", endedAt: new Date() } })
    .catch(() => {
      // Best-effort housekeeping — the caller still treats the session as
      // expired even if this particular write loses a race.
    });
  return true;
}
