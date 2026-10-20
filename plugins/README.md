# Plugin package preparation

The plugin export reuses the current CLI workflows without changing their skill bodies. It creates review candidates for portable Agent Plugins clients and an OpenAI-specific listing candidate. These files have not been submitted, published or manually verified in provider apps.

## Source and output

`src/skills/master-skill.ts` remains the entry registry and owns the skill text. The builder calls `getEntrySkills()` and checks the committed `skills/` copies before exporting. To meet the Agent Skills format, it keeps standard frontmatter fields and relocates custom fields (such as version, category and harness identifiers) into string-valued `metadata` entries. Descriptions and the Markdown workflow bodies remain unchanged. The source lock records both original and exported hashes. Existing CLI skill installation, the npm package file list and existing provider manifests remain unchanged.

The export contains `gooseworks`, `goose-ads`, `goose-product-photos`, `goose-video` and `make-custom-video`. The one-line `goose-video-local` helper remains available to CLI users; its guidance is already carried by the video workflows and is omitted from the new package. Additional recipes continue to be fetched on demand from the same GooseWorks connection.

```text
plugins/                         # reviewed package inputs
  plugin.json                    # portable identity, independently versioned
  mcp.json                       # production hosted MCP only
  assets/logo.png                # actual image bytes
  openai/extension.json          # public listing and preserved country exclusions
  PACKAGE-README.md              # shipped usage and handoff limits
.plugin-build/<target>/          # ignored review outputs
  gooseworks/
    plugin.json
    mcp.json
    assets/logo.png
    skills/<name>/SKILL.md
    LICENSE
    README.md
    source-lock.json
  gooseworks.zip
distributions/<version>/gooseworks/ # generated, committed installable snapshot
.cursor-plugin/marketplace.json     # generated pointer to that snapshot
```

The portable manifest owns the shared product description, publisher name and homepage. The OpenAI export derives those fields from it, so the two descriptions cannot drift. Provider-only fields stay in the OpenAI extension. The description states the existing local video handoff.

The default portable candidate has no client-specific metadata. The OpenAI candidate adds its public listing, preserved country restrictions, existing website-payment disclosure, five positive/three negative review scenarios and versioned release notes. Private reviewer accounts and credentials remain outside both packages. A demo URL is included only when a real accessible recording is supplied and verified; no placeholder URL ships. Production is the only configured endpoint; the builder never switches to staging or invents a fallback.

Prepared cases describe intended reviewer behavior; including them is not proof they ran. The OpenAI build reports missing metadata and explicitly requires separate dedicated-account execution and portal evidence. At version 1.0.9 preparation, the accessible demo and reviewer-account runs remain outstanding. Omitting a demo from a later ZIP may preserve an older portal value, so inspect the saved portal details before submission.

## Build and verify

Prerequisites: the repository's Node/npm dependencies, Git for source revision, Python 3's standard-library ZIP writer, and hydrated `plugins/assets/logo.png` image bytes. The normal dependency install remains unchanged. Packaging is local and makes no GooseWorks API calls or paid generations.

```sh
npm run build:plugin -- portable
npm run build:plugin -- openai
npm run build:plugin -- portable --check
npm run build:plugin -- openai --check
npm run test:plugin
npm run test:plugin:format -- .plugin-build/portable/gooseworks .plugin-build/openai/gooseworks
npm run export:plugin
npm run export:plugin -- --check
```

Output paths must be inside `.plugin-build/`. The builder writes only to a new directory and never deletes or replaces existing output. To prepare a revised candidate, supply a fresh directory, for example `npm run build:plugin -- portable .plugin-build/portable-r2`. Use `--check` to verify an existing candidate against the current source.

Every candidate includes a source commit, CLI version, input hashes, individual skill hashes and package-file hashes. Its archive uses fixed timestamps and ordering. Verification checks the exact file set, source parity, production endpoint, referenced image files and archive bytes; it rejects symlinks, asset pointers, common credential formats and unexpected skill registry changes. The explicit allowlist is the main defense against accidentally copying private files; the credential scan is an additional limited check.

## Installable Git distribution

`export:plugin` writes the portable package to `distributions/<plugin-version>/gooseworks/` and generates the repository's Cursor marketplace pointer. These files are committed so a provider can load the actual package from a pinned revision. An ignored build directory or the CLI source repository alone is not the distribution. The same portable folder is the Grok Bot candidate; its actual host installation still needs its own test.

Keep the canonical inputs in `plugins/` and the entry generator. Never edit a distribution's copied skills. Exported version directories are immutable: use a new plugin version for any change after a candidate circulates. The generator may refresh only its own named single-plugin Cursor marketplace; it rejects an unrelated existing marketplace.

For a final snapshot, commit the canonical input changes first, then run `export:plugin` and commit the generated directory and marketplace. The source lock pins the last commit that changed canonical inputs, records those exact input hashes, and marks uncommitted input changes as `modified`. The second commit adds only outputs, so it does not invalidate that source revision. Final review artifacts require `inputState: clean` and successful `--check` runs. A branch commit is an installation/test source, not a public tag, release or marketplace approval.

Cursor's [current plugin reference](https://cursor.com/docs/reference/plugins) documents the root Agent Plugins format and repository marketplace source paths. This HTTPS MCP package uses no unsupported root/data variable expansion. Logo bytes are committed inside the generated plugin folder. The public marketplace submission remains a separate reviewed action.

Tests independently open archives with Python 3's standard-library ZIP reader, verify CRCs and compare every extracted byte with the package. Python is a preparation and test prerequisite; it is not shipped with or required by the installed plugin.

The separate format check uses Python's `jsonschema` and `PyYAML` packages, the unmodified vendored upstream JSON schemas, and the Agent Skills frontmatter rules. It runs offline against the built candidates. These optional test dependencies are not part of the CLI runtime or installed plugin.

## Manual acceptance before submission

For each provider, record its app version, candidate archive hash, account state, prompts, displayed approvals, output links and failures. A passing package test is not an installation or workflow pass.

1. Install this candidate in the actual provider app and sign in through its supported connection flow.
2. Complete brand setup with a fresh account; confirm an existing brand also works without resetting onboarding.
3. Complete one useful research job with real sources and actual returned data.
4. Request image ads and physical-product photos. Check the displayed price, decline once, then approve only an authorized test job and verify actual outputs.
5. Test video planning and its exact local-command handoff. Confirm who runs it, approval handling, and the real final result. Hosted chat alone is not assumed to render video.
6. Check missing credits, sign-in failure, cancellation and a reported job failure. Record capabilities that cannot be completed there.

Sandbox/coworker video execution has not been established or added. Claude work stays separate. Native adapters are added only after their current provider format has been verified; this package alone does not claim universal client support. Manual tests may spend credits and need an approved test budget before paid jobs.

Human review happens in the CLI PR and these generated archives. Submission, publishing, merging and deployment wait for the user's explicit approval.

## Format references

The root manifest, fixed `skills/` discovery and `mcp.json` transport follow [Agent Plugins 1.0.0](https://agent-plugins.org/specification), checked on 20 October 2026. The official [manifest schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json) and [MCP schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json) define the portable fields. Client-managed sign-in and provider-specific metadata remain subject to each provider's implementation.

The [Agent Skills specification](https://agentskills.io/specification) and its [reference validator](https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py) require standard frontmatter fields. This is the reason for the packaging-only metadata conversion. Source metadata values are retained as their original YAML value text inside string metadata entries.
