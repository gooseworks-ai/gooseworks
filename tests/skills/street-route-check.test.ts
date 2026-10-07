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
    expect(block).toContain('finished video or preview only, and no person photos');
  });

  it('gives a chat host the routes as a table, and never the oversized package', () => {
    // The selector's two routes and its limits: four people need a physical
    // product; conversation takes one person and is a preview only.
    expect(block).toContain('| Guessing (`product-guess`) | Interviewer and up to four people | A physical product to hand over');
    expect(block).toContain('| Conversation (`mic-only`, `product-sample`, `concept-challenge`) | Interviewer and one person |');
    expect(block).toContain('A script and prompt preview only, no finished video yet');
    expect(block).toContain('**Without a shell** (a chat host), decide from this table. Do not fetch the renderer');
    // Neither interview route takes a person photo; the setup is never bent to pass.
    expect(block).toContain('Neither interview route takes a photo of a person: people are described in text');
    expect(block).toContain('never change the interaction, mode or number of people just to make a check pass');
  });

  it('runs the selector with a shell, with a brief it accepts, and reads its status, not its exit code', () => {
    expect(block).toContain('catalog_fetch { type: "skill", slug: "render-street-interview", delivery: "archive" }');
    expect(block).toContain(
      'python3 /tmp/gooseworks-scripts/render-street-interview/scripts/prepare_script_context.py --brief <brief.json> --out <context.json>',
    );
    expect(block).toContain('`references/street-reference-library.json`');
    // The inline package is over a million characters: fetch to a file.
    expect(block).toContain('Fetch the renderer to a file, not into the conversation');
    expect(block).toContain('`gooseworks fetch render-street-interview > <file.json>`');
    expect(block).toContain('delivery: "archive"');
    // The archive keeps the skill under agent-config/skills/<slug>/.
    expect(block).toContain('check each file against its `manifest.json` hashes and copy the contents of its `agent-config/skills/render-street-interview/` folder into');
    expect(block).toContain('If the fetch or the run fails, decide from the table.');
    expect(block).toContain('makes no paid call');
    // The selector's own accepted values (prepare_script_context.py).
    expect(block).toContain('`product-guess` with `product-guess`, or `conversation` with `mic-only`, `product-sample` or `concept-challenge`');
    expect(block).toContain('`offering_type` is exactly `physical`, `service` or `digital` (software, SaaS and apps are `digital`)');
    expect(block).toContain('`participants` is a whole number: people interviewed on screen, not counting the interviewer');
    expect(block).toContain('Leave it out when the customer named no count');
    // Exit 2 is every status but ready-for-writing; brief gaps hide route gaps.
    expect(block).toContain('Read `status` and `brief_gaps` in the output file, not the exit code');
    expect(block).toContain('A run with any `brief_gaps` has not checked the route.');
    expect(block).toContain('A Python traceback is not a verdict: the brief or the saved files are wrong');
  });

  it('stops on an unsupported setup, says so plainly and offers the alternatives', () => {
    expect(block).toContain('**An unsupported setup is a stop.**');
    expect(block).toContain("isn't something we can make yet: that version takes one person, and the three-person version needs a physical product to hand over.");
    expect(block).toContain('Then offer the closest supported options in plain words, each with how it differs.');
    // With a shell the selector decides them; without one, the table, never
    // a fixed list (a five-person guessing request gets four people, not one).
    expect(block).toContain("With a shell, these are the selector's `alternatives`. Without one, take them from the table:");
    expect(block).toContain('- when only the number of people was the problem, the same setup within its limit: guessing (a physical product only) with up to four people, a finished video; or a conversation with one person, a script preview only;');
    expect(block).toContain("- for something people can't hold (software, a service), a one-person conversation instead of guessing;");
    expect(block).toContain('- a custom video, untested, that keeps the street format\'s limits.');
    expect(block).toContain('Never use route names or the script\'s wording.');
    expect(block).toContain('Do not create the project or write a script for it.');
    expect(block).toContain('Go custom only if the customer picks it');
    expect(block).toContain('A preview-only route makes a script and prompt preview, not a finished video');
  });

  // T-STR-3 re-run: an agent floated the guessing format for software with a
  // laptop or phone as the prop.
  it('never offers guessing to a software or service brand, not even with a device as the prop', () => {
    expect(block).toContain('**Never offer guessing to software or a service.**');
    expect(block).toContain(
      'When what the brand sells is software, an app or a service (nothing a person can hold), never offer or script guessing, not even with a laptop, phone or other device showing the app as the prop',
    );
    expect(block).toContain('the device is a prop, so `offering_type` stays `digital` or `service`');
    // A device or hardware brand sells a physical product: guessing stays open.
    expect(block).toContain(
      'A brand that sells a physical product, including a device or hardware that comes with an app, can still use guessing with that product.',
    );
    expect(block).toContain(
      'a one-person conversation (a script and prompt preview only, no finished video yet)',
    );
    expect(block).toContain('the street testimonial if the catalog lists it and does not rule it out, or custom.');
    expect(block).toContain('Asking again never unlocks a route the table or the selector rules out.');
  });

  it("reads the catalog's fit.ok false on a street row as no finished video, not as no conversation", () => {
    expect(block).toContain(
      'When they asked for a street interview, the catalog may mark (newer servers do) the street-interview rows `fit.ok: false` for such a brand: they can\'t make a finished video for it.',
    );
    expect(block).toContain(
      'so still offer the one-person conversation, saying plainly that it is a script and prompt preview only.',
    );
    // A device brand whose kit reads as software: confirm before overriding the catalog.
    expect(block).toContain(
      'tell the customer the catalog flagged it and confirm what they sell before offering guessing with that device.',
    );
    const picker = flat(video.slice(video.indexOf('### 3. Show the picker'), video.indexOf('### 4. Check this machine')));
    expect(picker).toContain(
      'A row with `fit.ok: false` is ruled out for this brand. Never propose it unless the customer, after hearing why, still asks for it.',
    );
    // Insisting is not a way around the street route check (review round 4).
    expect(picker).toContain(
      'For a street interview, insisting never unlocks a route the route check rules out; when they asked for one, the one-person conversation preview is the one exception (see the route check).',
    );
  });

  it('never reads a suggested row as a match for the setup the customer named', () => {
    const picker = flat(video.slice(video.indexOf('### 3. Show the picker'), video.indexOf('### 4. Check this machine')));
    expect(picker).toContain('`suggested` ranks a row for the brand; it never means the row makes the setup they named.');
    expect(picker).toContain('A street interview still needs the route check above first.');
  });
});
