/** Package the pinned app export. Authoring and transformations live in apps/plugin. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pluginSource } from "../src/skills/plugin-source";
import { getEntrySkills } from "../src/skills/master-skill";
export const REPO = resolve(__dirname, "..");
export const ACTIVE_SKILLS = [
  "gooseworks",
  "goose-ads",
  "goose-product-photos",
  "goose-video",
  "make-custom-video",
];
export type Target = "portable" | "openai";
export type Files = Map<string, Buffer>;
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
function assertTarget(target: string): asserts target is Target {
  if (!["portable", "openai"].includes(target))
    throw new Error(`Unknown target: ${target}`);
}
export function filesFromBundle(
  bundle: typeof pluginSource,
  target: Target,
): Files {
  assertTarget(target);
  return new Map(
    Object.entries({
      ...bundle.packageFiles,
      ...(target === "openai" ? bundle.openaiOverrides : {}),
    }).map(([name, encoded]) => [name, Buffer.from(encoded, "base64")]),
  );
}
export function validateBundle(bundle: typeof pluginSource) {
  if (
    bundle.format !== 1 ||
    bundle.generatedBy !==
      "gooseworks-app/apps/plugin/scripts/export-consumer.ts" ||
    bundle.source.repository !==
      "https://github.com/athina-ai/gooseworks-app" ||
    bundle.source.directory !== "apps/plugin" ||
    bundle.source.inputState !== "clean" ||
    !/^[a-f0-9]{40}$/.test(bundle.source.commit)
  )
    throw new Error("Expected a clean committed app plugin export");
  if (
    JSON.stringify(bundle.entries.map((skill) => skill.name).sort()) !==
    JSON.stringify([...ACTIVE_SKILLS].sort())
  )
    throw new Error("App entry allowlist changed");
  if (
    Object.keys(bundle).sort().join(",") !==
    [
      "format",
      "generatedBy",
      "source",
      "entries",
      "routes",
      "snapshots",
      "packageFiles",
      "openaiOverrides",
    ]
      .sort()
      .join(",")
  )
    throw new Error("Unexpected consumer fields");
  for (const target of ["portable", "openai"] as const) {
    const files = filesFromBundle(bundle, target);
    validateFiles(files, target);
    const lock = JSON.parse(files.get("source-lock.json")!.toString());
    if (JSON.stringify(lock.source) !== JSON.stringify(bundle.source))
      throw new Error("Consumer source-lock differs from app pin");
    for (const skill of bundle.entries) {
      if (
        hash(Buffer.from(skill.content)) !==
        lock.skills[skill.name]?.sourceSha256
      )
        throw new Error(`Changed app entry: ${skill.name}`);
    }
  }
}
export function collectPluginFiles(target: Target): Files {
  assertTarget(target);
  validateBundle(pluginSource);
  const entries = getEntrySkills();
  if (
    JSON.stringify(entries.map((s) => s.name).sort()) !==
    JSON.stringify([...ACTIVE_SKILLS, "goose-video-local"].sort())
  )
    throw new Error(
      "Entry registry changed: review the plugin skill allowlist",
    );
  for (const skill of pluginSource.entries) {
    if (
      entries.find((item) => item.name === skill.name)?.content !==
        skill.content ||
      readFileSync(join(REPO, "skills", skill.name, "SKILL.md"), "utf8") !==
        skill.content
    )
      throw new Error(`Stale generated skill: ${skill.name}`);
  }
  return filesFromBundle(pluginSource, target);
}
export function validateFiles(files: Files, target: Target) {
  assertTarget(target);
  const allowed = [
    "plugin.json",
    "mcp.json",
    "assets/logo.png",
    "LICENSE",
    "README.md",
    "source-lock.json",
    ...ACTIVE_SKILLS.map((name) => `skills/${name}/SKILL.md`),
  ];
  for (const [path, bytes] of files) {
    if (!allowed.includes(path))
      throw new Error(`Unexpected package path: ${path}`);
    if (
      bytes
        .subarray(0, 100)
        .toString()
        .includes("version https://git-lfs.github.com/spec/v1")
    )
      throw new Error(`LFS pointer: ${path}`);
    if (
      path !== "assets/logo.png" &&
      /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-|live-|test-)[A-Za-z0-9_-]{12,}|\bgh[pousr]_[A-Za-z0-9]{20,}|https?:\/\/[^\s/]+:[^\s/@]+@)/.test(
        bytes.toString(),
      )
    )
      throw new Error(`Possible credential in ${path}`);
  }
  for (const path of allowed)
    if (!files.has(path)) throw new Error(`Missing package file: ${path}`);
  const manifest = JSON.parse(files.get("plugin.json")!.toString());
  if (
    manifest.name !== "gooseworks" ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    manifest.$schema !==
      "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
  )
    throw new Error("Unexpected plugin identity/schema");
  if (target === "portable" && manifest.extensions)
    throw new Error("Portable candidate contains provider fields");
  if (target === "openai") {
    const extension = manifest.extensions?.["com.openai"];
    if (
      !extension ||
      extension.apps ||
      extension.hooks ||
      extension.review?.test_credentials ||
      extension.review?.reviewer_instructions
    )
      throw new Error("Invalid public OpenAI fields");
    if (
      extension.interface.longDescription !== manifest.description ||
      extension.interface.developerName !== manifest.author.name ||
      extension.interface.websiteURL !== manifest.homepage
    )
      throw new Error("Shared listing metadata differs");
    if (
      extension.review.test_cases.positive.length !== 5 ||
      extension.review.test_cases.negative.length !== 3
    )
      throw new Error("Expected five positive and three negative cases");
  }
  const expectedMcp = {
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: {
      gooseworks: {
        type: "streamable-http",
        url: "https://mcp.gooseworks.ai/mcp",
      },
    },
  };
  if (
    JSON.stringify(JSON.parse(files.get("mcp.json")!.toString())) !==
    JSON.stringify(expectedMcp)
  )
    throw new Error("MCP must use only the production endpoint");
  const lock = JSON.parse(files.get("source-lock.json")!.toString());
  if (
    lock.target !== target ||
    lock.pluginVersion !== manifest.version ||
    Object.keys(lock.files).sort().join(",") !==
      allowed
        .filter((path) => path !== "source-lock.json")
        .sort()
        .join(",")
  )
    throw new Error("Source-lock file set differs");
  for (const [path, bytes] of files)
    if (path !== "source-lock.json" && lock.files[path] !== hash(bytes))
      throw new Error(`Source-lock hash differs: ${path}`);
  for (const name of ACTIVE_SKILLS)
    if (
      lock.skills[name]?.exportedSha256 !==
      hash(files.get(`skills/${name}/SKILL.md`)!)
    )
      throw new Error(`Exported skill hash differs: ${name}`);
}
export function openAiReviewReadiness(files: Files) {
  const extension = JSON.parse(files.get("plugin.json")!.toString())
    .extensions?.["com.openai"];
  const missing: string[] = [];
  if (extension?.review?.test_cases?.positive?.length !== 5)
    missing.push("five positive review cases");
  if (extension?.review?.test_cases?.negative?.length !== 3)
    missing.push("three negative review cases");
  if (!extension?.review?.demo_recording_url?.startsWith("https://"))
    missing.push("verified accessible demo recording URL");
  if (!extension?.publication?.release_notes?.trim())
    missing.push("release notes");
  return {
    positiveCases: extension?.review?.test_cases?.positive?.length ?? 0,
    negativeCases: extension?.review?.test_cases?.negative?.length ?? 0,
    metadataComplete: !missing.length,
    missing,
    status:
      "Draft candidate; dedicated reviewer-account case execution and portal checks require separate evidence.",
  };
}

// Standard-library ZIP writer: fixed epoch, paths, permissions and ordering.
// Python is a preparation-only dependency, never shipped or run by the installed plugin.
export function makeZip(files: Files): Buffer {
  const script = [
    "import base64, io, json, sys, zipfile",
    "output = io.BytesIO()",
    'with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:',
    " for name, encoded in json.load(sys.stdin):",
    "  info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))",
    "  info.create_system = 3",
    "  info.external_attr = 0o100644 << 16",
    "  archive.writestr(info, base64.b64decode(encoded))",
    "sys.stdout.buffer.write(output.getvalue())",
  ].join("\n");
  const input = JSON.stringify(
    [...files]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, bytes]) => [name, bytes.toString("base64")]),
  );
  return execFileSync("python3", ["-c", script], {
    input,
    maxBuffer: 16 * 1024 * 1024,
  });
}

export function safeDestination(
  output: string,
  base = join(REPO, ".plugin-build"),
) {
  const full = resolve(output);
  if (!full.startsWith(base + sep))
    throw new Error(
      `Output must be a new directory below ${relative(REPO, base)}/`,
    );
  let part = REPO;
  for (const name of relative(REPO, full).split(sep)) {
    part = join(part, name);
    let stat;
    try {
      stat = lstatSync(part);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink() || !realpathSync(part).startsWith(REPO + sep))
      throw new Error("Output symlink or escaped path");
  }
  return full;
}

/** Existing directories are immutable: --check verifies; build always needs a fresh path. */
export function buildPlugin(
  target: Target,
  output = join(REPO, ".plugin-build", target),
) {
  const full = safeDestination(output);
  if (existsSync(full))
    throw new Error(
      `Output already exists; use --check or choose a fresh output: ${full}`,
    );
  const files = collectPluginFiles(target);
  const archive = makeZip(files);
  mkdirSync(full, { recursive: true });
  const packageRoot = join(full, "gooseworks");
  for (const [name, bytes] of files) {
    const path = join(packageRoot, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes, { flag: "wx" });
  }
  writeFileSync(join(full, "gooseworks.zip"), archive, { flag: "wx" });
  checkPlugin(target, full);
  return {
    directory: packageRoot,
    archive: join(full, "gooseworks.zip"),
    archiveSha256: hash(archive),
    ...(target === "openai"
      ? { reviewReadiness: openAiReviewReadiness(files) }
      : {}),
  };
}

export function checkPackageDirectory(target: Target, packageRoot: string) {
  const expected = collectPluginFiles(target);
  const actual: Files = new Map();
  function walk(directory: string) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name),
        stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`Package symlink: ${path}`);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile())
        actual.set(
          relative(packageRoot, path).split(sep).join("/"),
          readFileSync(path),
        );
      else throw new Error(`Unsupported package entry: ${path}`);
    }
  }
  if (lstatSync(packageRoot).isSymbolicLink())
    throw new Error("Package root is a symlink");
  walk(packageRoot);
  validateFiles(actual, target);
  if (
    actual.size !== expected.size ||
    [...expected].some(([name, bytes]) => !actual.get(name)?.equals(bytes))
  )
    throw new Error("Candidate differs from current canonical source");
  return actual;
}

export function checkPlugin(
  target: Target,
  output = join(REPO, ".plugin-build", target),
) {
  const full = safeDestination(output);
  const actual = checkPackageDirectory(target, join(full, "gooseworks"));
  const archivePath = join(full, "gooseworks.zip");
  if (
    lstatSync(archivePath).isSymbolicLink() ||
    !readFileSync(archivePath).equals(makeZip(actual))
  )
    throw new Error("Archive differs from reviewed package");
}
