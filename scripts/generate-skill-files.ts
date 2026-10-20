/** Generate committed CLI files from the pinned app-owned consumer bundle. */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getEntrySkills } from "../src/skills/master-skill";
import { skillContentHash } from "../src/skills/releases";
import { getRouteManifest } from "../src/skills/routes";

const here = dirname(fileURLToPath(import.meta.url));
const skillsRoot = join(here, "..", "skills");

for (const skill of getEntrySkills()) {
  const outPath = join(skillsRoot, skill.name, "SKILL.md");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, skill.content, "utf-8");
  console.log(`wrote ${outPath} (${skill.content.length} bytes)`);
}

// The machine-readable routing table (GOOSE-3190). goose-skills'
// `collections/brand-growth/routes.json` and the backend's hosted-connector
// pointer both derive from this file; `tests/skills/route-drift.test.ts` fails
// when any of the three names a skill the others don't.
const routesPath = join(skillsRoot, "routes.json");
const routesJson = `${JSON.stringify(getRouteManifest(), null, 2)}\n`;
mkdirSync(skillsRoot, { recursive: true });
writeFileSync(routesPath, routesJson, "utf-8");
console.log(`wrote ${routesPath} (${routesJson.length} bytes)`);

// Compare published release bytes, rather than trusting the running CLI stamp.
const packageVersion = JSON.parse(
  readFileSync(join(here, "..", "package.json"), "utf8"),
).version;
writeFileSync(
  join(skillsRoot, "manifest.json"),
  JSON.stringify(
    {
      package: "gooseworks",
      version: packageVersion,
      entries: Object.fromEntries(
        getEntrySkills().map((skill) => [
          skill.name,
          skillContentHash(skill.content),
        ]),
      ),
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
