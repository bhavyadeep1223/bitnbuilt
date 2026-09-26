"use client";

import { useEffect, useRef, useState, use } from "react";
import { CoverageTracker, type Claim } from "@/components/recruiter/CoverageTracker";
import { Waveform } from "@/components/interview/Waveform";
import { useSpeechRecognition } from "@/lib/speech/useSpeechRecognition";
import { useSpeechSynthesis } from "@/lib/speech/useSpeechSynthesis";
import { useBrowserIntegritySignals } from "@/lib/integrity/useBrowserIntegritySignals";

type QaTurn = {
  id: string;
  index: number;
  text: string;
  answer: { transcript: string; submittedAt: string } | null;
};

type InterviewDetail = {
  id: string;
  status: "PENDING" | "ACTIVE" | "COMPLETED" | "EXPIRED";
  jobRole: { title: string; description: string };
  resumeProfile: { claims: Claim[] };
  questions: QaTurn[];
};

export default function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");

  const recognition = useSpeechRecognition();
  const tts = useSpeechSynthesis();
  useBrowserIntegritySignals(id, interview?.status === "ACTIVE");

  const lastSpokenQuestionId = useRef<string | null>(null);
  const questionEndTsRef = useRef<number | null>(null);
  const responseStartTsRef = useRef<number | null>(null);

  async function loadInterview() {
    const res = await fetch(`/api/interviews/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not load interview");
    setInterview(data.interview);
  }

  useEffect(() => {
    // Standard fetch-on-mount pattern; the rule flags setState reachable via
    // the awaited call, but there's no external-system subscription here to
    // move it into.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInterview().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-speak a freshly arrived question exactly once, and reset per-turn timing/voice state.
  useEffect(() => {
    if (!interview || interview.status !== "ACTIVE") return;
    const current = interview.questions.at(-1);
    if (!current || current.answer) return;
    if (lastSpokenQuestionId.current === current.id) return;
    lastSpokenQuestionId.current = current.id;

    questionEndTsRef.current = null;
    responseStartTsRef.current = null;
    recognition.reset();
    setDraft("");

    if (tts.isSupported) {
      tts.speak(current.text, () => {
        questionEndTsRef.current = Date.now();
      });
    } else {
      questionEndTsRef.current = Date.now();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview]);

  // Keep the (editable) draft in sync with live dictation from the speech hook.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (recognition.transcript) setDraft(recognition.transcript);
  }, [recognition.transcript]);

  // First sign of speech marks the response-start timestamp for this turn.
  useEffect(() => {
    if (recognition.speechEventTimestamps.length > 0 && responseStartTsRef.current == null) {
      responseStartTsRef.current = recognition.speechEventTimestamps[0];
    }
  }, [recognition.speechEventTimestamps]);

  function handleDraftChange(value: string) {
    setDraft(value);
    if (responseStartTsRef.current == null && value.trim()) {
      responseStartTsRef.current = Date.now();
    }
  }

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/interviews/${id}/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start interview");
      await loadInterview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitTiming(questionId: string, answerStartTs: number, answerEndTs: number) {
    try {
      await fetch(`/api/interviews/${id}/timing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          questionEndTs: questionEndTsRef.current ?? answerStartTs,
          responseStartTs: responseStartTsRef.current,
          answerStartTs,
          answerEndTs,
          speechEventTimestamps: recognition.speechEventTimestamps,
        }),
      });
    } catch {
      // Timing is a secondary integrity signal — never block the interview on it.
    }
  }

  async function handleSubmitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    if (recognition.isListening) recognition.stop();

    const currentQuestion = interview?.questions.at(-1);
    if (!currentQuestion) return;

    setBusy(true);
    setError(null);
    const answerEndTs = Date.now();
    const answerStartTs = responseStartTsRef.current ?? answerEndTs;

    try {
      await submitTiming(currentQuestion.id, answerStartTs, answerEndTs);

      const res = await fetch(`/api/interviews/${id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit answer");
      setDraft("");
      recognition.reset();
      await loadInterview();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!interview) {
    return (
      <div className="bg-grid flex-1 px-6 py-12">
        <div className="mx-auto max-w-2xl">
          {error ? <p className="text-sm text-danger">{error}</p> : <p className="text-sm text-muted">Loading…</p>}
        </div>
      </div>
    );
  }

  const currentQuestion = interview.questions.at(-1);
  const awaitingAnswer = interview.status === "ACTIVE" && currentQuestion && !currentQuestion.answer;
  const micState = tts.isSpeaking ? "AI is speaking…" : recognition.isListening ? "Listening…" : "Idle";

  return (
    <div className="bg-grid flex-1 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs tracking-[0.3em] text-accent uppercase">Interview</p>
          {interview.status === "ACTIVE" && (
            <div className="flex items-center gap-2">
              <span
                className="flex items-center gap-1.5 text-xs text-muted"
                title="This session records timing and focus signals as part of the interview record."
              >
                <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
                Session monitored
              </span>
              <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">{micState}</span>
            </div>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{interview.jobRole.title}</h1>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        {interview.status === "PENDING" && (
          <div className="glass-panel mt-4 rounded-2xl p-6">
            <p className="text-sm text-muted">Your resume has been analyzed. Ready when you are.</p>
            <button
              onClick={handleStart}
              disabled={busy}
              className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Starting…" : "Start interview"}
            </button>
          </div>
        )}

        {interview.status === "COMPLETED" && (
          <div className="glass-panel mt-4 rounded-2xl p-6">
            <p className="text-sm text-foreground">Interview complete — thank you.</p>
            <p className="mt-1 text-sm text-muted">
              A full evidence-based report is generated for the recruiter.
            </p>
          </div>
        )}

        {interview.status === "ACTIVE" && currentQuestion && (
          <div className="glass-panel mt-4 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">Question {currentQuestion.index + 1}</p>
              {tts.isSupported && (
                <button
                  onClick={() => tts.speak(currentQuestion.text)}
                  className="text-xs text-accent hover:underline"
                >
                  Replay question
                </button>
              )}
            </div>
            <p className="mt-2 text-base text-foreground">{currentQuestion.text}</p>

            {awaitingAnswer && (
              <div className="mt-4">
                <div className="flex items-center gap-3">
                  {recognition.isSupported ? (
                    <button
                      type="button"
                      onClick={() => (recognition.isListening ? recognition.stop() : recognition.start())}
                      className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                        recognition.isListening
                          ? "bg-danger/20 text-danger border border-danger/40"
                          : "bg-accent text-black"
                      }`}
                    >
                      {recognition.isListening ? "Stop dictation" : "Speak answer"}
                    </button>
                  ) : (
                    <p className="text-xs text-muted">
                      Voice input isn&apos;t supported in this browser — type your answer below.
                    </p>
                  )}
                  <Waveform active={recognition.isListening} />
                </div>
                {recognition.error && (
                  <p className="mt-1 text-xs text-danger">Mic error: {recognition.error}</p>
                )}

                <form onSubmit={handleSubmitAnswer} className="mt-4 space-y-3">
                  <textarea
                    rows={5}
                    value={draft}
                    onChange={(e) => handleDraftChange(e.target.value)}
                    placeholder="Speak or type your answer…"
                    className="w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? "Analyzing…" : "Submit answer"}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {interview.questions.length > 1 && (
          <div className="mt-6 space-y-3">
            <p className="text-xs text-muted uppercase tracking-wide">Transcript so far</p>
            {interview.questions
              .filter((q) => q.answer)
              .map((q) => (
                <div key={q.id} className="rounded-lg border border-border bg-white/[0.02] p-4">
                  <p className="text-sm text-foreground">{q.text}</p>
                  <p className="mt-2 text-sm text-muted">{q.answer!.transcript}</p>
                </div>
              ))}
          </div>
        )}

        <div className="mt-6">
          <CoverageTracker claims={interview.resumeProfile.claims} />
        </div>
      </div>
    </div>
  );
}
