// Checks a part's inputs and outputs against its JSON Schema (draft 2020-12),
// for the keywords part manifests use. A keyword the kit can't check is an
// error, never skipped, so a value is never passed as checked when it wasn't.
import { isFileRef } from './canonical';

type Schema = Record<string, unknown>;

/** Words that only describe; they change nothing about what is valid. */
const NOTES = new Set(['$schema', '$id', '$comment', 'title', 'description', 'default', 'examples', 'deprecated', 'readOnly', 'writeOnly', 'format', '$defs', 'definitions', 'contentMediaType']);
const CHECKED = new Set([
  'type', 'enum', 'const', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems',
  'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'anyOf', 'oneOf', 'allOf', 'not', '$ref', 'minProperties', 'maxProperties', 'x-kit-file',
]);

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function typeMatches(value: unknown, type: string): boolean {
  const actual = typeOf(value);
  return actual === type || (type === 'number' && actual === 'integer');
}

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function resolveRef(root: Schema, ref: string): Schema {
  if (!ref.startsWith('#/')) throw new Error(`a schema $ref outside the part (${ref})`);
  let node: unknown = root;
  for (const raw of ref.slice(2).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    node = node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined;
  }
  if (!node || typeof node !== 'object') throw new Error(`a schema $ref that points nowhere (${ref})`);
  return node as Schema;
}

function check(root: Schema, schema: unknown, value: unknown, at: string, errors: string[], depth: number): void {
  if (depth > 64) throw new Error('a schema nested too deeply');
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    errors.push(`${at} is not allowed`);
    return;
  }
  if (!schema || typeof schema !== 'object') throw new Error(`a schema at ${at} that is not an object`);
  const s = schema as Schema;
  for (const key of Object.keys(s)) {
    if (!CHECKED.has(key) && !NOTES.has(key) && !key.startsWith('x-')) throw new Error(`the schema keyword "${key}" at ${at}, which this kit can't check`);
  }
  if (typeof s.$ref === 'string') check(root, resolveRef(root, s.$ref), value, at, errors, depth + 1);
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
    if (!types.some((t) => typeMatches(value, t))) {
      errors.push(`${at} should be ${types.join(' or ')}`);
      return;
    }
  }
  if (s.enum !== undefined && !(s.enum as unknown[]).some((v) => equal(v, value))) errors.push(`${at} is not one of the allowed values`);
  if (s.const !== undefined && !equal(s.const, value)) errors.push(`${at} is not the required value`);
  const file = s['x-kit-file'] as { media?: string; mime?: string[] } | undefined;
  if (file) {
    if (!isFileRef(value)) errors.push(`${at} should be a file`);
    else {
      if (file.media && value.media !== file.media) errors.push(`${at} should be ${file.media}, not ${value.media}`);
      if (file.mime && !file.mime.includes(value.mime)) errors.push(`${at} has the wrong file type (${value.mime})`);
    }
  }
  if (typeof value === 'string') {
    if (typeof s.minLength === 'number' && [...value].length < s.minLength) errors.push(`${at} is too short`);
    if (typeof s.maxLength === 'number' && [...value].length > s.maxLength) errors.push(`${at} is too long`);
    if (typeof s.pattern === 'string' && !new RegExp(s.pattern, 'u').test(value)) errors.push(`${at} does not match its pattern`);
  }
  if (typeof value === 'number') {
    if (typeof s.minimum === 'number' && value < s.minimum) errors.push(`${at} is below ${s.minimum}`);
    if (typeof s.maximum === 'number' && value > s.maximum) errors.push(`${at} is above ${s.maximum}`);
    if (typeof s.exclusiveMinimum === 'number' && value <= s.exclusiveMinimum) errors.push(`${at} must be above ${s.exclusiveMinimum}`);
    if (typeof s.exclusiveMaximum === 'number' && value >= s.exclusiveMaximum) errors.push(`${at} must be below ${s.exclusiveMaximum}`);
    if (typeof s.multipleOf === 'number' && Math.abs(value / s.multipleOf - Math.round(value / s.multipleOf)) > 1e-9) errors.push(`${at} is not a multiple of ${s.multipleOf}`);
  }
  if (Array.isArray(value)) {
    if (typeof s.minItems === 'number' && value.length < s.minItems) errors.push(`${at} has too few items`);
    if (typeof s.maxItems === 'number' && value.length > s.maxItems) errors.push(`${at} has too many items`);
    if (s.uniqueItems === true && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) errors.push(`${at} lists an item twice`);
    if (s.items !== undefined) value.forEach((item, i) => check(root, s.items, item, `${at}[${i}]`, errors, depth + 1));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (typeof s.minProperties === 'number' && keys.length < s.minProperties) errors.push(`${at} has too few fields`);
    if (typeof s.maxProperties === 'number' && keys.length > s.maxProperties) errors.push(`${at} has too many fields`);
    const props = (s.properties ?? {}) as Record<string, unknown>;
    for (const name of (s.required as string[] | undefined) ?? []) if (obj[name] === undefined) errors.push(`${at}.${name} is missing`);
    for (const key of keys) {
      if (obj[key] === undefined) continue;
      if (key in props) check(root, props[key], obj[key], `${at}.${key}`, errors, depth + 1);
      else if (s.additionalProperties === false) errors.push(`${at}.${key} is not a known field`);
      else if (s.additionalProperties !== undefined) check(root, s.additionalProperties, obj[key], `${at}.${key}`, errors, depth + 1);
    }
  }
  const branch = (option: unknown) => {
    const inner: string[] = [];
    check(root, option, value, at, inner, depth + 1);
    return inner.length === 0;
  };
  if (Array.isArray(s.allOf)) for (const option of s.allOf) check(root, option, value, at, errors, depth + 1);
  if (Array.isArray(s.anyOf) && !s.anyOf.some(branch)) errors.push(`${at} matches none of its allowed shapes`);
  if (Array.isArray(s.oneOf) && s.oneOf.filter(branch).length !== 1) errors.push(`${at} must match exactly one allowed shape`);
  if (s.not !== undefined && branch(s.not)) errors.push(`${at} is a shape that is not allowed`);
}

