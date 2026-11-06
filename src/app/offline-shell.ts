import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

export function offlineShell(): Plugin {
  return {
    name: 'offline-originals-shell',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const index = bundle['index.html'];
        if (index?.type !== 'asset') this.error('Missing offline app shell');
        const worker = readFileSync(new URL('./offline-worker.js', import.meta.url), 'utf8');
        const hash = createHash('sha256').update(index.source).update(worker);
        const assets = Object.keys(bundle).filter((file) => file.startsWith('assets/'));
        for (const file of assets) hash.update(file);
        const version = hash.digest('hex');
        const shell = 'assets/offline-shell-' + version + '.html';
        this.emitFile({ type: 'asset', fileName: shell, source: index.source });
        this.emitFile({
          type: 'asset',
          fileName: 'offline-worker.js',
          source:
            worker +
            '\nstart(' +
            JSON.stringify(version) +
            ', ' +
            JSON.stringify('/' + shell) +
            ', ' +
            JSON.stringify(assets.map((file) => '/' + file)) +
            ');\n',
        });
      },
    },
  };
}
