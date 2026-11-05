export type SaveState = 'saved' | 'saving' | 'offline' | 'draft' | 'error';

export type SaveStatusProps = { state: SaveState; onRetry?: () => void };
