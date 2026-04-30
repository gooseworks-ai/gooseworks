/**
 * Central config for the CLI.
 *
 * Defaults to production. Override with env vars for local development:
 *   GOOSEWORKS_API_BASE=http://localhost:5999
 *   GOOSEWORKS_FRONTEND_URL=http://localhost:3999
 *   GOOSEWORKS_HUB_URL=http://localhost:3998
 */

export const API_BASE = process.env.GOOSEWORKS_API_BASE || 'https://api.gooseworks.ai';
export const FRONTEND_URL = process.env.GOOSEWORKS_FRONTEND_URL || 'https://app.gooseworks.ai';
// Public graphics hub (skills + formats catalog). Distinct host from FRONTEND_URL:
// `app.gooseworks.ai` has no /styles or /formats routes — those live on skills.gooseworks.ai.
export const HUB_URL = process.env.GOOSEWORKS_HUB_URL || 'https://skills.gooseworks.ai';