/** The problems with `value` under `schema`, as short sentences; empty when it is valid. */
export function schemaErrors(schema: unknown, value: unknown, at = 'inputs'): string[] {
  const errors: string[] = [];
  check(schema as Schema, schema, value, at, errors, 0);
  return errors.slice(0, 20);
}

/** Throws when a schema uses a keyword this kit can't check, so a part is refused before anything runs. */
export function assertCheckable(schema: unknown, at = 'schema', depth = 0): void {
  if (depth > 64) throw new Error('a schema nested too deeply');
  if (typeof schema === 'boolean') return;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error(`${at} is not a schema`);
  const s = schema as Schema;
  for (const [key, value] of Object.entries(s)) {
    if (key.startsWith('x-') || (NOTES.has(key) && key !== '$defs' && key !== 'definitions')) continue;
    if (!CHECKED.has(key) && key !== '$defs' && key !== 'definitions') throw new Error(`the schema keyword "${key}" at ${at}, which this kit can't check`);
    if (key === 'properties' || key === '$defs' || key === 'definitions') {
      for (const [name, sub] of Object.entries((value ?? {}) as Record<string, unknown>)) assertCheckable(sub, `${at}.${name}`, depth + 1);
    } else if (key === 'items' || key === 'not' || (key === 'additionalProperties' && typeof value === 'object')) {
      assertCheckable(value, `${at}.${key}`, depth + 1);
    } else if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
      (value as unknown[]).forEach((sub, i) => assertCheckable(sub, `${at}.${key}[${i}]`, depth + 1));
    }
  }
}
