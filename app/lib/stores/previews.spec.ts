import type { WebContainer } from '@webcontainer/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewsStore } from './previews';

afterEach(() => vi.unstubAllGlobals());

async function setup() {
  vi.stubGlobal('BroadcastChannel', undefined);

  const handlers: Record<string, (...args: any[]) => void> = {};

  const container = {
    on: vi.fn((name, handler) => {
      handlers[name] = handler;
    }),
  };

  const store = new PreviewsStore(Promise.resolve(container as unknown as WebContainer));
  await Promise.resolve();

  return { store, handlers };
}

describe('visible project preview', () => {
  it('selects a newly opened server instead of forcing the lowest port', async () => {
    const { store, handlers } = await setup();
    handlers.port(5173, 'open', 'https://old.example');
    handlers.port(5174, 'open', 'https://new.example');
    expect(store.selectedPort.get()).toBe(5174);
    store.select(5173);
    expect(store.selectedPort.get()).toBe(5173);
    handlers.port(5173, 'close', '');
    expect(store.selectedPort.get()).toBe(5174);
    store.reset();
    expect(store.selectedPort.get()).toBeUndefined();
    expect(store.previews.get()).toEqual([]);
  });

  it('refreshes local preview identity after checks without changing URL or selected port', async () => {
    const { store, handlers } = await setup();
    handlers.port(5173, 'open', 'https://page.example');

    const before = store.previews.get()[0];
    store.refreshAllPreviews();

    const after = store.previews.get()[0];
    expect(after).not.toBe(before);
    expect(after).toMatchObject({ port: 5173, ready: true, baseUrl: before.baseUrl, reloadKey: 1 });
    expect(store.selectedPort.get()).toBe(5173);
    store.refreshAllPreviews();
    expect(store.previews.get()[0].reloadKey).toBe(2);
    store.reset();
  });
});
