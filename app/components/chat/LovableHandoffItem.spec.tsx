// @vitest-environment jsdom

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { LovableHandoffItem } from './LovableHandoffItem';

afterEach(cleanup);

function show(draft: string) {
  render(
    <DropdownMenu.Root open>
      <DropdownMenu.Content>
        <LovableHandoffItem draft={draft} />
      </DropdownMenu.Content>
    </DropdownMenu.Root>,
  );
}

it('prefills only the current draft without starting a Lovable build', () => {
  const draft = 'Árlista + időpontok & Galéria #1\nÚj sor';
  show(`  ${draft}  `);

  const action = screen.getByRole('menuitem', { name: /Megnyitás a Lovable-ban/ });
  const url = new URL(action.getAttribute('href')!);

  expect(url.origin).toBe('https://lovable.dev');
  expect(url.search).toBe('');
  expect([...new URLSearchParams(url.hash.slice(1))]).toEqual([['prompt', draft]]);
  expect(action.getAttribute('target')).toBe('_blank');
});

it.each(['  ', 'a'.repeat(50_001)])('disables handoff when the draft cannot be prefilled', (draft) => {
  show(draft);

  const action = screen.getByRole('menuitem', { name: /Megnyitás a Lovable-ban/ });
  expect(action.getAttribute('aria-disabled')).toBe('true');
  expect(action.hasAttribute('href')).toBe(false);
});
