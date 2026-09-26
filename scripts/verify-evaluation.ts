/**
 * Regression check for Phase 8's deterministic evaluation-report pieces.
 * Run with: npx tsx scripts/verify-evaluation.ts
 */
import { buildTimingNotes } from "@/lib/integrity/timingNotes";
import type { IntegrityReport } from "@/lib/integrity/buildIntegrityReport";
import { isSessionExpired, INTERVIEW_SESSION_TTL_MS } from "@/lib/engine/sessionExpiry";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failures++;
  } else {
    console.log("PASS:", msg);
  }
}

function fakeReport(overrides: Partial<IntegrityReport> = {}): IntegrityReport {
  return {
    crossQuestionConsistency: "HIGH",
    reasoningDepth: "HIGH",
    rephraseAbility: "NOT_TESTED",
    timingPattern: "NORMAL",
    languagePattern: "NORMAL",
    browserIntegrityEventCount: 0,
    verificationConfidence: 90,
    observations: [],
    ...overrides,
  };
}

const insufficient = buildTimingNotes(fakeReport({ timingPattern: "INSUFFICIENT_DATA" }));
assert(insufficient.length === 1 && /not enough answers/i.test(insufficient[0]), "insufficient data note is clear, not blank");

const normal = buildTimingNotes(fakeReport());
assert(normal.length === 1 && /consistent/i.test(normal[0]), "normal timing gets a reassuring note, no language note added");

const moderate = buildTimingNotes(fakeReport({ timingPattern: "MODERATE_DEVIATION" }));
assert(moderate[0].includes("moderate"), "moderate deviation is labeled moderate, not significant");
assert(moderate[0].includes("question difficulty or nervousness"), "timing note always carries the non-accusatory caveat");

const significant = buildTimingNotes(fakeReport({ timingPattern: "SIGNIFICANT_DEVIATION", languagePattern: "SIGNIFICANT_DEVIATION" }));
assert(significant.length === 2, "both timing and language notes appear when both deviate");
assert(significant[0].includes("significant"), "significant deviation is labeled significant");
assert(!significant.some((n) => /cheat/i.test(n)), "timing notes never use the word 'cheat'");

// --- session expiry ---
{
  const notActive = isSessionExpired({ status: "COMPLETED", startedAt: new Date(Date.now() - 10 * 60 * 60 * 1000) });
  assert(notActive === false, "a non-ACTIVE interview is never 'expired' by this check");

  const noStart = isSessionExpired({ status: "ACTIVE", startedAt: null });
  assert(noStart === false, "an ACTIVE interview with no startedAt yet is not expired");

  const fresh = isSessionExpired({ status: "ACTIVE", startedAt: new Date(Date.now() - 5 * 60 * 1000) });
  assert(fresh === false, "a freshly started interview is not expired");

  const stale = isSessionExpired({ status: "ACTIVE", startedAt: new Date(Date.now() - (INTERVIEW_SESSION_TTL_MS + 60_000)) });
  assert(stale === true, "an ACTIVE interview past the TTL is expired");
}

console.log(failures === 0 ? "\nAll evaluation checks passed (incl. session expiry)." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
