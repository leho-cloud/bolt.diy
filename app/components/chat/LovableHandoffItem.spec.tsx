// @vitest-environment jsdom

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LovableHandoffItem } from './LovableHandoffItem';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function auth(result: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(result));
}

function show(draft: string) {
  render(
    <DropdownMenu.Root open>
      <DropdownMenu.Content>
        <LovableHandoffItem draft={draft} />
      </DropdownMenu.Content>
    </DropdownMenu.Root>,
  );
}

it('prefills only the owner’s current draft without starting a Lovable build', async () => {
  auth(Response.json({ user: { role: 'owner' } }));

  const draft = 'Árlista + időpontok & Galéria #1\nÚj sor';
  show(`  ${draft}  `);

  const action = await screen.findByRole('menuitem', { name: /Megnyitás a Lovable-ban/ });
  const url = new URL(action.getAttribute('href')!);

  expect(url.origin).toBe('https://lovable.dev');
  expect(url.search).toBe('');
  expect([...new URLSearchParams(url.hash.slice(1))]).toEqual([['prompt', draft]]);
  expect(action.getAttribute('target')).toBe('_blank');
});

it.each(['  ', 'a'.repeat(50_001)])('disables handoff when the draft cannot be prefilled', async (draft) => {
  auth(Response.json({ user: { role: 'owner' } }));
  show(draft);

  const action = await screen.findByRole('menuitem', { name: /Megnyitás a Lovable-ban/ });
  expect(action.getAttribute('aria-disabled')).toBe('true');
  expect(action.hasAttribute('href')).toBe(false);
});

it.each([Response.json({ user: { role: 'member' } }), Response.json({}, { status: 401 }), Response.json({})])(
  'hides the action without a confirmed owner role',
  async (result) => {
    auth(result);
    await act(async () => show('Weboldal'));
    expect(fetch).toHaveBeenCalledWith('/api/private-access/me', expect.objectContaining({ cache: 'no-store' }));
    expect(screen.queryByRole('menuitem', { name: /Megnyitás a Lovable-ban/ })).toBeNull();
  },
);
