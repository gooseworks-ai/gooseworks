/**
 * Central config for the CLI.
 *
 * Defaults to production. Override with env vars for local development:
 *   GOOSEWORKS_API_BASE=http://localhost:5999
 *   GOOSEWORKS_FRONTEND_URL=http://localhost:3999
 */

export const API_BASE = process.env.GOOSEWORKS_API_BASE || 'https://api.gooseworks.ai';
export const FRONTEND_URL = process.env.GOOSEWORKS_FRONTEND_URL || 'https://app.gooseworks.ai';
