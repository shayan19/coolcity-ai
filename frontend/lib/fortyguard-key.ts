export const FORTYGUARD_KEY_HEADER = "X-FortyGuard-API-Key";

export function fortyGuardHeaders(apiKey: string): Record<string, string> {
  const normalizedKey = apiKey.trim();
  return normalizedKey
    ? { Accept: "application/json", [FORTYGUARD_KEY_HEADER]: normalizedKey }
    : { Accept: "application/json" };
}

export function buildFortyGuardSubmitRequest(
  apiKey: string,
  body: unknown,
): { headers: Record<string, string>; body: string } {
  return {
    headers: { "Content-Type": "application/json", ...fortyGuardHeaders(apiKey) },
    body: JSON.stringify(body),
  };
}
