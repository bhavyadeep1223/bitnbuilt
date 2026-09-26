"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

type InterviewSummary = {
  id: string;
  status: "PENDING" | "ACTIVE" | "COMPLETED" | "EXPIRED";
  candidateName: string;
  createdAt: string;
};

const STATUS_STYLE: Record<InterviewSummary["status"], string> = {
  PENDING: "text-muted border-border",
  ACTIVE: "text-accent border-accent/40",
  COMPLETED: "text-emerald-400 border-emerald-400/30",
  EXPIRED: "text-danger border-danger/30",
};

export default function JobRoleCandidatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [jobRoleTitle, setJobRoleTitle] = useState("");
  const [interviews, setInterviews] = useState<InterviewSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/job-roles/${id}/interviews`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Could not load candidates");
        setJobRoleTitle(data.jobRole.title);
        setInterviews(data.interviews);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  return (
    <div className="bg-grid flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="text-xs text-muted hover:text-foreground">
          ← All job roles
        </Link>
        <p className="mt-3 font-mono text-xs tracking-[0.3em] text-accent uppercase">Candidates</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{jobRoleTitle}</h1>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <div className="mt-6 space-y-3">
          {interviews === null && !error && <p className="text-sm text-muted">Loading…</p>}
          {interviews?.map((interview) => (
            <Link
              key={interview.id}
              href={`/dashboard/interviews/${interview.id}`}
              className="glass-panel flex items-center justify-between rounded-xl p-4 transition-colors hover:bg-white/[0.04]"
            >
              <div>
                <p className="text-sm text-foreground">{interview.candidateName}</p>
                <p className="text-xs text-muted">
                  Applied {new Date(interview.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs ${STATUS_STYLE[interview.status]}`}>
                {interview.status}
              </span>
            </Link>
          ))}
          {interviews?.length === 0 && !error && (
            <p className="text-sm text-muted">No candidates have started an interview for this role yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
