// The html-frames part (render_html): the web video maker, published to
// goose-skills as parts/html-frames/<version>/part.mjs. Built from this file by
// scripts/build-kit-parts.ts; the core loads the built file, never this one.
import type { PartRun } from '../../../../part-interface';
import { makeOrSkip } from '../../../make';

export const run: PartRun = async (inputs, ctx) => {
  const made = await makeOrSkip(inputs, ctx);
  // skip_blank with no text anywhere: no outputs at all.
  if (!made) return {};
  return { video: made.video, seconds: made.seconds, timeline: made.timeline };
};
