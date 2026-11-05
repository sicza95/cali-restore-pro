import type { LayerId } from '../types';

export type PhotoCanvasProps = {
  visible: ReadonlySet<LayerId>;
  detail?: boolean;
  empty?: boolean;
};
