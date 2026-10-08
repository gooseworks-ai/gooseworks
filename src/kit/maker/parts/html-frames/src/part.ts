// The html-frames part (render_html): the web video maker, published to
// goose-skills as parts/html-frames/<version>/part.mjs. Built from this file by
// scripts/build-kit-parts.ts; the core loads the built file, never this one.
import type { PartRun } from '../../../../part-interface';
import { makeVideo } from '../../../make';

export const run: PartRun = async (inputs, ctx) => {
  const made = await makeVideo(inputs, ctx);
  return { video: made.video, seconds: made.seconds, timeline: made.timeline };
};
