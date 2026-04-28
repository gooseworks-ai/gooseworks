import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ManifestMissingFileError,
  ManifestParseError,
  readManifestFile,
  resolveExampleFiles,
  validateFormatManifest,
  validateStyleManifest,
} from '../../src/lib/graphics-manifest';

function validStyle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Desert Sunset',
    slug: 'desert-sunset',
    description: 'Warm dusk gradients with rust and amber on cream paper.',
    designMd: '# Desert Sunset\n\nA full slim spec at least fifty characters long for sure.',
    moodGroup: 'Organic & Warm',
    tags: ['warm', 'desert'],
    palette: [{ hex: '#E06A2C', role: 'primary' }],
    examples: [
      { format: 'poster', isHero: true, file: './poster.png' },
    ],
    ...overrides,
  };
}

function validFormat(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'LinkedIn Banner',
    slug: 'linkedin-banner',
    description: '1584×396 LinkedIn profile background. Single horizontal banner with minimal text.',
    width: 1584,
    height: 396,
    contentRulesMd:
      '## Rules\n\n- Title: 4 words max\n- Optional logo lower-right\n- Background must be abstract',
    tags: ['linkedin'],
    examples: [{ file: './example-1.png', styleSlug: 'matt-gray' }],
    ...overrides,
  };
}

describe('validateStyleManifest', () => {
  it('accepts a valid manifest', () => {
    const result = validateStyleManifest(validStyle());
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('rejects missing name', () => {
    const result = validateStyleManifest(validStyle({ name: undefined }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('name');
  });

  it('rejects too-short description', () => {
    const result = validateStyleManifest(validStyle({ description: 'short' }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('description');
  });

  it('rejects too-short designMd', () => {
    const result = validateStyleManifest(validStyle({ designMd: 'too short' }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('designMd');
  });

  it('rejects bad slug', () => {
    const result = validateStyleManifest(validStyle({ slug: 'Bad Slug' }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('slug');
  });

  it('rejects unknown moodGroup', () => {
    const result = validateStyleManifest(validStyle({ moodGroup: 'Spicy' }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('moodGroup');
  });

  it('rejects malformed palette hex', () => {
    const result = validateStyleManifest(
      validStyle({ palette: [{ hex: '#abc', role: 'primary' }] })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('hex');
  });

  it('rejects examples with no hero', () => {
    const result = validateStyleManifest(
      validStyle({
        examples: [
          { format: 'poster', file: './poster.png' },
        ],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('isHero');
  });

  it('rejects examples with multiple heros', () => {
    const result = validateStyleManifest(
      validStyle({
        examples: [
          { format: 'poster', isHero: true, file: './a.png' },
          { format: 'carousel', isHero: true, file: './b.png' },
        ],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('isHero');
  });

  it('rejects empty examples', () => {
    const result = validateStyleManifest(validStyle({ examples: [] }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('examples');
  });

  it('rejects caption too long', () => {
    const result = validateStyleManifest(
      validStyle({
        examples: [
          { format: 'poster', isHero: true, file: './a.png', caption: 'x'.repeat(281) },
        ],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('caption');
  });

  it('allows a manifest without an explicit slug', () => {
    const m = validStyle();
    delete (m as { slug?: unknown }).slug;
    expect(validateStyleManifest(m)).toEqual({ ok: true, errors: [] });
  });
});

describe('validateFormatManifest', () => {
  it('accepts a valid format', () => {
    const result = validateFormatManifest(validFormat());
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('rejects width outside range', () => {
    expect(validateFormatManifest(validFormat({ width: 32 })).ok).toBe(false);
    expect(validateFormatManifest(validFormat({ width: 9000 })).ok).toBe(false);
    expect(validateFormatManifest(validFormat({ width: 1.5 })).ok).toBe(false);
  });

  it('rejects missing contentRulesMd', () => {
    const result = validateFormatManifest(validFormat({ contentRulesMd: 'short' }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('contentRulesMd');
  });

  it('rejects empty examples', () => {
    const result = validateFormatManifest(validFormat({ examples: [] }));
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('examples');
  });
});

describe('readManifestFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-manifest-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses a valid file', () => {
    const file = path.join(tmpDir, 'gooseworks-style.json');
    fs.writeFileSync(file, JSON.stringify(validStyle()));
    expect(readManifestFile(file)).toMatchObject({ name: 'Desert Sunset' });
  });

  it('throws ManifestParseError on missing file', () => {
    expect(() => readManifestFile(path.join(tmpDir, 'missing.json'))).toThrow(
      ManifestParseError
    );
  });

  it('throws ManifestParseError on bad JSON', () => {
    const file = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(file, '{not json');
    expect(() => readManifestFile(file)).toThrow(ManifestParseError);
  });
});

describe('resolveExampleFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-resolve-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves files and strips ./', () => {
    fs.writeFileSync(path.join(tmpDir, 'poster.png'), 'fake');
    const resolved = resolveExampleFiles(tmpDir, [{ file: './poster.png' }]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].fieldName).toBe('poster.png');
    expect(resolved[0].absolutePath).toBe(path.join(tmpDir, 'poster.png'));
  });

  it('throws on missing file', () => {
    expect(() =>
      resolveExampleFiles(tmpDir, [{ file: './nope.png' }])
    ).toThrow(ManifestMissingFileError);
  });
});
