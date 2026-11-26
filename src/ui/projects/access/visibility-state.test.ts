import { describe, expect, it, vi } from 'vitest';
import type { HostedProjectVisibility } from '../../../platform/api';
import { projectVisibility, type VisibilityRequest } from '../../../platform/projects/visibility';
import { visibilityState, type VisibilityState } from './visibility-state';

const privateValue: HostedProjectVisibility = { visibility: 'private', version: 3, name: 'Chapel' };
function setup() {
  const request = vi.fn<(path: string, body?: object, method?: string) => Promise<unknown>>();
  const states: VisibilityState[] = [];
  const api = projectVisibility(request as unknown as VisibilityRequest, 'chapel');
  const model = visibilityState(api, (state) => states.push(state));
  return { request, states, model, state: () => states.at(-1)! };
}

describe('visibility requests and selected-project lifetime', () => {
  it('reads the owner endpoint and PATCHes the last read version with the current trimmed name', async () => {
    const { request, model, state } = setup();
    request
      .mockResolvedValueOnce(privateValue)
      .mockResolvedValueOnce({ visibility: 'listed', version: 4, name: 'New chapel' });
    await model.reload();
    await model.save('listed', ' New chapel ');
    expect(request.mock.calls).toEqual([
      ['/hosted-projects/chapel/visibility'],
      [
        '/hosted-projects/chapel/visibility',
        { visibility: 'listed', version: 3, name: 'New chapel' },
        'PATCH',
      ],
    ]);
    expect(state()).toEqual({
      value: { visibility: 'listed', version: 4, name: 'New chapel' },
      busy: false,
      notice: 'saved',
    });
  });

  it('reloads a conflict without silently retrying or overwriting the other owner', async () => {
    const { request, model, state } = setup();
    const latest = { ...privateValue, version: 6, name: 'Other owner name' };
    request
      .mockResolvedValueOnce(privateValue)
      .mockRejectedValueOnce(new Error('visibility_conflict'))
      .mockResolvedValueOnce(latest);
    await model.reload();
    await model.save('listed', 'Chapel');
    expect(state()).toEqual({ value: latest, busy: false, notice: 'conflict' });
    expect(request).toHaveBeenCalledTimes(3);
    request.mockResolvedValueOnce({ ...latest, visibility: 'listed', version: 7 });
    await model.save('listed', 'Chapel');
    expect(request.mock.calls.at(-1)?.[1]).toEqual({
      visibility: 'listed',
      version: 6,
      name: 'Chapel',
    });
  });

  it('blocks stale writes after a failed conflict reload until the owner explicitly reloads', async () => {
    const { request, model, state } = setup();
    request
      .mockResolvedValueOnce(privateValue)
      .mockRejectedValueOnce(new Error('visibility_conflict'))
      .mockRejectedValueOnce(new Error('offline'));
    await model.reload();
    await model.save('listed', 'Chapel');
    expect(state()).toEqual({ busy: false, notice: 'conflictReload' });
    await model.save('listed', 'Chapel');
    expect(request).toHaveBeenCalledTimes(3);
    request.mockResolvedValueOnce({ ...privateValue, version: 5 });
    await model.reload();
    expect(state().notice).toBe('conflict');
    expect(state().value?.version).toBe(5);
  });

  it('rolls back the pending selection on a network failure', async () => {
    const { request, model, state, states } = setup();
    request.mockResolvedValueOnce(privateValue).mockRejectedValueOnce(new Error('offline'));
    await model.reload();
    await model.save('listed', 'Chapel');
    expect(states).toContainEqual({
      value: { ...privateValue, visibility: 'listed' },
      busy: true,
      notice: 'saving',
    });
    expect(state()).toEqual({ value: privateValue, busy: false, notice: 'error' });
  });

  it('serializes writes and ignores a response after the selection unmounts', async () => {
    const { request, model, state, states } = setup();
    let finish!: (value: HostedProjectVisibility) => void;
    request.mockResolvedValueOnce(privateValue).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve as typeof finish;
        }),
    );
    await model.reload();
    const pending = model.save('listed', 'Chapel');
    expect(state().busy).toBe(true);
    await model.save('private', 'Chapel');
    expect(request).toHaveBeenCalledTimes(2);
    model.dispose();
    const count = states.length;
    finish({ ...privateValue, visibility: 'listed', version: 4 });
    await pending;
    await model.reload();
    expect(states).toHaveLength(count);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('keeps an initial load failure retryable and never writes an invented version', async () => {
    const { request, model, state } = setup();
    request.mockRejectedValueOnce(new Error('offline'));
    await model.reload();
    expect(state()).toEqual({ busy: false, notice: 'error' });
    await model.save('listed', 'Chapel');
    expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValueOnce(privateValue);
    await model.reload();
    expect(state().value).toEqual(privateValue);
  });
});
