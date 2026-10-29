import { act, renderHook, waitFor } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedMessages, getCachedSnapshot, invalidateChatCache } from './chatCache';
import { getMessagesByIdRaw, getSnapshot } from './db';

const { resetWorkbench, waitForExecutionQueue, setMessages, setSnapshot, writeFile, mkdir } = vi.hoisted(() => ({
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  resetWorkbench: vi.fn(async (): Promise<void> => undefined),
  waitForExecutionQueue: vi.fn(async () => undefined),
  setMessages: vi.fn(async () => undefined),
  setSnapshot: vi.fn(async () => undefined),
}));

/*
 * `~/lib/stores/workbench` and `~/lib/webcontainer` both read
 * `import.meta.hot.data`, which vitest does not provide. Mocking them keeps the
 * module graph loadable; the workbench is the subject under test here, so its
 * reset is asserted through the spy rather than through its internals.
 */
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    resetWorkbench,
    waitForExecutionQueue,
    files: { get: () => ({}) },
    firstArtifact: undefined,
  },
}));

// Use an in-memory filesystem boundary to verify snapshot restoration.
vi.mock('~/lib/webcontainer', () => ({
  webcontainer: Promise.resolve({ workdir: '/home/project', fs: { writeFile, mkdir } }),
  webcontainerContext: { loaded: false },
}));

vi.mock('./db', () => ({
  openDatabase: vi.fn(async () => ({})),
  createChatWithNextId: vi.fn(async () => ({ id: '3' })),
  setMessages,
  setSnapshot,
  duplicateChat: vi.fn(async () => 'dupe'),
  createChatFromMessages: vi.fn(async () => 'imported'),
  getMessagesByIdRaw: vi.fn(async () => undefined),
  getMessagesByUrlIdRaw: vi.fn(async () => undefined),
  getSnapshot: vi.fn(async () => undefined),
}));

/*
 * Persisted chats, keyed by the route that shows them. The record's own id is
 * what identifies a chat, which is deliberately not the same as the route: a
 * chat that was just created gets a numeric id and is then routed to
 * /chat/<urlId>.
 */
const records: Record<string, { id: string; urlId: string }> = {
  'chat-a': { id: '1', urlId: 'chat-a' },
  'chat-b': { id: '2', urlId: 'chat-b' },
  3: { id: '3', urlId: '3' },
};

vi.mock('./chatCache', () => ({
  getCachedMessages: vi.fn(async (_db: unknown, routeId: string) => {
    const record = records[routeId];

    return {
      id: record?.id ?? routeId,
      urlId: record?.urlId ?? routeId,
      description: routeId,
      messages: [
        { id: `${routeId}-user`, role: 'user', parts: [{ type: 'text', text: 'hi' }] },
        { id: `${routeId}-assistant`, role: 'assistant', parts: [{ type: 'text', text: 'hello' }] },
      ] as UIMessage[],
    };
  }),
  getCachedSnapshot: vi.fn(async () => undefined),
  invalidateChatCache: vi.fn(),
}));

/*
 * The route the hook believes it is on. `searchParams` is memoised per search
 * string so the effect's dependency behaves the way it does under the router.
 */
let routeId: string | undefined = 'chat-a';
let routeSearch = '';

const searchParamsCache = new Map<string, URLSearchParams>();

/*
 * `navigate` is an effect dependency, so it has to keep its identity across
 * renders the way the router's does.
 */
const navigate = vi.fn((to: string, options?: { replace?: boolean }) => {
  if (options?.replace) {
    window.history.replaceState(window.history.state, '', to);
  }
});

const setSearchParams = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useLoaderData: () => undefined,
  useParams: () => ({ id: routeId }),
  useSearchParams: () => {
    let params = searchParamsCache.get(routeSearch);

    if (!params) {
      params = new URLSearchParams(routeSearch);
      searchParamsCache.set(routeSearch, params);
    }

    return [params, setSearchParams];
  },
}));

async function importHook() {
  return (await import('./useChatHistory')).useChatHistory;
}

