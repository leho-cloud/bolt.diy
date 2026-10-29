import { describe, expect, it, vi } from 'vitest';
import { withOptionalPreviewSupport } from './preview-support';
describe('optional preview support', () => {
  it('releases the container even when inspector setup never settles', () => {
    const container = { fs: {} };
    expect(withOptionalPreviewSupport(container, () => new Promise(() => {}))).toBe(container);
  });
  it('does not turn an optional inspector failure into a failed runtime', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const container = { fs: {} };
    expect(
      withOptionalPreviewSupport(container, async () => {
        throw Error('inspector unavailable');
      }),
    ).toBe(container);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });
});
