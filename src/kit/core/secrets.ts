// Nothing secret leaves memory: the line token, the CLI login and signed links
// are never printed, logged or written to the run folder.

const PATTERNS: RegExp[] = [
  /vl1_[A-Za-z0-9_.-]+/g, // a private-line token
  /\bcal_[A-Za-z0-9_-]{8,}/g, // a CLI login
  /\bBearer\s+[^\s"']+/gi,
  /([?&](?:X-Amz-[A-Za-z-]+|Signature|Expires|Key-Pair-Id|Policy|sig|se|sp|token|access_token|api_key)=)[^&\s"']*/gi,
];

/** Text with every known secret, and anything shaped like one, replaced. */
export function redact(text: string, secrets: Array<string | null | undefined> = []): string {
  let out = text;
  for (const secret of secrets) if (secret && secret.length >= 8) out = out.split(secret).join('[redacted]');
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, (match, prefix?: string) => (typeof prefix === 'string' && match.startsWith(prefix) ? `${prefix}[redacted]` : '[redacted]'));
  }
  return out;
}

/** Whether a text holds a secret or a signed link (the run folder must never). */
export function holdsSecret(text: string, secrets: Array<string | null | undefined> = []): boolean {
  return redact(text, secrets) !== text;
}

/** A link with its query and fragment removed, so a signed link is never kept. */
export function unsignedLink(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return value;
    url.search = '';
    url.hash = '';
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return value;
  }
}

/** A JSON value with every http(s) link's query removed. */
export function withoutSignedLinks(value: unknown): unknown {
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? unsignedLink(value) : value;
  if (Array.isArray(value)) return value.map(withoutSignedLinks);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = withoutSignedLinks(v);
    return out;
  }
  return value;
}
