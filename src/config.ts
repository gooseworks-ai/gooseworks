/**
 * Central config for the CLI.
 *
 * Defaults to production. Override with env vars for local development:
 *   GOOSEWORKS_API_BASE=http://localhost:5999
 *   GOOSEWORKS_FRONTEND_URL=http://localhost:4000
 *   GOOSEWORKS_HUB_URL=http://localhost:3998
 */

import { assertConnection, getEnvironment } from './environment';

export const API_BASE = process.env.GOOSEWORKS_API_BASE || (getEnvironment() === 'staging' ? 'https://api.staging.gooseworks.ai' : 'https://api.gooseworks.ai');
assertConnection(API_BASE, 'api');
// The GTM web app (app.gooseworks.ai) is being sunset; `gw auth` now opens the
// Goose Growth app (ads-frontend) at make.gooseworks.ai/cli/auth, which is a
// straight port of the old CLI login page. Old published CLI versions still hit
// app.gooseworks.ai and are handled by the sunset redirect layer.
export const FRONTEND_URL = process.env.GOOSEWORKS_FRONTEND_URL || (getEnvironment() === 'staging' ? 'https://ads-staging.gooseworks.ai' : 'https://make.gooseworks.ai');
if (getEnvironment() === 'staging') {
  const url = new URL(FRONTEND_URL);
  // The staging Growth app is ads-staging.gooseworks.ai (make.gooseworks.ai's staging twin);
  // app.staging is the retired GTM app and has no /link.
  const stagingFrontend = url.hostname === 'ads-staging.gooseworks.ai' || url.hostname.endsWith('.staging.gooseworks.ai');
  if (url.protocol !== 'https:' || !stagingFrontend || url.username || url.password) throw new Error('Staging sign-in must use the staging frontend');
}
// Public graphics hub (skills + formats catalog). Distinct host from FRONTEND_URL:
// `app.gooseworks.ai` has no /styles or /formats routes — those live on skills.gooseworks.ai.
// No staging public hub is deployed. Do not advertise a production catalog link.
export const HUB_URL = getEnvironment() === 'staging' ? '' : (process.env.GOOSEWORKS_HUB_URL || 'https://skills.gooseworks.ai');
