import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDataOperations } from '~/lib/hooks/useDataOperations';
import { createChatWithNextId, getMessagesByUrlIdRaw, getSnapshot } from '~/lib/persistence/db';
import { ImportExportService } from '~/lib/services/importExportService';

vi.mock('~/lib/hooks/useIndexedDB', () => ({
  useIndexedDB: () => ({ db: undefined }),
}));

vi.mock('react-toastify', () => ({
  toast: {
    dismiss: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

type RecordValue = Record<string, any>;

function createMemoryDatabase(seed: { chats?: RecordValue[]; snapshots?: RecordValue[] } = {}) {
  const records = {
    chats: new Map((seed.chats ?? []).map((record) => [record.id, structuredClone(record)])),
    snapshots: new Map((seed.snapshots ?? []).map((record) => [record.chatId, structuredClone(record)])),
  };

  const objectStoreNames = ['chats', 'snapshots'] as string[] & { contains: (name: string) => boolean };
  objectStoreNames.contains = (name) => objectStoreNames.includes(name);

  const database = {
    name: 'boltHistory-test',
    version: 2,
    objectStoreNames,
    transaction(names: string | string[]) {
      const transaction: RecordValue = { error: null };

      let completionTimer: ReturnType<typeof setTimeout> | undefined;

      const scheduleComplete = () => {
        clearTimeout(completionTimer);
        completionTimer = setTimeout(() => transaction.oncomplete?.(), 0);
      };

      transaction.objectStore = (name: 'chats' | 'snapshots') => {
        if (!(Array.isArray(names) ? names : [names]).includes(name)) {
          throw new Error(`Store ${name} is outside this transaction`);
        }

        const values = records[name];
        const keyFor = (record: RecordValue) => (name === 'chats' ? record.id : record.chatId);

        const readRequest = (lookup: () => RecordValue | undefined) => {
          const request: RecordValue = {};
          setTimeout(() => {
            request.result = structuredClone(lookup());
            request.onsuccess?.();
            scheduleComplete();
          }, 0);

          return request;
        };

        return {
          get(key: string) {
            return readRequest(() => values.get(key));
          },
          getAll() {
            const request: RecordValue = {};
            setTimeout(() => {
              request.result = [...values.values()].map((record) => structuredClone(record));
              request.onsuccess?.();
              scheduleComplete();
            }, 0);

            return request;
          },
          put(record: RecordValue) {
            values.set(keyFor(record), structuredClone(record));
            scheduleComplete();

            return {};
          },
          add(record: RecordValue) {
            values.set(keyFor(record), structuredClone(record));
            scheduleComplete();

            return {};
          },
          openKeyCursor() {
            const request: RecordValue = {};
            const keys = [...values.keys()];

            const visit = (index: number) => {
              request.result = index < keys.length ? { key: keys[index], continue: () => visit(index + 1) } : null;
              request.onsuccess?.();

              if (index >= keys.length) {
                scheduleComplete();
              }
            };
            setTimeout(() => visit(0), 0);

            return request;
          },
          index(indexName: string) {
            if (indexName !== 'urlId') {
              throw new Error(`Unknown index ${indexName}`);
            }

            return {
              get(key: string) {
                return readRequest(() => [...records.chats.values()].find((record) => record.urlId === key));
              },
              openKeyCursor() {
                const request: RecordValue = {};
                const keys = [...records.chats.values()].map((record) => record.urlId).filter(Boolean);

                const visit = (index: number) => {
                  request.result = index < keys.length ? { key: keys[index], continue: () => visit(index + 1) } : null;
                  request.onsuccess?.();

                  if (index >= keys.length) {
                    scheduleComplete();
                  }
                };
                setTimeout(() => visit(0), 0);

                return request;
              },
            };
          },
          delete(key: string) {
            values.delete(key);
            scheduleComplete();

            return {};
          },
          clear() {
            values.clear();
            scheduleComplete();

            return {};
          },
        };
      };

      return transaction;
    },
  } as unknown as IDBDatabase;

  return { database, records };
}

const oldChat = {
  id: '1',
  urlId: 'project-one',
  description: 'Projekt régi állapota',
  messages: [{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'régi' }] }],
  timestamp: '2026-10-18T10:00:00.000Z',
  metadata: null,
};
const oldSnapshot = {
  chatIndex: 'old-index',
  files: { 'src/main.ts': { type: 'file', content: 'régi fájl' } },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('project backup and restore', () => {
  it('saves a named project with a stable route and opens it again by that route', async () => {
    const db = createMemoryDatabase();

    const created = await createChatWithNextId(
      db.database,
      [{ id: 'welcome', role: 'assistant', parts: [{ type: 'text', text: 'Projekt létrehozva.' }] } as any],
      undefined,
      'Mintaprojekt',
      undefined,
      true,
    );

    expect(created).toEqual({ id: '1', urlId: '1' });
    expect(db.records.chats.get(created.id)?.description).toBe('Mintaprojekt');
    expect(await getMessagesByUrlIdRaw(db.database, created.urlId!)).toMatchObject({
      id: '1',
      description: 'Mintaprojekt',
    });
  });

  it('exports project files with chat history and imports them so the project can be reopened', async () => {
    const source = createMemoryDatabase({
      chats: [oldChat],
      snapshots: [{ chatId: oldChat.id, snapshot: oldSnapshot }],
    });

    const archive = await ImportExportService.exportAllChats(source.database);

    expect(archive.chats).toEqual([oldChat]);
    expect(archive.snapshots[oldChat.id]).toEqual(oldSnapshot);

    const target = createMemoryDatabase();
    const { result } = renderHook(() => useDataOperations({ customDb: target.database }));
    const archiveFile = new File([JSON.stringify(archive)], 'projects.json', { type: 'application/json' });

    await act(async () => {
      await result.current.handleImportChats(archiveFile);
    });

    expect(target.records.chats.get(oldChat.id)).toMatchObject({
      id: oldChat.id,
      urlId: oldChat.urlId,
      description: oldChat.description,
      messages: [{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'régi' }] }],
    });
    expect(target.records.snapshots.get(oldChat.id)).toEqual({ chatId: oldChat.id, snapshot: oldSnapshot });
    expect(await getMessagesByUrlIdRaw(target.database, oldChat.urlId)).toMatchObject({ id: oldChat.id });
    expect(await getSnapshot(target.database, oldChat.id)).toEqual(oldSnapshot);
  });

  it('undoes an import without dropping prior projects or leaving imported projects behind', async () => {
    const addedChat = { ...oldChat, id: '2', urlId: 'project-two', description: 'Új projekt' };
    const addedSnapshot = { chatIndex: 'new-index', files: { 'index.html': { type: 'file', content: 'új' } } };

    const db = createMemoryDatabase({
      chats: [oldChat],
      snapshots: [{ chatId: oldChat.id, snapshot: oldSnapshot }],
    });

    const { result } = renderHook(() => useDataOperations({ customDb: db.database }));

    const archive = {
      chats: [{ ...oldChat, description: 'Importált módosítás' }, addedChat],
      snapshots: { [oldChat.id]: addedSnapshot, [addedChat.id]: addedSnapshot },
    };

    await act(async () => {
      await result.current.handleImportChats(new File([JSON.stringify(archive)], 'import.json'));
    });

    expect(result.current.canUndo).toBe(true);
    expect(db.records.chats.get(oldChat.id)?.description).toBe('Importált módosítás');
    expect(db.records.chats.has(addedChat.id)).toBe(true);

    await act(async () => {
      await result.current.handleUndo();
    });

    expect(result.current.canUndo).toBe(false);
    expect(db.records.chats.get(oldChat.id)).toEqual(oldChat);
    expect(db.records.chats.has(addedChat.id)).toBe(false);
    expect(db.records.snapshots.get(oldChat.id)).toEqual({ chatId: oldChat.id, snapshot: oldSnapshot });
    expect(db.records.snapshots.has(addedChat.id)).toBe(false);
  });

  it('restores project snapshots after deleting all chats', async () => {
    const db = createMemoryDatabase({
      chats: [oldChat],
      snapshots: [{ chatId: oldChat.id, snapshot: oldSnapshot }],
    });

    const { result } = renderHook(() => useDataOperations({ customDb: db.database }));

    await act(async () => {
      await result.current.handleResetChats();
    });

    expect(db.records.chats.size).toBe(0);
    expect(db.records.snapshots.size).toBe(0);

    await act(async () => {
      await result.current.handleUndo();
    });

    expect(db.records.chats.get(oldChat.id)).toEqual(oldChat);
    expect(db.records.snapshots.get(oldChat.id)).toEqual({ chatId: oldChat.id, snapshot: oldSnapshot });
  });
});
