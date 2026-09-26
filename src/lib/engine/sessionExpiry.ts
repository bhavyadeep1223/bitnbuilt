/** An ACTIVE interview session that's been running this long is considered stale and expired, not left open indefinitely. */
export const INTERVIEW_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export function isSessionExpired(interview: { status: string; startedAt: Date | null }): boolean {
  if (interview.status !== "ACTIVE" || !interview.startedAt) return false;
  return Date.now() - interview.startedAt.getTime() > INTERVIEW_SESSION_TTL_MS;
}
