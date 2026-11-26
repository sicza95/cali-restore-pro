import type { Project } from '../types';
import type { AccountSettings } from './types';

export const accountSettings = (): AccountSettings => ({
  restoration: {
    units: 'metric',
    areaUnit: 'cm²',
    currency: 'HUF',
    reportLanguage: 'en',
    snap: true,
  },
  branding: {
    studio: 'Account studio',
    contact: 'Account contact',
    footer: 'Account footer',
    accent: '#123456',
    logo: { accountDataUrl: 'data:image/png;base64,AAAA' },
  },
});
export const settingsProject = (): Project => ({
  version: 2,
  id: 'project',
  name: 'Project',
  archived: false,
  updatedAt: 100,
  settings: { version: 1, units: 'imperial', currency: 'EUR' },
  objects: [
    {
      id: 'object',
      name: 'Object',
      units: null,
      surfaces: [{ id: 'surface', name: 'Surface', units: null, images: [] }],
    },
  ],
});
