import { knowledgeMapSchema, type KnowledgeMap } from "@/lib/ai/schemas";

/**
 * Deterministic, zero-cost stand-in for the real Profile Agent — simple
 * keyword matching against the resume text, not a language model. Enough to
 * exercise the resume-upload → knowledge-map → coverage-tracker pipeline
 * end to end without an API key.
 */
const KEYWORD_DICTIONARY: { name: string; type: KnowledgeMap["claims"][number]["type"] }[] = [
  { name: "React", type: "TECHNOLOGY" },
  { name: "Node.js", type: "TECHNOLOGY" },
  { name: "TypeScript", type: "TECHNOLOGY" },
  { name: "Python", type: "TECHNOLOGY" },
  { name: "SQL", type: "SKILL" },
  { name: "PostgreSQL", type: "TECHNOLOGY" },
  { name: "AWS", type: "TECHNOLOGY" },
  { name: "Docker", type: "TECHNOLOGY" },
  { name: "Kubernetes", type: "TECHNOLOGY" },
  { name: "Redis", type: "TECHNOLOGY" },
  { name: "Machine Learning", type: "SKILL" },
  { name: "Leadership", type: "SKILL" },
];

export function mockBuildKnowledgeMap(input: { resumeText: string }): KnowledgeMap {
  const lower = input.resumeText.toLowerCase();
  const matched = KEYWORD_DICTIONARY.filter((k) => lower.includes(k.name.toLowerCase()));
  const claims = (matched.length > 0 ? matched : KEYWORD_DICTIONARY.slice(0, 3))
    .slice(0, 8)
    .map((k, i) => ({
      type: k.type,
      name: k.name,
      importance: (i < 2 ? "high" : i < 5 ? "medium" : "low") as "high" | "medium" | "low",
      claimedLevel: "intermediate",
      sourceText: null,
    }));

  return knowledgeMapSchema.parse({ claims });
}
