import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getEntrySkills } from '../../src/skills/master-skill';

// Pin the externally owned public API contract, then validate executable call
// examples in every installed skill. This catches examples that the server
// rejects even when another paragraph describes the correct call elsewhere.
const fixture = JSON.parse(readFileSync(
  join(__dirname, '../fixtures/marketing-brain-capture.json'), 'utf8',
));
const contract = fixture.public_brand_update_contract as {
  default_intent: string;
  correction_only_patches: string[];
  required_correction_arguments: string[];
  raw_patch_fields: string[];
  legacy_mutations_without_correction_arguments: string[];
};

function brandUpdateExamples(content: string): string[] {
  return Array.from(content.matchAll(/`(brand_update\s*\{[^`]*\})`/g), (match) => match[1]);
}

function rawPatchKeys(example: string): string[] | undefined {
  const start = /\bkit_patch\s*:\s*\{/.exec(example);
  if (!start) return undefined;
  const keys: string[] = [];
  let depth = 1;
  let quote = '';
  for (let index = start.index + start[0].length; index < example.length && depth; index += 1) {
    const char = example[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (depth === 1) {
      const key = /^([A-Za-z_]\w*|"[^"]+"|'[^']+')\s*:/.exec(example.slice(index));
      if (key) {
        keys.push(key[1].replace(/^["']|["']$/g, ''));
        index += key[0].length - 1;
        continue;
      }
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') depth -= 1;
  }
  return depth === 0 ? keys : undefined;
}

function contractErrors(example: string): string[] {
  const errors: string[] = [];
  const writesCorrectionOnlyStore = contract.correction_only_patches.some(
    (field) => new RegExp(`\\b${field}\\s*:`).test(example),
  );
  if (writesCorrectionOnlyStore) {
    for (const field of contract.required_correction_arguments) {
      if (!new RegExp(`\\b${field}\\s*:`).test(example)) errors.push(`missing ${field}`);
    }
    if (!/knowledge_intent\s*:\s*"user_correction"/.test(example)) {
      errors.push('correction-only store must use user_correction');
    }
  }
  if (/\bkit_patch\b/.test(example)) {
    const keys = rawPatchKeys(example);
    if (!keys?.length || keys.some((key) => !contract.raw_patch_fields.includes(key))) {
      errors.push('kit_patch must explicitly contain only a supported asset slot');
    }
  }
  return errors;
}

describe('brand capture public call examples', () => {
  it('rejects the old facts example that would default to a refused agent proposal', () => {
    expect(contract.default_intent).toBe('agent_proposal');
    expect(contractErrors('brand_update { brand_id, patch: { facts: [{ kind, text }] } }'))
      .toContain('missing user_statement');
  });

  it('rejects the old raw research patch before finalize_research', () => {
    expect(contractErrors('brand_update { brand_id, patch: { kit_patch, finalize_research: true } }'))
      .toContain('kit_patch must explicitly contain only a supported asset slot');
  });

  it('rejects research fields mixed with video_lab, while allowing only the documented asset slot', () => {
    expect(contractErrors('brand_update { brand_id, patch: { kit_patch: { video_lab: { name: "Acme" }, positioning: "Research" } } }'))
      .toContain('kit_patch must explicitly contain only a supported asset slot');
    expect(contractErrors('brand_update { brand_id, patch: { kit_patch: { video_lab: { name: "Acme" } } } }'))
      .toEqual([]);
  });

  it.each(getEntrySkills())('$name has no brand_update example that violates the public contract', ({ content }) => {
    for (const example of brandUpdateExamples(content)) {
      expect({ example, errors: contractErrors(example) }).toEqual({ example, errors: [] });
    }
  });

  it.each(getEntrySkills())('$name uses canonical mutations that can carry the required correction evidence', ({ content }) => {
    const inlineCode = Array.from(content.matchAll(/`([^`]+)`/g), (match) => match[1]);
    for (const alias of contract.legacy_mutations_without_correction_arguments) {
      expect(inlineCode.some((example) => new RegExp(`\\b${alias}\\b`).test(example))).toBe(false);
    }
  });

  it('covers the stored research finalization flow as a real canonical example', () => {
    const local = getEntrySkills().find((skill) => skill.name === 'goose-video-local')!;
    const examples = brandUpdateExamples(local.content);
    expect(examples.some((example) => /finalize_research\s*:\s*true/.test(example))).toBe(true);
  });
});
