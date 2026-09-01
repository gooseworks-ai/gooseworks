/**
 * Central config for the CLI.
 *
 * Defaults to production. Override with env vars for local development:
 *   GOOSEWORKS_API_BASE=http://localhost:5999
 *   GOOSEWORKS_FRONTEND_URL=http://localhost:4000
 *   GOOSEWORKS_HUB_URL=http://localhost:3998
 */

export const API_BASE = process.env.GOOSEWORKS_API_BASE || 'https://api.gooseworks.ai';
// The GTM web app (app.gooseworks.ai) is being sunset; `gw auth` now opens the
// Goose Growth app (ads-frontend) at make.gooseworks.ai/cli/auth, which is a
// straight port of the old CLI login page. Old published CLI versions still hit
// app.gooseworks.ai and are handled by the sunset redirect layer.
export const FRONTEND_URL = process.env.GOOSEWORKS_FRONTEND_URL || 'https://make.gooseworks.ai';
// Public graphics hub (skills + formats catalog). Distinct host from FRONTEND_URL:
// `app.gooseworks.ai` has no /styles or /formats routes — those live on skills.gooseworks.ai.
export const HUB_URL = process.env.GOOSEWORKS_HUB_URL || 'https://skills.gooseworks.ai';
