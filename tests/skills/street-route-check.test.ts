import { getGooseVideoSkillContent } from '../../src/skills/master-skill';

// Self-QA T-STR-3 (GOOSE-3909 street route, 7 Oct 2026): a SaaS brand asked
// goose-video for a three-person, mic-only street interview. The catalog
// marked the physical-product street format "suggested", and the agent called
// it "exactly the three-person version you want", wrote a product-guess
// concept for software and tried to create the project. It never ran the
// street renderer's route selector, which rejects both readings. These checks
// keep that check ahead of any proposal or project. They prove the
// instruction is there and in order, not that an agent follows it.
const SECTION = "## Run the format's route check before proposing it";

/** Prose with its line wraps folded, so a rewrap never breaks a check. */
const flat = (text: string) => text.replace(/\s+/g, ' ');

describe('goose-video street-interview route check', () => {
  const video = getGooseVideoSkillContent();
  const start = video.indexOf(SECTION);
  const block = flat(video.slice(start, video.indexOf('\n## ', start + SECTION.length)));

  it('checks the route before the picker and before any project', () => {
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain('Before you propose, script or create a street-interview project');
    expect(start).toBeLessThan(video.indexOf('### 3. Show the picker'));
    expect(start).toBeLessThan(video.indexOf('### 5. Create the project'));
    const create = flat(video.slice(video.indexOf('### 5. Create the project')));
    expect(create).toContain('A street interview is created only after its route check found a supported setup.');
    expect(create).toContain("a street interview's route check result into its brief");
  });

  it('gives a chat host the routes as a table, and never the oversized package', () => {
    // The selector's two routes and its limits: four people need a physical
    // product; conversation takes one person and is a preview only.
    expect(block).toContain('| Guessing (`product-guess`) | Interviewer and up to four people | A physical product to hand over');
    expect(block).toContain('| Conversation (`mic-only`, `product-sample`, `concept-challenge`) | Interviewer and one person |');
    expect(block).toContain('A script and prompt preview only, no finished video yet');
    expect(block).toContain('**Without a shell** (a chat host), decide from this table. Do not fetch the renderer');
  });

  it('runs the selector with a shell, with a brief it accepts, and reads its status, not its exit code', () => {
    expect(block).toContain('catalog_fetch { type: "skill", slug: "render-street-interview" }');
    expect(block).toContain(
      'python3 /tmp/gooseworks-scripts/render-street-interview/scripts/prepare_script_context.py --brief <brief.json> --out <context.json>',
    );
    expect(block).toContain('`references/street-reference-library.json`');
    expect(block).toContain('makes no paid call');
    // The selector's own accepted values (prepare_script_context.py).
    expect(block).toContain('`product-guess` with `product-guess`, or `conversation` with `mic-only`, `product-sample` or `concept-challenge`');
    expect(block).toContain('`offering_type` is exactly `physical`, `service` or `digital` (software, SaaS and apps are `digital`)');
    expect(block).toContain('`participants` is a whole number: people interviewed on screen, not counting the interviewer');
    // Exit 2 is every status but ready-for-writing; brief gaps hide route gaps.
    expect(block).toContain('Read `status` and `brief_gaps` in the output file, not the exit code');
    expect(block).toContain('A run with any `brief_gaps` has not checked the route.');
  });

  it('stops on an unsupported setup, says so plainly and offers the alternatives', () => {
    expect(block).toContain('**An unsupported setup is a stop.**');
    expect(block).toContain("isn't something we can make yet: that version takes one person, and the three-person version needs a physical product to hand over.");
    expect(block).toContain('Then offer the alternatives in plain words, each with how it differs');
    expect(block).toContain('Never use route names or the script\'s wording.');
    expect(block).toContain('Do not create the project or write a script for it.');
    expect(block).toContain('Go custom only if the customer picks it');
    expect(block).toContain('A preview-only route makes a script and prompt preview, not a finished video');
  });

  it('never reads a suggested row as a match for the setup the customer named', () => {
    const picker = flat(video.slice(video.indexOf('### 3. Show the picker'), video.indexOf('### 4. Check this machine')));
    expect(picker).toContain('`suggested` ranks a row for the brand; it never means the row makes the setup they named.');
    expect(picker).toContain('A street interview still needs the route check above first.');
  });
});
