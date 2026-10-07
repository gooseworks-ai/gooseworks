import { getGooseVideoSkillContent } from '../../src/skills/master-skill';

// Self-QA T-STR-3 (GOOSE-3909 street route, 7 Oct 2026): a SaaS brand asked
// goose-video for a three-person, mic-only street interview. The catalog
// marked the physical-product street format "suggested", and the agent called
// it "exactly the three-person version you want", wrote a product-guess
// concept for software and tried to create the project. It never ran the
// street renderer's route selector, which rejects both readings. These checks
// keep that selector ahead of any proposal or project. They prove the
// instruction is there and in order, not that an agent follows it.
const SECTION = "## Run the format's route check before proposing it";

describe('goose-video street-interview route check', () => {
  const video = getGooseVideoSkillContent();
  const start = video.indexOf(SECTION);
  const block = video.slice(start, video.indexOf('\n## ', start + SECTION.length));

  it('runs the street selector before proposing or creating a project', () => {
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain('Before you propose, script or create a street-interview project');
    expect(block).toContain('catalog_fetch { type: "skill", slug: "render-street-interview" }');
    expect(block).toContain(
      'python3 /tmp/gooseworks-scripts/render-street-interview/scripts/prepare_script_context.py --brief <brief.json> --out <context.json>',
    );
    // The brief carries what the selector decides on.
    for (const field of ['`mode`', '`offering_type`', '`interaction_type`', '`participants`']) {
      expect(block).toContain(field);
    }
    expect(block).toContain('not counting the\n   interviewer');
    expect(block).toContain('makes no paid call');
    // Before the picker shows and before the project is created.
    expect(start).toBeLessThan(video.indexOf('### 3. Show the picker'));
    expect(start).toBeLessThan(video.indexOf('### 5. Create the project'));
  });

  it('stops on an unsupported route, says so plainly and offers the alternatives', () => {
    expect(block).toContain('**`unsupported-route` is a stop.**');
    expect(block).toContain("isn't supported");
    expect(block).toContain('offer its alternatives, each with how it differs');
    expect(block).toContain('Do not create the\n   project or write a script for it');
    expect(block).toContain('Go custom only if the customer picks it');
    // A route that exists but is preview-only is said up front.
    expect(block).toContain('`preview-only` route makes a script and prompt preview, not a finished video');
    // Without a shell the same contract still applies.
    expect(block).toContain('Without a shell, apply the route table');
  });

  it('never reads a suggested row as a match for the setup the customer named', () => {
    const picker = video.slice(video.indexOf('### 3. Show the picker'), video.indexOf('### 4. Check this machine'));
    expect(picker).toContain('`suggested` ranks a row for the brand; it never means the row makes the setup they named.');
    expect(picker).toContain('A\n  street interview still needs the route check above first.');
  });
});
