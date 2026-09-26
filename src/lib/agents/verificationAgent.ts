import type { AnswerAnalysis } from "@/lib/ai/schemas";
import { resolveClaimId } from "@/lib/agents/claimMatcher";

export type CoverageStatus = "NOT_VERIFIED" | "PARTIALLY_VERIFIED" | "VERIFIED";

export type ExistingAssessment = {
  depthLevel: number;
  confidence: number;
  evidence: string[];
  missingEvidence: string[];
  questionsUsed: number;
};

export type DepthUpdate = {
  resumeClaimId: string;
  depthLevel: number;
  confidence: number;
  evidence: string[];
  missingEvidence: string[];
  coverageStatus: CoverageStatus;
  questionsUsed: number;
};

const MAX_EVIDENCE_ITEMS = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Folds one round of Claude's answer analysis into per-claim depth/coverage
 * state. Depth is a weighted blend rather than a running max: one strong
 * answer shouldn't alone cement a "5", and one weak follow-up shouldn't
 * erase prior evidence — both pull the estimate, weighted toward the latest
 * evidence since it's the most direct test of current understanding.
 */
export function computeDepthUpdates(params: {
  analysis: AnswerAnalysis;
  claims: { id: string; name: string }[];
  existingAssessments: Map<string, ExistingAssessment>;
}): DepthUpdate[] {
  const { analysis, claims, existingAssessments } = params;
  const updates = new Map<string, DepthUpdate>();

  for (const [topic, incomingDepth] of Object.entries(analysis.knowledge_depth)) {
    const claimId = resolveClaimId(topic, claims);
    if (!claimId) continue;

    const existing = existingAssessments.get(claimId);
    const questionsUsed = (existing?.questionsUsed ?? 0) + 1;

    const depthLevel = existing
      ? Math.round(existing.depthLevel * 0.4 + incomingDepth * 0.6)
      : incomingDepth;

    const confidence = existing
      ? clamp(existing.confidence * 0.3 + analysis.confidence * 0.7, 0, 1)
      : analysis.confidence;

    const evidence = dedupeCapped(
      [...(existing?.evidence ?? []), ...analysis.evidence],
      MAX_EVIDENCE_ITEMS
    );

    updates.set(claimId, {
      resumeClaimId: claimId,
      depthLevel: clamp(depthLevel, 1, 5),
      confidence,
      evidence,
      missingEvidence: analysis.missing_evidence,
      questionsUsed,
      coverageStatus: deriveCoverageStatus({
        depthLevel: clamp(depthLevel, 1, 5),
        confidence,
        questionsUsed,
      }),
    });
  }

  return Array.from(updates.values());
}

function deriveCoverageStatus(input: {
  depthLevel: number;
  confidence: number;
  questionsUsed: number;
}): CoverageStatus {
  const { depthLevel, confidence, questionsUsed } = input;

  // A single strong, confident answer can be sufficient; otherwise require a
  // second look before calling a claim fully verified.
  if (depthLevel >= 4 && confidence >= 0.7) return "VERIFIED";
  if (depthLevel >= 3 && confidence >= 0.6 && questionsUsed >= 2) return "VERIFIED";
  return "PARTIALLY_VERIFIED";
}

function dedupeCapped(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result.slice(-max);
}

/**
 * Whether a resume claim has enough evidence to stop probing it, scaled by
 * how important it is to the role — a "high" importance claim needs a
 * confident VERIFIED, a "low" one just needs a first pass.
 */
export function isSufficientlyVerified(
  coverageStatus: CoverageStatus,
  importance: string,
  questionsUsed: number
): boolean {
  if (coverageStatus === "VERIFIED") return true;
  if (coverageStatus === "PARTIALLY_VERIFIED") {
    if (importance === "low") return questionsUsed >= 1;
    if (importance === "medium") return questionsUsed >= 2;
    return false; // "high" importance claims keep probing until VERIFIED
  }
  return false;
}
