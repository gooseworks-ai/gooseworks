import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  ACTIVE_SKILLS,
  buildPlugin,
  checkPlugin,
  collectPluginFiles,
  filesFromBundle,
  makeZip,
  openAiReviewReadiness,
  REPO,
  validateBundle,
  validateFiles,
} from "../../scripts/plugin-package";
import * as master from "../../src/skills/master-skill";
import { pluginSource } from "../../src/skills/plugin-source";
import { distributionFiles } from "../../scripts/export-plugin";
const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");

describe("pinned app plugin consumer", () => {
  let work: string;
  beforeEach(() => {
    mkdirSync(join(REPO, ".plugin-build"), { recursive: true });
    work = mkdtempSync(join(REPO, ".plugin-build/test-"));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(work, { recursive: true, force: true });
  });

  it("preserves all six CLI entries and the five1.0.9 original/exported skill hashes", () => {
    const baseline = JSON.parse(
      readFileSync(
        join(REPO, "distributions/1.0.9/gooseworks/source-lock.json"),
        "utf8",
      ),
    );
    const files = collectPluginFiles("portable");
    expect(master.getEntrySkills().map((s) => s.name)).toEqual([
      "gooseworks",
      "goose-ads",
      "goose-video",
      "goose-video-local",
      "make-custom-video",
      "goose-product-photos",
    ]);
    for (const name of ACTIVE_SKILLS) {
      const skill = master.getEntrySkills().find((item) => item.name === name)!;
      expect(hash(skill.content)).toBe(baseline.skills[name].sourceSha256);
      expect(hash(files.get(`skills/${name}/SKILL.md`)!)).toBe(
        baseline.skills[name].exportedSha256,
      );
      expect(skill.content).toBe(
        readFileSync(join(REPO, "skills", name, "SKILL.md"), "utf8"),
      );
    }
    expect(files.has("skills/goose-video-local/SKILL.md")).toBe(false);
    expect(
      [...files.keys()].some((path) =>
        /\.app\.json|hooks|claude|credential/.test(path),
      ),
    ).toBe(false);
  });

  it("pins a clean private app source without needing a sibling checkout", () => {
    const lock = JSON.parse(
      collectPluginFiles("portable").get("source-lock.json")!.toString(),
    );
    expect(lock.source).toEqual(pluginSource.source);
    expect(lock.source.repository).toBe(
      "https://github.com/athina-ai/gooseworks-app",
    );
    expect(lock.source.directory).toBe("apps/plugin");
    expect(lock.source.inputState).toBe("clean");
    expect(lock.source.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(JSON.stringify(lock)).not.toContain(REPO);
    expect(() => validateBundle(pluginSource)).not.toThrow();
  });

  it("builds deterministic ZIPs with independent CRC, file-list and byte checks", () => {
    const a = buildPlugin("portable", join(work, "a")),
      b = buildPlugin("portable", join(work, "b"));
    expect(readFileSync(a.archive)).toEqual(readFileSync(b.archive));
    execFileSync("python3", [
      "-c",
      [
        "import pathlib,sys,zipfile",
        "with zipfile.ZipFile(sys.argv[1]) as z:",
        " assert z.testzip() is None",
        " assert len(z.namelist())==len(set(z.namelist()))",
        " root=pathlib.Path(sys.argv[2])",
        ' assert set(z.namelist())=={p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}',
        " for name in z.namelist(): assert z.read(name)==(root/name).read_bytes()",
      ].join("\n"),
      a.archive,
      a.directory,
    ]);
    expect(() => checkPlugin("portable", join(work, "a"))).not.toThrow();
    expect(makeZip(collectPluginFiles("portable"))).toEqual(
      makeZip(new Map([...collectPluginFiles("portable")].reverse())),
    );
  });

  it("keeps provider metadata separate and reports the real missing recording", () => {
    const portable = collectPluginFiles("portable"),
      openai = collectPluginFiles("openai");
    expect(
      JSON.parse(portable.get("plugin.json")!.toString()).extensions,
    ).toBeUndefined();
    const manifest = JSON.parse(openai.get("plugin.json")!.toString()),
      ext = manifest.extensions["com.openai"];
    expect(ext.interface.longDescription).toBe(manifest.description);
    expect(ext.interface.developerName).toBe(manifest.author.name);
    expect(ext.publication.countries).toEqual(
      expect.arrayContaining(["IN", "US"]),
    );
    for (const country of ["GB", "DE", "FR", "NO", "IS", "LI"])
      expect(ext.publication.countries).not.toContain(country);
    expect(ext.review.test_credentials).toBeUndefined();
    expect(ext.review.reviewer_instructions).toBeUndefined();
    expect(ext.review.demo_recording_url).toBeUndefined();
    expect(ext.publication.release_notes).toContain("1.0.10");
    expect(openAiReviewReadiness(openai)).toMatchObject({
      positiveCases: 5,
      negativeCases: 3,
      metadataComplete: false,
      missing: ["verified accessible demo recording URL"],
    });
    expect(() => validateFiles(openai, "portable")).toThrow("provider fields");
  });

  it("rejects runtime drift from generated entries and unknown app exports", () => {
    const entries = master.getEntrySkills();
    jest
      .spyOn(master, "getEntrySkills")
      .mockReturnValue([...entries, { name: "surprise", content: "x" }]);
    expect(() => collectPluginFiles("portable")).toThrow("allowlist");
    jest
      .spyOn(master, "getEntrySkills")
      .mockReturnValue(
        entries.map((skill) =>
          skill.name === "goose-ads"
            ? { ...skill, content: skill.content + "changed" }
            : skill,
        ),
      );
    expect(() => collectPluginFiles("portable")).toThrow(
      "Stale generated skill",
    );
    const invalid = JSON.parse(JSON.stringify(pluginSource));
    invalid.entries[0].content += "changed";
    expect(() => validateBundle(invalid)).toThrow("Changed app entry");
    invalid.source.inputState = "modified";
    expect(() => validateBundle(invalid)).toThrow("clean committed");
  });

  it("rejects malformed imports before either committed consumer file is replaced", () => {
    const pin = join(REPO, "src/skills/plugin-source-pin.json"),
      source = join(REPO, "src/skills/plugin-source.generated.json");
    const before = [hash(readFileSync(pin)), hash(readFileSync(source))];
    const bad = JSON.parse(JSON.stringify(pluginSource));
    bad.source.inputState = "modified";
    const input = join(work, "invalid.json");
    writeFileSync(input, JSON.stringify(bad, null, 2) + "\n");
    expect(() =>
      execFileSync(
        process.execPath,
        ["--import", "tsx", join(REPO, "scripts/import-plugin.ts"), input],
        { stdio: "pipe" },
      ),
    ).toThrow();
    expect([hash(readFileSync(pin)), hash(readFileSync(source))]).toEqual(
      before,
    );
  });

  it("rejects secrets, extra files, LFS pointers, alternate endpoints and changed file hashes", () => {
    for (const path of [
      ".app.json",
      "hooks/run.sh",
      "../escape",
      "skills/extra/SKILL.md",
    ]) {
      const files = collectPluginFiles("portable");
      files.set(path, Buffer.from("x"));
      expect(() => validateFiles(files, "portable")).toThrow(
        "Unexpected package path",
      );
    }
    const files = collectPluginFiles("portable");
    files.set(
      "assets/logo.png",
      Buffer.from("version https://git-lfs.github.com/spec/v1\n"),
    );
    expect(() => validateFiles(files, "portable")).toThrow("LFS pointer");
    files.set(
      "assets/logo.png",
      collectPluginFiles("portable").get("assets/logo.png")!,
    );
    files.set(
      "README.md",
      Buffer.from("sk-proj-EXAMPLE_not_a_real_secret_1234567890"),
    );
    expect(() => validateFiles(files, "portable")).toThrow(
      "Possible credential",
    );
    files.set("README.md", Buffer.from("modified"));
    expect(() => validateFiles(files, "portable")).toThrow(
      "Source-lock hash differs",
    );
    files.set(
      "mcp.json",
      Buffer.from(
        '{"mcpServers":{"gooseworks":{"url":"https://staging.example/mcp"}}}',
      ),
    );
    expect(() => validateFiles(files, "portable")).toThrow(
      "production endpoint",
    );
  });

  it("preserves existing outputs and rejects external paths, symlinks and archive changes", () => {
    const output = join(work, "candidate"),
      built = buildPlugin("portable", output);
    expect(() => buildPlugin("portable", output)).toThrow("already exists");
    expect(() =>
      buildPlugin("portable", join(REPO, "unapproved-output")),
    ).toThrow("below .plugin-build");
    expect(existsSync(join(REPO, "unapproved-output"))).toBe(false);
    symlinkSync(work, join(work, "link"));
    expect(() => buildPlugin("portable", join(work, "link", "escape"))).toThrow(
      "symlink",
    );
    symlinkSync(join(work, "missing"), join(work, "dangling"));
    expect(() =>
      buildPlugin("portable", join(work, "dangling", "escape")),
    ).toThrow("symlink");
    writeFileSync(built.archive, "badzip");
    expect(() => checkPlugin("portable", output)).toThrow("Archive differs");
  });

  it("exports the exact app-owned portable files into the single installable Cursor target", () => {
    const candidate = distributionFiles(),
      manifest = JSON.parse(candidate.files.get("plugin.json")!.toString());
    expect(candidate.files).toEqual(filesFromBundle(pluginSource, "portable"));
    expect(candidate.root).toBe(
      join(REPO, "distributions", manifest.version, "gooseworks"),
    );
    expect(JSON.parse(candidate.marketplace.toString()).plugins).toEqual([
      {
        name: "gooseworks",
        source: `distributions/${manifest.version}/gooseworks`,
        version: manifest.version,
        description: manifest.description,
        logo: "assets/logo.png",
      },
    ]);
  });
});
