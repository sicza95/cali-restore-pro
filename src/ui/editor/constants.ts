export const referencePhoto = '/photos/painted-plaster.png';

export const sampleLayers = [
  { id: 'flaking', name: 'Flaking', area: 0.42, kind: 'damage' },
  { id: 'lacunae', name: 'Lacunae', area: 0.36, kind: 'damage' },
  { id: 'cracks', name: 'Cracks', area: 0.14, kind: 'damage' },
  { id: 'cleaning', name: 'Cleaning', area: 0.9, kind: 'phase' },
] as const;
