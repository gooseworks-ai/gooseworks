import * as https from 'https';
import * as http from 'http';

export interface RequestOpts {
  apiBase: string;
  apiKey: string;
  method?: string;
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function statusToMessage(status: number, label: string = 'Endpoint'): string {
  if (status === 401) {
    return 'Unauthorized — your API key may be invalid. Run "gooseworks login" to re-authenticate.';
  }
  if (status === 403) {
    return 'Forbidden — your account may lack access to this endpoint.';
  }
  if (status === 404) {
    return `${label} not found (server may be out of date).`;
  }
  if (status >= 500) {
    return `Server error (${status}). Please try again later.`;
  }
  return `Request failed with status ${status}.`;
}

export function requestJson<T = unknown>(opts: RequestOpts): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${opts.apiBase}${opts.path}`);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const client = url.protocol === 'https:' ? https : http;
    const method = (opts.method ?? (opts.body !== undefined ? 'POST' : 'GET')).toUpperCase();
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Accept': 'application/json',
    };
    let bodyStr: string | undefined;
    if (opts.body !== undefined && method !== 'GET' && method !== 'HEAD') {
      bodyStr = JSON.stringify(opts.body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }
    const req = client.request(url.toString(), { method, headers }, (res) => {
      const status = res.statusCode ?? 0;
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (status < 200 || status >= 300) {
          reject(new HttpError(statusToMessage(status), status));
          return;
        }
        try {
          resolve(JSON.parse(raw) as T);
        } catch {
          reject(new Error('Invalid response from server'));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}
