import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

const GENESIS_HASH = "0".repeat(64);

/**
 * Deterministic serialization (sorted object keys) — needed because Postgres
 * JSONB does not preserve insertion order, so a plain JSON.stringify on the
 * value read back from the DB would not reliably match the hash computed at
 * write time, producing false "tampered" verdicts on untouched data.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function computeHash(prevHash: string, seq: number, eventType: string, payload: unknown): string {
  return createHash("sha256")
    .update(`${prevHash}:${seq}:${eventType}:${stableStringify(payload)}`)
    .digest("hex");
}

type Db = typeof prisma | Prisma.TransactionClient;

/**
 * Two concurrent transactions appending for the same interview can both read
 * the same "last" row and race to claim the next seq — the unique
 * constraint on (interviewId, seq) catches that. Note this can't be retried
 * from inside `db` when `db` is a transaction client: Postgres poisons the
 * whole transaction on the first conflicting statement, so a caller using a
 * `tx` must retry the entire transaction, not just this call (see the
 * integrity-event route, the one place concurrent requests realistically
 * race on this).
 */
export async function appendEvent(
  db: Db,
  interviewId: string,
  eventType: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const last = await db.eventLogEntry.findFirst({
    where: { interviewId },
    orderBy: { seq: "desc" },
  });
  const seq = (last?.seq ?? -1) + 1;
  const prevHash = last?.hash ?? GENESIS_HASH;
  const hash = computeHash(prevHash, seq, eventType, payload);

  await db.eventLogEntry.create({
    data: { interviewId, seq, eventType, payload: payload as Prisma.InputJsonValue, prevHash, hash },
  });
}

/** True for the specific conflict this module's callers should retry the whole transaction for. */
export function isEventLogSeqConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function verifyEventLog(interviewId: string): Promise<boolean> {
  const entries = await prisma.eventLogEntry.findMany({
    where: { interviewId },
    orderBy: { seq: "asc" },
  });

  let prevHash = GENESIS_HASH;
  for (const entry of entries) {
    if (entry.prevHash !== prevHash) return false;
    const expected = computeHash(prevHash, entry.seq, entry.eventType, entry.payload);
    if (expected !== entry.hash) return false;
    prevHash = entry.hash;
  }
  return true;
}
