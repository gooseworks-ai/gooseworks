// Binding a step's inputs (style-file.md "The timeline and parts"): a plain
// value, or a reference the core resolves before the step runs:
//   { from: "plan.<field>" }   { from: "brand.<field>" }
//   { from: "step.<id>.<output>" } (an earlier step)   { asset: "<path>" }
// An object whose only key is `from` or `asset` is always a reference.
import type { FileRef } from '../part-interface';
import { KitStop } from './errors';

export interface BindScope {
  plan: unknown;
  brand: unknown;
  /** Outputs of the steps that already ran, by step id. */
  steps: Map<string, Record<string, unknown>>;
  assets: Map<string, FileRef>;
}

function refuse(message: string): never {
  throw new KitStop(message, 'change_request');
}

function isReference(value: unknown): value is { from: string } | { asset: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && (keys[0] === 'from' || keys[0] === 'asset') && typeof (value as Record<string, unknown>)[keys[0]] === 'string';
}

function walk(root: unknown, segments: string[]): unknown {
  let node = root;
  for (const segment of segments) {
    if (node === null || node === undefined) return undefined;
    if (Array.isArray(node)) {
      if (!/^\d+$/.test(segment)) return undefined;
      node = node[Number(segment)];
    } else if (typeof node === 'object') {
      node = Object.prototype.hasOwnProperty.call(node, segment) ? (node as Record<string, unknown>)[segment] : undefined;
    } else return undefined;
  }
  return node;
}

function resolveFrom(from: string, scope: BindScope, stepId: string): unknown {
  const [head, ...rest] = from.split('.');
  if (head === 'plan') return walk(scope.plan, rest);
  if (head === 'brand') return walk(scope.brand, rest);
  if (head === 'step') {
    const [source, ...field] = rest;
    if (!source || !scope.steps.has(source)) refuse(`The style’s step ${stepId} reads from ${source ?? 'a step'}, which has not run before it.`);
    return walk(scope.steps.get(source), field);
  }
  return refuse(`The style’s step ${stepId} reads from "${from}", which the kit doesn't know.`);
}

export function bindValue(value: unknown, scope: BindScope, stepId: string): unknown {
  if (isReference(value)) {
    if ('asset' in value) {
      const ref = scope.assets.get(value.asset);
      if (!ref) refuse(`The style’s step ${stepId} names ${value.asset}, which its package doesn't carry.`);
      return ref;
    }
    return resolveFrom(value.from, scope, stepId);
  }
  if (Array.isArray(value)) return value.map((item) => bindValue(item, scope, stepId));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const bound = bindValue(v, scope, stepId);
      if (bound !== undefined) out[k] = bound;
    }
    return out;
  }
  return value;
}

/** A step's inputs with every reference resolved; a reference to nothing is left out. */
export function bindInputs(inputs: Record<string, unknown> | undefined, scope: BindScope, stepId: string): Record<string, unknown> {
  return bindValue(inputs ?? {}, scope, stepId) as Record<string, unknown>;
}
