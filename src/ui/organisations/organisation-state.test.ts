import { describe, expect, it } from 'vitest';
import { projectOrganisation } from './organisation-state';

const personal = { id: 'p', name: '', personal: true, role: 'admin', memberCount: 1 } as const;
const acme = { id: 'a', name: 'Acme', personal: false, role: 'member', memberCount: 3 } as const;

describe('projectOrganisation', () => {
  it('keeps a known organisation and falls back to the personal one', () => {
    expect(projectOrganisation('a', [personal, acme])).toBe('a');
    expect(projectOrganisation(undefined, [personal, acme])).toBe('p');
    // A project of an organisation the account left, or one deleted, shows under Personal.
    expect(projectOrganisation('gone', [personal, acme])).toBe('p');
  });
});
