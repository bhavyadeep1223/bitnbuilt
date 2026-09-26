"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type JobRole = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  recruiter: { company: string | null; name: string };
};

export default function RecruiterDashboardPage() {
  const [jobRoles, setJobRoles] = useState<JobRole[] | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadJobRoles() {
    try {
      const res = await fetch("/api/job-roles?mine=true");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load job roles");
      setJobRoles(data.jobRoles);
    } catch (e) {
      setError((e as Error).message);
      setJobRoles([]);
    }
  }

  useEffect(() => {
    // Standard fetch-on-mount; the rule flags setState reachable via the
    // awaited call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadJobRoles();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/job-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create job role");
        return;
      }
      setTitle("");
      setDescription("");
      await loadJobRoles();
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-grid flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <p className="font-mono text-xs tracking-[0.3em] text-accent uppercase">
          Recruiter dashboard
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Job roles</h1>

        <form onSubmit={handleCreate} className="glass-panel mt-6 rounded-2xl p-6">
          <h2 className="text-sm font-medium text-foreground">New job role</h2>
          <div className="mt-4 space-y-3">
            <input
              required
              placeholder="Job title, e.g. Senior Backend Engineer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
            <textarea
              required
              rows={5}
              placeholder="Job description — responsibilities, required skills, seniority…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent"
            />
          </div>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create job role"}
          </button>
        </form>

        <div className="mt-8 space-y-3">
          {jobRoles === null && <p className="text-sm text-muted">Loading…</p>}
          {jobRoles?.map((role) => (
            <Link
              key={role.id}
              href={`/dashboard/job-roles/${role.id}`}
              className="glass-panel block rounded-xl p-5 transition-colors hover:bg-white/[0.04]"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-foreground">{role.title}</h3>
                <span className="text-xs text-accent">View candidates →</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted">{role.description}</p>
            </Link>
          ))}
          {jobRoles?.length === 0 && (
            <p className="text-sm text-muted">No job roles yet — create one above.</p>
          )}
        </div>
      </div>
    </div>
  );
}