describe('useChatHistory chat switching', () => {
  beforeEach(() => {
    writeFile.mockClear();
    mkdir.mockClear();
    resetWorkbench.mockClear();
    waitForExecutionQueue.mockClear();
    setMessages.mockClear();
    setSnapshot.mockClear();
    vi.mocked(getMessagesByIdRaw).mockReset();
    vi.mocked(getSnapshot).mockReset();
    vi.mocked(getCachedSnapshot).mockClear();
    navigate.mockClear();
    routeId = 'chat-a';
    routeSearch = '';
    searchParamsCache.clear();
    window.history.replaceState(window.history.state, '', '/');

    /*
     * `openDatabase` bails out when there is no indexedDB, which would send the
     * hook down its "persistence unavailable" path instead of loading a chat.
     */
    vi.stubGlobal('indexedDB', {
      open: () => {
        const request: Record<string, unknown> = {};

        queueMicrotask(() => {
          request.result = {};
          (request.onsuccess as (event: unknown) => void)?.({ target: request });
        });

        return request;
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reset the workbench and the container when another chat is opened', async () => {
    const useChatHistory = await importHook();
    const { rerender, result } = renderHook(() => useChatHistory());

    await waitFor(() => expect(resetWorkbench).toHaveBeenCalledTimes(1));

    routeId = 'chat-b';
    rerender();

    await waitFor(() => expect(resetWorkbench).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.chatChanged).toBe(true));
  });

  it('restores text-only conversations without manufacturing an incomplete app setup', async () => {
    const messages = [
      { id: 'question', role: 'user', parts: [{ type: 'text', text: 'Check the connection only' }] },
      { id: 'answer', role: 'assistant', parts: [{ type: 'text', text: 'Connection verified' }] },
    ] as UIMessage[];
    vi.mocked(getCachedMessages).mockResolvedValueOnce({
      id: '1',
      urlId: 'chat-a',
      description: 'Connection check',
      timestamp: '2026-10-29',
      messages,
    });
    vi.mocked(getCachedSnapshot).mockResolvedValueOnce({ chatIndex: 'answer', files: {} });

    const useChatHistory = await importHook();
    const { result } = renderHook(() => useChatHistory());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.initialMessages).toEqual(messages);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('loads a snapshot by the persisted chat ID when the route uses a URL ID', async () => {
    const useChatHistory = await importHook();

    renderHook(() => useChatHistory());

    await waitFor(() => expect(getCachedSnapshot).toHaveBeenCalledWith({}, '1'));
  });

  it.each([false, true])(
    'restores a first-message snapshot without hiding the project (preserve=%s)',
    async (preserve) => {
      const message = {
        id: 'only-message',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Saved project' }],
      } as UIMessage;
      vi.mocked(getCachedMessages).mockResolvedValueOnce({
        id: '1',
        urlId: 'chat-a',
        description: 'Saved project',
        timestamp: '2026-10-18T13:00:00.000Z',
        messages: [message],
      });
      vi.mocked(getCachedSnapshot).mockResolvedValueOnce({
        chatIndex: message.id,
        preserveMessagesOnRestore: preserve,
        files: {
          '/home/project/src/main.ts': { type: 'file', content: 'saved source', isBinary: false },
          '/home/project/index.html': { type: 'file', content: '<h1>Saved</h1>', isBinary: false },
        },
      });

      const useChatHistory = await importHook();
      const { result } = renderHook(() => useChatHistory());

      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.initialMessages).toEqual([message]);
      expect(mkdir).toHaveBeenCalledTimes(1);
      expect(mkdir).toHaveBeenCalledWith('src', { recursive: true });
      expect(writeFile).toHaveBeenCalledWith('index.html', '<h1>Saved</h1>', { encoding: 'utf8' });
      expect(writeFile).toHaveBeenCalledWith('src/main.ts', 'saved source', { encoding: 'utf8' });
    },
  );

  it('should not reset the workbench when only the query string changes', async () => {
    const useChatHistory = await importHook();
    const { rerender } = renderHook(() => useChatHistory());

    await waitFor(() => expect(resetWorkbench).toHaveBeenCalledTimes(1));

    /*
     * A `?prompt=` navigation re-runs the effect for the same chat. Wiping the
     * workbench there would delete the project the chat is still on.
     */
    routeSearch = 'prompt=make%20a%20todo%20app';
    rerender();

    await waitFor(() => expect(resetWorkbench).toHaveBeenCalledTimes(1));
  });

  it('should reset the workbench and the container when leaving a chat for a fresh one', async () => {
    const useChatHistory = await importHook();
    const { rerender, result } = renderHook(() => useChatHistory());

    await waitFor(() => expect(resetWorkbench).toHaveBeenCalledTimes(1));

    routeId = undefined;
    rerender();

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(resetWorkbench).toHaveBeenCalledTimes(2);

    /*
     * The outgoing chat's parsed output has to go with it, otherwise the next
     * chat's messages are appended to it by index.
     */
    await waitFor(() => expect(result.current.chatChanged).toBe(true));
  });

  it('should not reset again while already on a fresh chat', async () => {
    const useChatHistory = await importHook();

    routeId = undefined;

    const { rerender, result } = renderHook(() => useChatHistory());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(resetWorkbench).not.toHaveBeenCalled();

    routeSearch = 'prompt=make%20a%20todo%20app';
    rerender();

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(resetWorkbench).not.toHaveBeenCalled();
    expect(result.current.chatChanged).toBe(false);
  });

  /*
   * Persisting the first exchange of a new chat moves it to /chat/<id>, which the
   * router picks up. The live chat already owns the in-flight response, so its
   * route handoff must not reload or replace its messages.
   */
  it('should not reset when the route catches up with the chat just persisted', async () => {
    const useChatHistory = await importHook();

    routeId = undefined;

    const { rerender, result } = renderHook(() => useChatHistory());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(resetWorkbench).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.storeMessageHistory([
        { id: 'new-1', role: 'assistant', content: 'built', parts: [{ type: 'text', text: 'built' }] } as any,
      ]);
    });

    expect(window.location.pathname).toBe('/chat/3');
    expect(navigate).toHaveBeenCalledWith('/chat/3', { replace: true });

    // The router re-renders now that it can see the new path.
    routeId = '3';
    rerender();

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(resetWorkbench).not.toHaveBeenCalled();
    expect(result.current.chatChanged).toBe(false);
    expect(result.current.initialMessages).toEqual([]);
  });

  it('does not let an extra export consumer reset the live home chat at its persisted route handoff', async () => {
    const useChatHistory = await importHook();
    routeId = undefined;

    const { rerender, result } = renderHook(() => {
      const chat = useChatHistory();
      const sidebar = useChatHistory({ loadHistory: false });

      return { chat, sidebar };
    });
    await waitFor(() => expect(result.current.chat.ready).toBe(true));

    const messages = [
      { id: 'live-home-chat', role: 'assistant', parts: [{ type: 'text', text: 'building' }] } as UIMessage,
    ];
    await act(async () => {
      await result.current.chat.storeMessageHistory(messages, true);
    });

    routeSearch = 'view=preview';
    rerender();
    await waitFor(() => expect(result.current.chat.ready).toBe(true));
    expect(resetWorkbench).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.chat.storeMessageHistory(messages, false);
    });

    routeId = '3';
    rerender();
    await waitFor(() => expect(result.current.chat.ready).toBe(true));

    expect(resetWorkbench).not.toHaveBeenCalled();
    expect(result.current.chat.chatChanged).toBe(false);
    expect(result.current.chat.initialMessages).toEqual([]);
    expect(result.current.sidebar.initialMessages).toEqual([]);
  });

  it('loads and resets a selected chat only once when an export consumer is also mounted', async () => {
    const useChatHistory = await importHook();

    const { result } = renderHook(() => {
      const chat = useChatHistory();
      useChatHistory({ loadHistory: false });

      return chat;
    });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(resetWorkbench).toHaveBeenCalledTimes(1);
    expect(result.current.initialMessages[0].id).toBe('chat-a-user');
  });

  it('should defer the new chat route handoff until the initial response finishes', async () => {
    const useChatHistory = await importHook();
    routeId = undefined;

    const { result } = renderHook(() => useChatHistory());
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      await result.current.storeMessageHistory(
        [
          {
            id: 'streaming',
            role: 'assistant',
            content: 'building',
            parts: [{ type: 'text', text: 'building' }],
          } as any,
        ],
        true,
      );
    });

    expect(setSnapshot).not.toHaveBeenCalled();

    expect(navigate).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/');

    await act(async () => {
      await result.current.storeMessageHistory(
        [
          {
            id: 'complete',
            role: 'assistant',
            content: 'finished',
            parts: [{ type: 'text', text: 'finished' }],
          } as any,
        ],
        false,
      );
    });

    expect(waitForExecutionQueue).toHaveBeenCalled();
    expect(setSnapshot).toHaveBeenCalledWith({}, '3', expect.objectContaining({ chatIndex: 'complete' }));
    expect(vi.mocked(invalidateChatCache).mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      setSnapshot.mock.invocationCallOrder.at(-1)!,
    );
    expect(navigate).toHaveBeenCalledWith('/chat/3', { replace: true });
    expect(window.location.pathname).toBe('/chat/3');
  });

  it('preserves an incoming generation when the home query changes before its route handoff', async () => {
    const useChatHistory = await importHook();
    routeId = undefined;

    const { rerender, result } = renderHook(() => useChatHistory());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const messages = [
      { id: 'live-response', role: 'assistant', parts: [{ type: 'text', text: 'building' }] } as UIMessage,
    ];

    await act(async () => {
      await result.current.storeMessageHistory(messages, true);
    });

    routeSearch = 'view=preview';
    window.history.replaceState(window.history.state, '', '/?view=preview');
    rerender();

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(resetWorkbench).not.toHaveBeenCalled();
    expect(result.current.chatChanged).toBe(false);
    expect(result.current.initialMessages).toEqual([]);

    await act(async () => {
      await result.current.storeMessageHistory(messages, false);
    });
    expect(navigate).toHaveBeenCalledWith('/chat/3?view=preview', { replace: true });
  });

  it('skips a stale chat reset queued behind an earlier filesystem transition', async () => {
    const useChatHistory = await importHook();

    let finishReset!: () => void;

    const resetting = new Promise<void>((resolve) => {
      finishReset = resolve;
    });
    resetWorkbench.mockImplementationOnce(() => resetting);

    const { rerender, result } = renderHook(() => useChatHistory());
    await waitFor(() => expect(resetWorkbench).toHaveBeenCalledTimes(1));

    routeId = 'chat-b';
    rerender();
    await waitFor(() => expect(getCachedSnapshot).toHaveBeenCalledWith({}, '2'));

    routeId = '3';
    rerender();
    await waitFor(() => expect(getCachedSnapshot).toHaveBeenCalledWith({}, '3'));

    await act(async () => {
      finishReset();
    });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(resetWorkbench).toHaveBeenCalledTimes(2);
    expect(result.current.initialMessages[0].id).toBe('3-user');
  });

  it('should drop queued saves from a chat as soon as the route changes', async () => {
    const useChatHistory = await importHook();
    const { rerender, result } = renderHook(() => useChatHistory());

    await waitFor(() => expect(result.current.ready).toBe(true));

    let releaseFirstSave: () => void = () => undefined;

    const firstSaveGate = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    setMessages.mockImplementationOnce(async () => {
      await firstSaveGate;
      return undefined;
    });

    const firstSave = result.current.storeMessageHistory([
      {
        id: 'chat-a-first',
        role: 'assistant',
        content: 'first',
        parts: [{ type: 'text', text: 'first' }],
      } as any,
    ]);

    await waitFor(() => expect(setMessages).toHaveBeenCalledTimes(1));

    const queuedSave = result.current.storeMessageHistory([
      {
        id: 'chat-a-queued',
        role: 'assistant',
        content: 'queued',
        parts: [{ type: 'text', text: 'queued' }],
      } as any,
    ]);

    routeId = 'chat-b';
    rerender();

    await act(async () => {
      releaseFirstSave();
      await Promise.all([firstSave, queuedSave]);
    });

    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(setSnapshot).not.toHaveBeenCalled();
  });

  it('should clear the previous chat switch when a fresh chat is persisted', async () => {
    const useChatHistory = await importHook();
    const { rerender, result } = renderHook(() => useChatHistory());

    await waitFor(() => expect(result.current.ready).toBe(true));

    routeId = undefined;
    rerender();
    await waitFor(() => expect(result.current.chatChanged).toBe(true));

    await act(async () => {
      await result.current.storeMessageHistory([
        {
          id: 'new-after-switch',
          role: 'assistant',
          content: 'building',
          parts: [{ type: 'text', text: 'building' }],
        } as any,
      ]);
    });

    routeId = '3';
    rerender();

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
      expect(result.current.chatChanged).toBe(false);
    });
    expect(result.current.chatChanged).toBe(false);
    expect(result.current.initialMessages).toEqual([]);
  });

  it('exports one complete, importable project archive with its file snapshot', async () => {
    const chat = {
      id: '1',
      urlId: 'chat-a',
      description: 'Mentett projekt',
      messages: [{ id: 'message-1', role: 'assistant', parts: [{ type: 'text', text: 'Kész.' }] }],
      timestamp: '2026-10-18T10:00:00.000Z',
      metadata: null,
    };

    const snapshot = { chatIndex: 'complete', files: { 'index.html': { type: 'file', content: 'hello' } } };
    vi.mocked(getMessagesByIdRaw).mockResolvedValue(chat as any);
    vi.mocked(getSnapshot).mockResolvedValue(snapshot as any);

    let exportedBlob: Blob | undefined;

    const previousCreateObjectURL = URL.createObjectURL;
    const previousRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        exportedBlob = blob;
        return 'blob:project-export';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const useChatHistory = await importHook();
    const { result } = renderHook(() => useChatHistory({ loadHistory: false }));

    await act(async () => {
      await result.current.exportChat('1');
    });

    expect(exportedBlob).toBeDefined();

    const archive = JSON.parse(await exportedBlob!.text());
    expect(archive.formatVersion).toBe(2);
    expect(archive.chats).toEqual([chat]);
    expect(archive.snapshots['1']).toEqual(snapshot);

    if (previousCreateObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: previousCreateObjectURL,
      });
    } else {
      delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
    }

    if (previousRevokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: previousRevokeObjectURL,
      });
    } else {
      delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    }
  });
});
