export const checkpointSamples = [
  {
    id: '9fe6ff56-7692-4c89-b264-1d2d2d860db0',
    title: 'Baseline inspection',
    description: 'Initial condition recorded for the synthetic surface.',
  },
  {
    id: 'd19c266d-4fd1-4aa3-ac63-60114b168747',
    title: 'Follow-up inspection',
    description: 'Condition recorded at the synthetic follow-up visit.',
  },
  {
    id: 'e8e7632d-b4cc-4fd0-9192-d15d73409a4f',
    title: 'Final inspection',
    description: 'Condition recorded at the synthetic final visit.',
  },
] as const;

export type Checkpoint = { id: string; title: string; description: string };
