import { createHash } from "node:crypto";
import { lstatSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateBundle, REPO } from "./plugin-package";

const args = process.argv.slice(2);
if (args.length !== 1)
  throw new Error(
    "Usage: npm run import:plugin -- /absolute/path/to/app-consumer.json",
  );
const input = resolve(args[0]);
if (!lstatSync(input).isFile() || lstatSync(input).isSymbolicLink())
  throw new Error("Consumer input must be a regular file");
const raw = readFileSync(input, "utf8");
const bundle = JSON.parse(raw);
validateBundle(bundle);
if (raw !== JSON.stringify(bundle, null, 2) + "\n")
  throw new Error("Use the unmodified deterministic app export");
const pin = {
  format: 1,
  bundleSha256: createHash("sha256").update(raw).digest("hex"),
  repository: bundle.source.repository,
  directory: bundle.source.directory,
  commit: bundle.source.commit,
};
const outputs = new Map([
  ["plugin-source.generated.json", raw],
  ["plugin-source-pin.json", JSON.stringify(pin, null, 2) + "\n"],
]);
// A failed two-file import is detected by the runtime pin before any skill runs.
for (const [name, bytes] of outputs) {
  const path = join(REPO, "src/skills", name);
  if (lstatSync(path).isSymbolicLink())
    throw new Error("Generated consumer output is a symlink");
  const temporary = path + ".importing";
  writeFileSync(temporary, bytes, { flag: "wx" });
  renameSync(temporary, path);
}
console.log(
  `Imported five app-owned entries from ${bundle.source.commit}. Run npm run generate:skills and package checks.`,
);
