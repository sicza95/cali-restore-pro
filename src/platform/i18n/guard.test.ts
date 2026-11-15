import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = fileURLToPath(new URL('../../', import.meta.url));
const i18n = path.join(src, 'platform', 'i18n');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) {
      if (file !== i18n) sources(file, out);
    } else if (/\.tsx?$/.test(name) && !name.endsWith('.gen.ts')) out.push(file);
  }
  return out;
}

const files = sources(src).map((file) => ({
  file: path.relative(src, file).split(path.sep).join('/'),
  text: readFileSync(file, 'utf8'),
}));
const isCopyModule = (file: string) => /(^|\/)(copy|[\w-]+-copy)\.ts$/.test(file);

/** Lines of `text` that match `pattern`, as `file:line`. */
function hits(pattern: RegExp, keep: (file: string) => boolean) {
  return files
    .filter(({ file }) => keep(file))
    .flatMap(({ file, text }) =>
      text
        .split('\n')
        .flatMap((line, index) => (pattern.test(line) ? [`${file}:${index + 1}`] : [])),
    );
}

describe('where copy lives', () => {
  it('declares catalogues only in copy modules', () => {
    expect(hits(/\bdefineCopy(Pairs)?[<(]/, (file) => !isCopyModule(file))).toEqual([]);
  });

  it('keeps no EN/HU objects outside copy modules', () => {
    expect(hits(/^\s*hu: [{[]/, (file) => !isCopyModule(file))).toEqual([]);
  });

  it('makes every copy module declare a catalogue', () => {
    const empty = files
      .filter(({ file, text }) => isCopyModule(file) && !/\bdefineCopy(Pairs)?[<(]/.test(text))
      .map(({ file }) => file);
    expect(empty).toEqual([]);
  });

  it('never picks a language inline in the UI', () => {
    expect(
      hits(/(===|!==)\s*'(en|hu)'|'(en|hu)'\s*(===|!==)/, (file) => file.startsWith('ui/')),
    ).toEqual([]);
  });
});
