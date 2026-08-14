export interface AttributionResult {
  recorded: boolean;
  kind?: 'marketing' | 'referral' | 'unknown';
}

/**
 * Attach an authenticated --ref touch without changing the user's original
 * signup attribution. The backend resolves marketing refs and keeps creator /
 * user referral handling on the existing OAuth path.
 *
 * Attribution is best-effort: a campaign tracking outage must never block
 * login or installation.
 */
export async function recordAttributionRef(
  apiBase: string,
  ref: string | undefined,
  apiKey: string,
): Promise<AttributionResult> {
  const trimmed = ref?.trim();
  if (!trimmed) return { recorded: false };

  try {
    const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/cli/attribution`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: trimmed }),
    });

    if (!response.ok) return { recorded: false };
    const body = await response.json() as Partial<AttributionResult>;
    return {
      recorded: body.recorded === true,
      ...(body.kind ? { kind: body.kind } : {}),
    };
  } catch {
    return { recorded: false };
  }
}
