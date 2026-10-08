/**
 * The skill lint (GV-43, with the rulebook's lint rules). Each problem starts
 * with the rule it breaks:
 *
 *   action.real_names_only  a snake_case name that is not one of the contract's actions
 *   money.credits_only      a currency sign, or a currency word outside a "never" sentence
 *   setup.no_install        an install command, or a sentence asking for an install
 *   GV-43 recipe            a video recipe slug
 *   GV-43 render atom       a render-<format> atom
 *   author.size_limits      longer than the skill's limit
 *
 * Fixtures: tests/fixtures/action-names.json and video-recipe-slugs.json.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const fixture = <T>(name: string): T => JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8')) as T;

export const ACTION_NAMES: readonly string[] = fixture<{ actions: string[] }>('action-names.json').actions;
export const RECIPE_SLUGS: readonly string[] = fixture<{ recipes: string[] }>('video-recipe-slugs.json').recipes;

/** Answer fields a skill may name besides actions (the action contract's answer shape). */
export const ANSWER_FIELDS: readonly string[] = ['next_step', 'display_hint'];

/** author.size_limits: an entry skill is at most 3,000 characters. */
export const ENTRY_SKILL_MAX_CHARS = 3000;
/**
 * The `gooseworks` router also carries the terminal data commands the
 * research and lead skills rely on, so it has its own, larger budget. Taking
 * it to 3,000 means moving those commands into the skills that use them.
 */
export const ROUTER_MAX_CHARS = 6500;

const SNAKE_NAME = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi;
const SERVER_PREFIX = /\bmcp__[a-z0-9_-]+?__/gi;
const CURRENCY_SIGN = /\p{Sc}/u;
const CURRENCY_WORD = /\b(?:usd|dollars?|cents?|eur|euros?|gbp)\b/i;
// An install request: "install", "installs", "installing", "installation"; not "installed".
const INSTALL_WORD = /\binstall(?:s|ing|ation)?\b/i;
const INSTALL_COMMANDS = [
  /\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add|ci)\b/i,
  /\bnpx\b/i,
  /\b(?:brew|apt|apt-get|pip3?|gem|cargo)\s+install\b/i,
  /\b(?:curl|wget)\b[^\n]*\|\s*(?:ba|z)?sh\b/i,
  /\bgooseworks\s+(?:install|update)\b/i,
];
const NEGATION = /\b(?:never|not|no|cannot|without)\b|n't\b/i;
const KEBAB = /(?<![a-z0-9-])[a-z0-9]+(?:-[a-z0-9]+)+(?![a-z0-9-])/g;
const RENDER_ATOM = /(?<![a-z0-9-])render-[a-z0-9]+(?:-[a-z0-9]+)*/g;

export interface LintOptions {
  actions?: readonly string[];
  recipes?: readonly string[];
  maxChars?: number;
}

export function lintSkill(text: string, options: LintOptions = {}): string[] {
  const actions = new Set([...(options.actions ?? ACTION_NAMES), ...ANSWER_FIELDS]);
  const recipes = new Set(options.recipes ?? RECIPE_SLUGS);
  const maxChars = options.maxChars ?? ENTRY_SKILL_MAX_CHARS;
  const problems: string[] = [];

  for (const [name] of text.replace(SERVER_PREFIX, '').matchAll(SNAKE_NAME)) {
    if (!actions.has(name.toLowerCase())) problems.push(`action.real_names_only: ${name} is not an action`);
  }

  const sign = CURRENCY_SIGN.exec(text);
  if (sign) problems.push(`money.credits_only: a currency sign (${sign[0]})`);
  const sentences = text.split(/[.!?\n]/);
  for (const sentence of sentences) {
    const word = CURRENCY_WORD.exec(sentence);
    if (word && !NEGATION.test(sentence)) problems.push(`money.credits_only: a currency word (${word[0]})`);
  }

  for (const command of INSTALL_COMMANDS) {
    const found = command.exec(text);
    if (found) problems.push(`setup.no_install: an install command (${found[0]})`);
  }
  for (const sentence of sentences) {
    if (INSTALL_WORD.test(sentence) && !NEGATION.test(sentence)) {
      problems.push(`setup.no_install: asks for an install (${sentence.trim()})`);
    }
  }

  for (const [slug] of text.matchAll(KEBAB)) {
    if (recipes.has(slug)) problems.push(`GV-43 recipe: names the video recipe ${slug}`);
  }
  for (const [atom] of text.matchAll(RENDER_ATOM)) problems.push(`GV-43 render atom: names ${atom}`);

  if (text.length > maxChars) problems.push(`author.size_limits: ${text.length} characters, over ${maxChars}`);
  return problems;
}
