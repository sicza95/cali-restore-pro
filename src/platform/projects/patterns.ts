import { assertID } from '../vault/file-format';
import type { LocalVault } from '../vault/vault';

export const kinds = ['lines', 'dots', 'grid', 'hatch', 'shapes', 'motif', 'custom'] as const;
export const bounds = { spacing: [8, 64], angle: [0, 180], size: [2, 24], weight: [1, 6] } as const;
export type Tile = {
  kind: (typeof kinds)[number];
  spacing: number;
  angle: number;
  size: number;
  weight: number;
  color: string;
  motif: string;
  points?: [number, number][];
};
export const defaults: Tile = {
  kind: 'lines',
  spacing: 24,
  angle: 30,
  size: 7,
  weight: 2,
  color: '#316783',
  motif: '',
};
export type PatternVersion = { id: string; name: string; version: number; tile: Tile };

export function validTile(tile: Tile) {
  return (
    kinds.includes(tile.kind) &&
    Object.entries(bounds).every(([key, [min, max]]) => {
      const number = tile[key as keyof typeof bounds];
      return (
        typeof number === 'number' && Number.isFinite(number) && number >= min && number <= max
      );
    }) &&
    /^#[a-f0-9]{6}$/i.test(tile.color) &&
    typeof tile.motif === 'string' &&
    tile.motif.length <= 3 &&
    (tile.kind !== 'motif' || !!tile.motif.trim()) &&
    (tile.kind !== 'custom' ||
      (Array.isArray(tile.points) &&
        tile.points.length >= 2 &&
        tile.points.length <= 128 &&
        tile.points.every(
          (point) =>
            Array.isArray(point) &&
            point.length === 2 &&
            point.every((n) => Number.isFinite(n) && n >= 0 && n <= 1),
        )))
  );
}

export function assertPattern(pattern: PatternVersion) {
  assertID(pattern.id);
  if (
    !pattern.name.trim() ||
    pattern.name.length > 80 ||
    !Number.isSafeInteger(pattern.version) ||
    pattern.version < 1 ||
    !validTile(pattern.tile)
  )
    throw new Error('Invalid pattern version');
}

export function patternLibrary(vault: LocalVault) {
  const documents = vault.patterns();
  const catalog = '00000000-0000-4000-8000-000000000001';
  async function load() {
    const stored = await documents.changed(catalog, 0);
    const rows = stored ? (JSON.parse(stored.text) as PatternVersion[]) : [];
    if (!Array.isArray(rows) || rows.length !== (stored?.revision ?? 0) || rows.length > 256)
      throw new Error('Invalid pattern catalog');
    rows.forEach(assertPattern);
    return rows;
  }
  async function list() {
    return (await load()).sort((a, b) => a.name.localeCompare(b.name) || a.version - b.version);
  }
  async function save(name: string, tile: Tile) {
    const rows = await load();
    name = name.trim();
    const previous = rows.filter((row) => row.name === name).at(-1);
    const cleanTile = { ...tile, points: tile.kind === 'custom' ? tile.points : undefined };
    const next = {
      id: previous?.id ?? crypto.randomUUID(),
      name,
      version: (previous?.version ?? 0) + 1,
      tile: cleanTile,
    };
    assertPattern(next);
    if (rows.length >= 256) throw new Error('Pattern library is full');
    await documents.save(catalog, rows.length, JSON.stringify([...rows, next]));
    return next;
  }
  return { list, save };
}

export const patternKey = ({ id, version }: PatternVersion) => id + '/' + version;
