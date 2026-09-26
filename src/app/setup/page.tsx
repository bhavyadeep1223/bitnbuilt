"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CoverageTracker, type Claim } from "@/components/recruiter/CoverageTracker";

type JobRole = { id: string; title: string; description: string };

export default function CandidateSetupPage() {
  const router = useRouter();
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [jobRoleId, setJobRoleId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeProfileId, setResumeProfileId] = useState<string | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [creatingInterview, setCreatingInterview] = useState(false);

  useEffect(() => {
    fetch("/api/job-roles")
      .then((r) => r.json())
      .then((data) => setJobRoles(data.jobRoles ?? []));
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!jobRoleId || !file) {
      setError("Select a job role and choose a resume file");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("jobRoleId", jobRoleId);
      formData.append("file", file);
      const res = await fetch("/api/resume/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not process resume");
        return;
      }
      setResumeProfileId(data.resumeProfileId);
      setClaims(data.claims);
    } catch {
      setError("Network error — please try again");
    } finally {
      setUploading(false);
    }
  }

  async function handleStartInterview() {
    if (!resumeProfileId) return;
    setCreatingInterview(true);
    setError(null);
    try {
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobRoleId, resumeProfileId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create interview");
        return;
      }
      router.push(`/interview/${data.interview.id}`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setCreatingInterview(false);
    }
  }

  return (
    <div className="bg-grid flex-1 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-xs tracking-[0.3em] text-accent uppercase">
          Candidate setup
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Upload your resume
        </h1>
        <p className="mt-2 text-sm text-muted">
          Pick the role you&apos;re interviewing for. We&apos;ll read your resume and track what
          needs to be verified during the interview.
        </p>

        <form onSubmit={handleUpload} className="glass-panel mt-6 space-y-4 rounded-2xl p-6">
          <div>
            <label className="text-xs text-muted">Job role</label>
            <select
              value={jobRoleId}
              onChange={(e) => setJobRoleId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            >
              <option value="">Select a role…</option>
              {jobRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted">Resume (PDF or .txt, max 5MB)</label>
            <input
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-1.5 file:text-black"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={uploading}
            className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? "Analyzing resume…" : "Analyze resume"}
          </button>
        </form>

        {claims.length > 0 && (
          <div className="mt-6 space-y-4">
            <CoverageTracker claims={claims} />
            <button
              onClick={handleStartInterview}
              disabled={creatingInterview}
              className="w-full rounded-full border border-accent px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
            >
              {creatingInterview ? "Preparing interview…" : "Start interview"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
