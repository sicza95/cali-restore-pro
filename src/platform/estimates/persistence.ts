import type { LocalVault } from '../vault/vault';
import type { EstimateDocument, Preset, Phase } from './types';
import { nonnegative } from './decimal';
import { calculate } from './calculate';

export function estimateRepository(vault: LocalVault) {
  return {
    async load(project: string) {
      const row = await vault.estimates().changed(project, 0);
      if (!row) return;
      const document = JSON.parse(row.text) as EstimateDocument;
      if (
        document.schema !== 1 ||
        document.draft.project !== project ||
        !Array.isArray(document.snapshots)
      )
        throw new Error('Invalid estimate document');
      for (const item of document.snapshots) {
        if (
          item.input.project !== project ||
          JSON.stringify(calculate(item.input)) !== JSON.stringify(item.result)
        )
          throw new Error('Estimate snapshot mismatch');
      }
      return { revision: row.revision, document };
    },
    async save(project: string, revision: number, document: EstimateDocument) {
      if (document.schema !== 1 || document.draft.project !== project)
        throw new Error('Project mismatch');
      const previous = await vault.estimates().changed(project, 0);
      if ((previous?.revision ?? 0) !== revision) throw new Error('Estimate changed');
      const existing = previous ? (JSON.parse(previous.text) as EstimateDocument).snapshots : [];
      if (existing.some((s, i) => JSON.stringify(s) !== JSON.stringify(document.snapshots[i])))
        throw new Error('Snapshots are immutable');
      for (const s of document.snapshots) {
        if (
          s.input.project !== project ||
          JSON.stringify(calculate(s.input)) !== JSON.stringify(s.result)
        )
          throw new Error('Snapshot mismatch');
      }
      return vault.estimates().save(project, revision, JSON.stringify(document));
    },
  };
}

export function presetRepository(vault: LocalVault) {
  return {
    async list(): Promise<Preset[]> {
      return (await vault.estimatePresets().list()).flatMap((row) => {
        const versions = JSON.parse(row.text) as Preset[];
        if (
          !Array.isArray(versions) ||
          versions.some((v, i) => v.id !== row.id || v.version !== i + 1)
        )
          throw new Error('Invalid preset versions');
        return versions;
      });
    },
    async save(preset: Preset) {
      if (
        !preset.name.trim() ||
        !nonnegative(preset.value).nonnegative() ||
        (preset.kind === 'productivity' && !nonnegative(preset.value).positive())
      )
        throw new Error('Invalid preset');
      const store = vault.estimatePresets();
      const previous = await store.changed(preset.id, 0);
      const versions = previous ? (JSON.parse(previous.text) as Preset[]) : [];
      if (preset.version !== versions.length + 1) throw new Error('Preset changed');
      await store.save(
        preset.id,
        previous?.revision ?? 0,
        JSON.stringify([...versions, structuredClone(preset)]),
      );
    },
  };
}

export function applyPreset(phase: Phase, preset: Preset, currency: string): Partial<Phase> {
  if (preset.archived || (preset.kind === 'rate' && preset.currency !== currency))
    throw new Error('Incompatible preset');
  const presets = [...(phase.presets ?? []), { id: preset.id, version: preset.version }];
  if (preset.kind === 'productivity') {
    if (preset.unit === 'fixed' || preset.unit === 'hourly') throw new Error('Incompatible unit');
    return {
      presets,
      units: preset.unit,
      mode: 'productivity',
      productivity: { ...phase.productivity, [preset.unit]: preset.value },
    };
  }
  return {
    presets,
    price: preset.unit === 'fixed' || preset.unit === 'hourly' ? preset.unit : 'area',
    ...(preset.unit === 'fixed' || preset.unit === 'hourly' ? {} : { units: preset.unit }),
    rate: { ...phase.rate, [preset.unit]: preset.value },
  };
}
