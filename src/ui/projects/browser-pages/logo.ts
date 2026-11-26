import type { AssetReference } from '../../../platform/projects/browser-contracts';
import { localProjects, upgradeProject } from '../../../platform/projects/projects';
import { preserveLegacyProjectSettings } from '../../../platform/projects/settings';
import type { SavedProject } from '../../../platform/projects/types';
import type { LocalVault } from '../../../platform/vault/vault';

/** Opens the file picker; resolves undefined when the person cancels. */
export function chooseImage(): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => resolve(input.files?.[0]), { once: true });
    input.addEventListener('cancel', () => resolve(undefined), { once: true });
    input.click();
  });
}

/**
 * Imports a report logo as a dedicated project asset (a vault file, never image bytes in the
 * document), saving the registration with the file so a backup carries it.
 */
export async function importLogo(
  vault: LocalVault,
  project: SavedProject,
  file: File,
): Promise<{ saved: SavedProject; logo: AssetReference }> {
  let saved: SavedProject | undefined;
  let logo: AssetReference | undefined;
  await vault.files().importImage(
    project.id,
    file,
    async (ref, signal) => {
      const registered = {
        ...upgradeProject(preserveLegacyProjectSettings(project)),
        revision: project.revision,
        assets: [...(project.assets ?? []), { id: ref.id, purpose: 'branding' as const }],
      };
      saved = await localProjects(vault).save(registered, { id: ref.id, signal });
      logo = { assetId: ref.id };
    },
    { signal: new AbortController().signal, progress: () => {} },
  );
  return { saved: saved!, logo: logo! };
}
