/**
 * The skill lint (GV-43, with the rulebook's lint rules). Each problem starts
 * with the rule it breaks:
 *
 *   action.real_names_only  a snake_case name that is not one of the contract's actions
 *   money.credits_only      a currency sign, or a currency word not under a bound negation
 *   setup.no_install        an install command, or an install request not under a bound negation
 *   GV-43 recipe            a video recipe slug
 *   GV-43 render atom       a render-<format> atom
 *   author.size_limits      longer than the skill's limit
 *
 * Each check reads the text as written, as rendered (HTML entities and
 * Markdown escapes decoded) and NFKC-folded, so &#36;8 or a fullwidth npm is
 * caught too.
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
const CURRENCY_WORDS = new Set(['usd', 'dollar', 'dollars', 'cent', 'cents', 'eur', 'euro', 'euros', 'gbp']);
// An install request: "install", "installs", "installing", "installation"; not "installed".
const INSTALL_WORDS = new Set(['install', 'installs', 'installing', 'installation']);
const INSTALL_COMMANDS = [
  /\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add|ci)\b/i,
  /\bnpx\b/i,
  /\b(?:brew|apt|apt-get|pip3?|gem|cargo)\s+install\b/i,
  /\b(?:curl|wget)\b[^\n]*\|\s*(?:ba|z)?sh\b/i,
  /\bgooseworks\s+(?:install|update)\b/i,
];
const KEBAB = /(?<![a-z0-9-])[a-z0-9]+(?:-[a-z0-9]+)+(?![a-z0-9-])/g;
const RENDER_ATOM = /(?<![a-z0-9-])render-[a-z0-9]+(?:-[a-z0-9]+)*/g;

const NEGATIONS = new Set(['never', 'not', 'no', 'cannot', 'without', 'nor']);
const isNegation = (word: string) => NEGATIONS.has(word) || word.endsWith("n't");
/**
 * Words that may stand between a negation and the phrase it governs, as in
 * "never ask for a CLI, a slash command, another app or an install" or
 * "never ask the customer to install anything". Any other word ends the
 * negation, so "No discount: pay 8 dollars" is not a negated price.
 */
const BRIDGE = new Set([
  'ask', 'asks', 'asking', 'tell', 'say', 'mention', 'use', 'need', 'needs', 'require', 'requires',
  'for', 'to', 'a', 'an', 'the', 'any', 'anything', 'ever', 'or', 'and', 'them', 'you', 'your',
  'customer', 'customers', 'user', 'users', 'another', 'other', 'app', 'apps', 'cli', 'slash', 'command', 'commands',
  'must', 'should', 'can', 'will', 'do', 'does', 'be',
]);
const MAX_BRIDGE = 12;

/** Whether the word at `index` sits under a negation bound to it. */
function negated(words: string[], index: number): boolean {
  for (let i = index - 1; i >= 0 && index - i <= MAX_BRIDGE + 1; i--) {
    if (isNegation(words[i])) return true;
    if (!BRIDGE.has(words[i])) return false;
  }
  return false;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', dollar: '$', lowbar: '_', hyphen: '-', dash: '-',
  euro: '€', pound: '£', cent: '¢', yen: '¥', colon: ':', period: '.', comma: ',', excl: '!', quest: '?', vert: '|',
};

/** What a reader sees: HTML entities and Markdown escapes decoded. */
function rendered(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\\([!-/:-@[-`{-~])/g, '$1');
}

/** The text as written, as rendered, and rendered then NFKC-folded with invisible characters removed. */
function views(text: string): string[] {
  const shown = rendered(text);
  const folded = shown.normalize('NFKC').replace(/[​-‍⁠﻿­]/g, '');
  return [...new Set([text, shown, folded])];
}

export interface LintOptions {
  actions?: readonly string[];
  recipes?: readonly string[];
  maxChars?: number;
}

function lintView(text: string, actions: Set<string>, recipes: Set<string>): string[] {
  const problems: string[] = [];
  for (const [name] of text.replace(SERVER_PREFIX, '').matchAll(SNAKE_NAME)) {
    if (!actions.has(name.toLowerCase())) problems.push(`action.real_names_only: ${name} is not an action`);
  }

  const sign = CURRENCY_SIGN.exec(text);
  if (sign) problems.push(`money.credits_only: a currency sign (${sign[0]})`);
  for (const command of INSTALL_COMMANDS) {
    const found = command.exec(text);
    if (found) problems.push(`setup.no_install: an install command (${found[0]})`);
  }
  for (const sentence of text.split(/[.!?\n]/)) {
    const words = sentence.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
    words.forEach((word, index) => {
      if (CURRENCY_WORDS.has(word) && !negated(words, index)) problems.push(`money.credits_only: a currency word (${word})`);
      if (INSTALL_WORDS.has(word) && !negated(words, index)) problems.push(`setup.no_install: asks for an install (${sentence.trim()})`);
    });
  }

  for (const [slug] of text.toLowerCase().matchAll(KEBAB)) {
    if (recipes.has(slug)) problems.push(`GV-43 recipe: names the video recipe ${slug}`);
  }
  for (const [atom] of text.toLowerCase().matchAll(RENDER_ATOM)) problems.push(`GV-43 render atom: names ${atom}`);
  return problems;
}

export function lintSkill(text: string, options: LintOptions = {}): string[] {
  const actions = new Set([...(options.actions ?? ACTION_NAMES), ...ANSWER_FIELDS]);
  const recipes = new Set(options.recipes ?? RECIPE_SLUGS);
  const maxChars = options.maxChars ?? ENTRY_SKILL_MAX_CHARS;
  const problems = new Set(views(text).flatMap((view) => lintView(view, actions, recipes)));
  if (text.length > maxChars) problems.add(`author.size_limits: ${text.length} characters, over ${maxChars}`);
  return [...problems];
}
