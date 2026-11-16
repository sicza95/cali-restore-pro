import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Buttons are secondary by default; class="primary" marks a view's one main action. See
// docs/plan/styled-controls.md. A secondary class would do nothing, so it stays out (#40).
const src = fileURLToPath(new URL('../', import.meta.url));
const roots = ['ui', 'stories'].map((dir) => path.join(src, dir));

const markup = /\bclass="[^"]*\bsecondary\b/;
const selector = /\.secondary\b/;

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) files(file, out);
    else if (/\.(css|tsx?)$/.test(name)) out.push(file);
  }
  return out;
}

describe('button classes', () => {
  it('never mark a button secondary', () => {
    const found = roots
      .flatMap((root) => files(root))
      .flatMap((file) => {
        const name = path.relative(src, file).split(path.sep).join('/');
        if (name === 'ui/button-classes.test.ts') return [];
        const pattern = file.endsWith('.css') ? selector : markup;
        return readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            pattern.test(line) ? [`${name}:${index + 1}: ${line.trim()}`] : [],
          );
      });
    expect(found).toEqual([]);
  });
});
