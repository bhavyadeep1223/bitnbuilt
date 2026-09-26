import "server-only";

/**
 * Mock mode is on whenever there's no real API key, or the developer
 * explicitly forces it with MOCK_AI=true (useful to keep testing for free
 * even after a real key is added). Every agent checks this BEFORE calling
 * runStructured, so a real network call is never attempted in mock mode —
 * runStructured itself also refuses to run as a belt-and-suspenders check,
 * in case an agent is ever added without its own guard.
 */
export function isMockMode(): boolean {
  return process.env.MOCK_AI === "true" || !process.env.ANTHROPIC_API_KEY;
}

/** Prefix used on every piece of mock-generated text so it's unmistakable in the UI — never confusable with real model output. */
export const MOCK_PREFIX = "[MOCK]";
