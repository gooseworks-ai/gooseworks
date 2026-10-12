import { createHash } from 'crypto';
import { getEntrySkills } from '../../src/skills/master-skill';

// Restore the production workflow exactly, apart from monotonically increasing
// versions. Source: gooseworks-ai/gooseworks @ 841b2a3fd06931e02d331df14db7750f26ae9ebd.
const restored = [
  {
    "name": "goose-video",
    "originalVersion": "3.0.6",
    "brokenVersion": "4.1.0",
    "version": "4.1.1",
    "originalHash": "2489cb811e8726cfd83ee05306fbaeb04ac00e65c0ad0bcbe1cf8c02d02605fa"
  },
  {
    "name": "make-custom-video",
    "originalVersion": "2.3.3",
    "brokenVersion": "3.1.0",
    "version": "3.1.1",
    "originalHash": "0322e3c93d67f3ff7dc11d167d9300bb0489164cb23b5922a49b20cf82ba5a3c"
  },
  {
    "name": "goose-video-local",
    "originalVersion": "0.6.7",
    "brokenVersion": "1.0.0",
    "version": "1.0.1",
    "originalHash": "72709ed2cd983aeb898b1c401fe55330336e9707ee7c62c1ad00a87de3874b53"
  }
];

it.each(restored)('$name restores the compatible production workflow with a newer version', ({ name, originalVersion, brokenVersion, version, originalHash }) => {
  const content = getEntrySkills().find(skill => skill.name === name)!.content;
  expect(content.match(/^version: (.+)$/m)?.[1]).toBe(version);
  const parts = (value: string) => value.split('.').map(Number);
  const previous = parts(brokenVersion);
  const next = parts(version);
  const changedPart = next.findIndex((part, index) => part !== previous[index]);
  expect(changedPart).toBeGreaterThanOrEqual(0);
  expect(next[changedPart]).toBeGreaterThan(previous[changedPart]);
  expect(content).toContain('video_project_read');
  expect(content).not.toMatch(/\b(video_read|video_create|video_change|video_formats)\b/);
  if (name === 'make-custom-video') {
    expect(content).toMatch(/^harness_binding: gooseworks\/v2$/m);
    expect(content).toMatch(/^requires_skills: \[video-production-harness\]$/m);
  }
  const original = content.replace(/^version: .+$/m, `version: ${originalVersion}`);
  expect(createHash('sha256').update(original).digest('hex')).toBe(originalHash);
});
