// Prints the pinned downloads of the headless shell for the playwright-core
// version in package.json, to paste into SHELL_DOWNLOADS in
// src/kit/maker/browser.ts. It downloads each platform's zip once (about
// 100 MB each) and hashes it; run it only when playwright-core moves.
//
//   npx tsx scripts/pin-kit-browser.ts
import { createHash } from 'crypto';
import { pinnedShell } from '../src/kit/maker/browser';

const CFT = 'https://storage.googleapis.com/chrome-for-testing-public';
const PLAYWRIGHT = 'https://cdn.playwright.dev/dbazure/download/playwright/builds/chromium';

async function pin(url: string): Promise<{ url: string; bytes: number; sha256: string }> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  return { url, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}

async function main() {
  const { revision, version } = pinnedShell();
  const urls: Record<string, string> = {
    'darwin-arm64': `${CFT}/${version}/mac-arm64/chrome-headless-shell-mac-arm64.zip`,
    'darwin-x64': `${CFT}/${version}/mac-x64/chrome-headless-shell-mac-x64.zip`,
    'linux-x64': `${CFT}/${version}/linux64/chrome-headless-shell-linux64.zip`,
    'linux-arm64': `${PLAYWRIGHT}/${revision}/chromium-headless-shell-linux-arm64.zip`,
    'win32-x64': `${CFT}/${version}/win64/chrome-headless-shell-win64.zip`,
  };
  const pins: Record<string, unknown> = {};
  for (const [platform, url] of Object.entries(urls)) {
    console.error(`downloading ${platform}…`);
    pins[platform] = await pin(url);
  }
  console.log(JSON.stringify({ [revision]: pins }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
