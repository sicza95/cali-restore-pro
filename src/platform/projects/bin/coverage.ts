import type { BinCoverage, BinCoverageClass, BinEntityKind } from './types';

/**
 * What each entry must capture to be recoverable.
 * - graph: the entity subtree, including assessments and checkpoints stored on surfaces.
 * - checkpoints: assessment checkpoints (part of the surface record).
 * - journals: saved drawing journals per surface and source photo.
 * - estimates: subtree-scoped estimate draft rows (phases, extras, object rows) for children;
 *   the whole estimate document for a project.
 * - reports: subtree-scoped report selections for children; the whole report draft for a project.
 * - issued: immutable estimate snapshots and report issuance. They stay live for children and are
 *   never rewritten by restore; a project entry retains them with the project.
 * - assets: every referenced photo, cover and logo is present and pinned.
 */
const required: Record<BinEntityKind, readonly BinCoverageClass[]> = {
  surface: ['graph', 'checkpoints', 'journals', 'estimates', 'reports', 'assets'],
  object: ['graph', 'checkpoints', 'journals', 'estimates', 'reports', 'assets'],
  project: ['graph', 'checkpoints', 'journals', 'estimates', 'reports', 'issued', 'assets'],
};

export const requiredCoverage = (kind: BinEntityKind) => required[kind];

export function coverageOf(kind: BinEntityKind, captured: Iterable<BinCoverageClass>): BinCoverage {
  const have = new Set(captured);
  return {
    included: required[kind].filter((name) => have.has(name)),
    missing: required[kind].filter((name) => !have.has(name)),
    legacy: false,
  };
}

/**
 * Pre-Bin deletions declare only what the old protocol actually kept. Nothing is fabricated:
 * a legacy whole-project trash retained the hosted project body and its files, nothing else.
 */
export function legacyCoverage(kind: BinEntityKind, kept: Iterable<BinCoverageClass>): BinCoverage {
  return { ...coverageOf(kind, kept), legacy: true };
}

export const isComplete = (coverage: BinCoverage) => coverage.missing.length === 0;
