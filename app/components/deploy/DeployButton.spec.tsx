// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { atom } from 'nanostores';
import { afterEach, expect, it, vi } from 'vitest';
import { DeployButton } from './DeployButton';
import { collectProjectBuild } from '~/lib/runtime/previewExport';

vi.mock('~/lib/persistence/useChatHistory', () => ({ chatId: atom('13-test-0'), description: atom('Iskola') }));
vi.mock('~/lib/stores/streaming', () => ({ streamingState: atom(false) }));
vi.mock('~/lib/runtime/previewExport', () => ({ collectProjectBuild: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('publishes build files after confirmation and shows the verified site link', async () => {
  const domain = 'https://iskola.builder.tzsvtav.com';
  const files = [{ path: 'index.html', base64: 'eA==' }];
  vi.mocked(collectProjectBuild).mockResolvedValue(files);

  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ deploymentId: 'deployment', domain, digest: '1'.repeat(64) }, { status: 202 }),
    )
    .mockResolvedValueOnce(Response.json({ state: 'ready' }));
  vi.stubGlobal('fetch', fetcher);

  render(<DeployButton />);
  fireEvent.click(screen.getByRole('button', { name: 'Közzététel' }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeDefined();
  expect((screen.getByLabelText('Webcím') as HTMLInputElement).value).toBe('iskola');
  fireEvent.click(screen.getByRole('button', { name: 'Közzététel indítása' }));

  const link = await screen.findByText('Az oldal megnyitása ↗', {}, { timeout: 3000 });
  expect(link.getAttribute('href')).toBe(domain);

  const [endpoint, init] = fetcher.mock.calls[0];
  expect(endpoint).toBe('/api/project-publish');
  expect(JSON.parse(init.body)).toEqual({ projectId: '13-test-0', slug: 'iskola', files });
  expect(fetcher.mock.calls[1][0]).toContain('/api/project-publish?slug=iskola&id=deployment');
});
