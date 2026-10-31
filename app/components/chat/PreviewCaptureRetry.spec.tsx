import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewCaptureRetry } from './PreviewCaptureRetry';
import { inspectProjectPreview } from '~/lib/runtime/previewAudit';

vi.mock('~/lib/runtime/previewAudit', () => ({ inspectProjectPreview: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('local capture retry without paid generation', () => {
  it('captures both views and never calls an AI endpoint', async () => {
    const network = vi.spyOn(globalThis, 'fetch');
    vi.mocked(inspectProjectPreview).mockResolvedValue({
      reports: [
        { device: 'desktop', report: { image: 'data:image/jpeg;base64,AA==' } },
        { device: 'mobile', report: { image: 'data:image/jpeg;base64,AA==' } },
      ],
    } as any);

    const view = render(<PreviewCaptureRetry />);
    await act(async () => fireEvent.click(view.getByRole('button')));
    expect(view.getAllByRole('img')).toHaveLength(2);
    expect(view.getByRole('status')).toHaveTextContent('AI-értékelés nem indult');
    expect(network).not.toHaveBeenCalled();
  });
  it('shows the capture failure and allows another local attempt', async () => {
    vi.mocked(inspectProjectPreview).mockRejectedValue(new Error('A betűtípusok képi rögzítése nem sikerült.'));

    const view = render(<PreviewCaptureRetry />);
    await act(async () => fireEvent.click(view.getByRole('button')));
    expect(view.getByRole('status')).toHaveTextContent('betűtípusok');
    expect(view.getByRole('button')).toBeEnabled();
    expect(view.queryByRole('img')).toBeNull();
  });
});
