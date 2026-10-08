// The private line's wire shapes, as the kit sends and reads them. The server
// side is gooseworks-app apps/api/src/services/video-line/types.ts; when the
// two disagree, the server's file is right (private-line.md).

export const LINE_PREFIX = '/v1/video-line';
export const DEVICE_HEADER = 'x-gooseworks-device';
export const LEASE_HEADER = 'x-gooseworks-lease';
export const WORKER_HEADER = 'x-gooseworks-worker';
export const LINE_TOKEN_PREFIX = 'vl1_';
/** How a piece's payload names a file hosted through the line. */
export const HOSTED_FILE_PREFIX = 'gooseworks-file:';
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
export const MAX_CAPTIONS_BYTES = 64 * 1024;

/** Content types the line hosts for a provider to fetch. */
export const HOSTABLE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/wav', 'video/mp4'] as const;
export type HostableType = (typeof HOSTABLE_TYPES)[number];

export type LineNext = 'retry' | 'stop' | 'update_kit' | 'change_request';

export interface LineErrorBody {
  code: string;
  error: string;
  fix: string;
  next: LineNext;
  retry_after_seconds?: number;
  details?: Record<string, unknown>;
}

export interface ToolReport {
  ok: boolean;
  version: string | null;
  bundled: boolean;
  filters?: string[];
  encoders?: string[];
}

export interface DeviceReport {
  device_id: string;
  kind: 'computer' | 'worker';
  os: 'darwin' | 'linux' | 'win32';
  arch: 'arm64' | 'x64';
  kit_version: string;
  interfaces: number[];
  ffmpeg: ToolReport;
  ffprobe: ToolReport;
  browser: ToolReport;
  disk_free_mb: number;
  parts: Array<{ id: string; versions: string[] }>;
}

export interface Credits {
  used: number;
  cap: number;
}

export interface StylePackageRef {
  style_id: string;
  version: string;
  style_hash: string;
  url: string;
  sha256: string;
}

/** The frozen plan, as the line hands it over (A2's ApprovedPlan). */
export interface ApprovedPlan {
  project_id: string;
  quote_id: string;
  revision: number;
  style_id: string;
  style_version: string;
  style_hash: string;
  brand: Record<string, unknown>;
  layers: Record<string, { id: string; version: string }>;
  body: Record<string, unknown>;
  [field: string]: unknown;
}

/** The hand-over, without the token: the client keeps that to itself. */
export interface HandOver {
  project_id: string;
  quote_id: string;
  expires_at: string;
  stage: string;
  credits: Credits;
  plan: ApprovedPlan;
  parts_lock: unknown;
  style_package: StylePackageRef;
}

export interface DeviceAnswer {
  device_id: string;
  saved_at: string;
  kit: { ok: boolean; min_version: string; latest_version: string };
  styles: { ready: number; total: number };
  line?: HandOver;
}

export interface PieceRequest {
  idempotency_key: string;
  piece_key: string;
  part: { id: string; version: string };
  inputs_hash: string;
  call: { provider: string; path: string; body: Record<string, unknown> };
}

export interface PieceAnswer {
  piece_key: string;
  idempotency_key: string;
  status: 'running' | 'done' | 'failed';
  replayed: boolean;
  piece_credits: number;
  credits: Credits;
  result?: { json?: unknown; file_url?: string };
  failure?: LineErrorBody;
  retry_after_seconds?: number;
}

export interface ProgressStep {
  label: string;
  state: 'done' | 'now' | 'todo' | 'failed';
  detail?: string;
}

export interface ProgressRequest {
  pieces_done: number;
  pieces_total: number;
  eta_seconds: number | null;
  note: string;
  steps?: ProgressStep[];
}

export interface ProgressAnswer {
  stage: string;
  credits: Credits;
  report_within_seconds: number;
  /** Not sent today; honoured if the line adds it. */
  stop?: boolean;
}

export interface Slot {
  put: { url: string; headers: Record<string, string> };
  expires_at: string;
}

export interface UploadRequest {
  sha256: string;
  bytes: number;
  content_type: 'video/mp4';
  captions_vtt?: string;
  manifest?: Record<string, unknown>;
}

export interface UploadSlot extends Slot {
  upload_id: string;
  attempt: 1 | 2;
}

export interface CheckReason {
  check: string;
  message: string;
  expected?: string;
  found?: string;
}

export interface UploadCheck {
  upload_id: string;
  attempt: 1 | 2;
  result: 'pass' | 'fail';
  reasons: CheckReason[];
  fixes_left: number;
  stage: string;
  fee_credits: number;
  credits: Credits;
}
