/**
 * Single-source generator for the vendored entry skills.
 *
 * The entry-skill bodies live in ONE place — the pure functions in
 * `src/skills/master-skill.ts` (`getEntrySkills()`), which the CLI uses at
 * install time. This script writes each function's output to a committed
 * `skills/<name>/SKILL.md` so the SAME text is:
 *   - shipped in the npm package (package.json `files: ["skills"]`), and
 *   - fetchable from the public repo raw URL by the backend app-MCP server
 *     (which serves it to cowork clients that have no filesystem to install into).
 *
 * The runtime install path does NOT read these files — it still calls the
 * function — so regenerating here can never change terminal behavior. Run this
 * before publishing (wired into `prepublishOnly`) and commit the result so the
 * public repo always exposes the current skill text.
 *
 *   npm run generate:skills
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getEntrySkills } from "../src/skills/master-skill";

const here = dirname(fileURLToPath(import.meta.url));
const skillsRoot = join(here, "..", "skills");

for (const skill of getEntrySkills()) {
  const outPath = join(skillsRoot, skill.name, "SKILL.md");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, skill.content, "utf-8");
  console.log(`wrote ${outPath} (${skill.content.length} bytes)`);
}
