"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { CoverageTracker, type Claim } from "@/components/recruiter/CoverageTracker";
import { EvidenceReport, type EvaluationReportView } from "@/components/recruiter/EvidenceReport";

type IntegrityReport = {
  crossQuestionConsistency: "HIGH" | "MODERATE" | "LOW";
  reasoningDepth: "HIGH" | "MODERATE" | "LOW";
  rephraseAbility: "HIGH" | "MODERATE" | "LOW" | "NOT_TESTED";
  timingPattern: "NORMAL" | "MODERATE_DEVIATION" | "SIGNIFICANT_DEVIATION" | "INSUFFICIENT_DATA";
  languagePattern: "NORMAL" | "MODERATE_DEVIATION" | "SIGNIFICANT_DEVIATION" | "INSUFFICIENT_DATA";
  browserIntegrityEventCount: number;
  verificationConfidence: number;
  observations: string[];
};

type QaTurn = {
  id: string;
  index: number;
  text: string;
  answer: { transcript: string; submittedAt: string } | null;
};

type InterviewDetail = {
  id: string;
  status: string;
  jobRole: { title: string; description: string };
  resumeProfile: { claims: Claim[] };
  questions: QaTurn[];
  integrityReport?: IntegrityReport;
};

const LABEL_TONE: Record<string, string> = {
  HIGH: "text-emerald-400",
  NORMAL: "text-emerald-400",
  MODERATE: "text-amber-400",
  MODERATE_DEVIATION: "text-amber-400",
  LOW: "text-danger",
  SIGNIFICANT_DEVIATION: "text-danger",
  NOT_TESTED: "text-muted",
  INSUFFICIENT_DATA: "text-muted",
};

function formatLabel(value: string): string {
  return value.replace(/_/g, " ");
}

export default function RecruiterInterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evaluationReport, setEvaluationReport] = useState<EvaluationReportView | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [loadingEvaluation, setLoadingEvaluation] = useState(false);

  useEffect(() => {
    fetch(`/api/interviews/${id}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Could not load interview");
        setInterview(data.interview);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (interview?.status !== "COMPLETED" || evaluationReport || loadingEvaluation) return;
    // Fetch-on-status-change; the rule flags the loading-state setState here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingEvaluation(true);
    fetch(`/api/interviews/${id}/report`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Could not generate the evaluation report");
        setEvaluationReport(data.report);
      })
      .catch((e) => setEvaluationError(e.message))
      .finally(() => setLoadingEvaluation(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview?.status, id]);

  if (error) {
    return (
      <div className="bg-grid flex-1 px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm text-danger">{error}</p>
        </div>
      </div>
    );
  }
  if (!interview) {
    return (
      <div className="bg-grid flex-1 px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm text-muted">Loading…</p>
        </div>
      </div>
    );
  }

  const report = interview.integrityReport;

  return (
    <div className="bg-grid flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="text-xs text-muted hover:text-foreground">
          ← Dashboard
        </Link>
        <p className="mt-3 font-mono text-xs tracking-[0.3em] text-accent uppercase">
          {interview.status === "COMPLETED" ? "Finished interview" : "Live interview"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{interview.jobRole.title}</h1>

        {interview.status === "COMPLETED" && (
          <div className="mt-6">
            {loadingEvaluation && !evaluationReport && (
              <div className="glass-panel rounded-2xl p-6">
                <p className="text-sm text-muted">Generating the final evaluation report…</p>
              </div>
            )}
            {evaluationError && <p className="text-sm text-danger">{evaluationError}</p>}
            {evaluationReport && <EvidenceReport report={evaluationReport} />}
          </div>
        )}

        {report && (
          <div className="glass-panel mt-6 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground">Reasoning integrity</h2>
              <span className="text-2xl font-semibold text-foreground">
                {report.verificationConfidence}%
              </span>
            </div>
            <p className="text-xs text-muted">Verification confidence</p>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {(
                [
                  ["Cross-question consistency", report.crossQuestionConsistency],
                  ["Reasoning depth", report.reasoningDepth],
                  ["Rephrase ability", report.rephraseAbility],
                  ["Timing pattern", report.timingPattern],
                  ["Language pattern", report.languagePattern],
                  ["Browser signals", String(report.browserIntegrityEventCount)],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className={`font-medium ${LABEL_TONE[value] ?? "text-foreground"}`}>
                    {formatLabel(value)}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs text-muted uppercase tracking-wide">Observations</p>
              <ul className="mt-2 space-y-1.5">
                {report.observations.map((obs, i) => (
                  <li key={i} className="text-sm text-foreground">
                    · {obs}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                These are signals to interpret, not proof of anything — timing and language
                variation can also come from question difficulty, nervousness, or normal
                communication differences.
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-3">
          <p className="text-xs text-muted uppercase tracking-wide">Transcript</p>
          {interview.questions
            .filter((q) => q.answer)
            .map((q) => (
              <div key={q.id} className="rounded-lg border border-border bg-white/[0.02] p-4">
                <p className="text-sm text-foreground">{q.text}</p>
                <p className="mt-2 text-sm text-muted">{q.answer!.transcript}</p>
              </div>
            ))}
          {interview.questions.every((q) => !q.answer) && (
            <p className="text-sm text-muted">No answers submitted yet.</p>
          )}
        </div>

        <div className="mt-6">
          <CoverageTracker claims={interview.resumeProfile.claims} />
        </div>
      </div>
    </div>
  );
}
