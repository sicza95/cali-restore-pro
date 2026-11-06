export type ControlContract = {
  readonly id: string;
  readonly labelKey: string;
  readonly helpKey: string;
  readonly command: string;
  readonly permission: string;
  readonly prerequisite: string;
  readonly valueSource: string;
  readonly behavior: 'functional' | 'review';
  readonly owner: `M-${number}`;
  readonly composition: string;
  readonly unavailable: {
    readonly failure: string;
    readonly empty: string;
    readonly locked: string;
  };
};
