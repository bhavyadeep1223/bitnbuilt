import type { IntegrityReport } from "@/lib/integrity/buildIntegrityReport";

/** Deterministic, plain-language restatement of the integrity report's timing/language labels for the final evaluation report. */
export function buildTimingNotes(report: IntegrityReport): string[] {
  const notes: string[] = [];
  if (report.timingPattern === "INSUFFICIENT_DATA") {
    notes.push("Not enough answers were recorded to establish a timing baseline.");
  } else if (report.timingPattern === "NORMAL") {
    notes.push("Response timing stayed consistent with this candidate's own baseline throughout.");
  } else {
    const degree = report.timingPattern === "SIGNIFICANT_DEVIATION" ? "significant" : "moderate";
    notes.push(
      `Response timing showed a ${degree} deviation from this candidate's own baseline in at least one answer — this can also reflect question difficulty or nervousness, not necessarily anything else.`
    );
  }
  if (report.languagePattern === "MODERATE_DEVIATION" || report.languagePattern === "SIGNIFICANT_DEVIATION") {
    notes.push("Answer length or vocabulary varied from this candidate's typical pattern in at least one response.");
  }
  return notes;
}
