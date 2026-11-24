import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Colours the UI paints come from tokens.css (both themes). See docs/plan/colour-tokens.md.
const src = fileURLToPath(new URL('../', import.meta.url));
const roots = ['ui', 'stories'].map((dir) => path.join(src, dir));

/**
 * Literal colours that are data, not styling: saved into documents or preferences, and changed
 * by the user. `src/platform` (exported files) is not scanned at all.
 */
const exceptions: Record<string, string> = {
  'ui/tokens.css': 'the tokens themselves',
  'ui/editor/drawing-review/constants.ts': 'default colour of a new layer, saved in the drawing',
  'ui/settings/preferences/utils.ts': 'default report accent preference',
  'ui/reports/useReport.ts': 'fallback report accent for an invalid saved preference',
  'ui/account/profile-fields/photo.ts': 'background behind a transparent photo, saved in the JPEG',
  'ui/colour-literals.test.ts': 'this test',
};

const literal = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i;

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) files(file, out);
    else if (/\.(css|tsx?)$/.test(name)) out.push(file);
  }
  return out;
}

describe('colour literals', () => {
  it('appear only in tokens.css and documented data defaults', () => {
    const found = roots
      .flatMap((root) => files(root))
      .flatMap((file) => {
        const name = path.relative(src, file).split(path.sep).join('/');
        if (name in exceptions) return [];
        return readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            literal.test(line.replace(/url\([^)]*\)/g, ''))
              ? [`${name}:${index + 1}: ${line.trim()}`]
              : [],
          );
      });
    expect(found).toEqual([]);
  });
});
