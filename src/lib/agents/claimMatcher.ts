/**
 * Claude's structured output refers to resume items by free-text name
 * (e.g. "React", "JWT authentication"), not by our ResumeClaim ids. This
 * resolves those strings back to the actual tracked claim, so depth/coverage
 * updates land on the right row instead of silently no-oping.
 */

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

export function resolveClaimId(
  text: string,
  claims: { id: string; name: string }[]
): string | null {
  const normalizedText = normalize(text);
  if (!normalizedText) return null;

  const exact = claims.find((c) => normalize(c.name) === normalizedText);
  if (exact) return exact.id;

  const contains = claims.find((c) => {
    const n = normalize(c.name);
    return n.length > 2 && (normalizedText.includes(n) || n.includes(normalizedText));
  });
  return contains?.id ?? null;
}
