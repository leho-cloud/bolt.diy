import { generateId } from 'ai';
import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { useIndexedDB } from '~/lib/hooks/useIndexedDB';
import { invalidateChatCache } from '~/lib/persistence/chatCache';
import { ImportExportService } from '~/lib/services/importExportService';

/** Read only snapshots belonging to the exported chats, without using legacy localStorage. */
async function readProjectSnapshots(db: IDBDatabase, chatIds: string[]): Promise<Record<string, unknown>> {
  if (!db.objectStoreNames.contains('snapshots') || chatIds.length === 0) {
    return {};
  }

  return new Promise((resolve, reject) => {
    const result: Record<string, unknown> = {};
    const transaction = db.transaction('snapshots', 'readonly');
    const store = transaction.objectStore('snapshots');

    for (const id of chatIds) {
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result?.snapshot) {
          result[id] = request.result.snapshot;
        }
      };
    }

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function assertSnapshotMap(value: unknown, importedIds: Set<string>): Array<{ id: string; snapshot: unknown }> {
  if (value === undefined) {
    return [];
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Érvénytelen projektpillanatkép-formátum.');
  }

  return Object.entries(value as Record<string, unknown>).map(([id, snapshot]) => {
    if (!importedIds.has(id) || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new Error('A projektpillanatkép nem tartozik az importált beszélgetésekhez.');
    }

    const record = snapshot as Record<string, unknown>;

    if (
      typeof record.chatIndex !== 'string' ||
      !record.files ||
      typeof record.files !== 'object' ||
      Array.isArray(record.files)
    ) {
      throw new Error('A projektpillanatkép tartalma érvénytelen.');
    }

    return { id, snapshot };
  });
}

async function restoreChatsAndSnapshots(
  db: IDBDatabase,
  backup: { chats: any[]; snapshots?: Record<string, unknown> },
): Promise<void> {
  const storeNames = db.objectStoreNames.contains('snapshots') ? ['chats', 'snapshots'] : ['chats'];
  const transaction = db.transaction(storeNames, 'readwrite');
  const chatStore = transaction.objectStore('chats');

  for (const chat of backup.chats) {
    chatStore.put(chat);
  }

  if (storeNames.includes('snapshots')) {
    const snapshotStore = transaction.objectStore('snapshots');

    for (const [id, snapshot] of Object.entries(backup.snapshots ?? {})) {
      snapshotStore.put({ chatId: id, snapshot });
    }
  }

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  for (const chat of backup.chats) {
    invalidateChatCache(String(chat.id));

    if (chat.urlId) {
      invalidateChatCache(String(chat.urlId));
    }
  }
}

interface UseDataOperationsProps {
  /**
   * Callback to reload settings after import
   */
  onReloadSettings?: () => void;

  /**
   * Callback to reload chats after import
   */
  onReloadChats?: () => void;

  /**
   * Callback to reset settings to defaults
   */
  onResetSettings?: () => void;

  /**
   * Callback to reset chats
   */
  onResetChats?: () => void;

  /**
   * Custom database instance (optional)
   */
  customDb?: IDBDatabase;
}

/**
 * Hook for managing data operations in the DataTab
 */
export function useDataOperations({
  onReloadSettings,
  onReloadChats,
  onResetSettings,
  onResetChats,
  customDb,
}: UseDataOperationsProps = {}) {
  const { db: defaultDb } = useIndexedDB();

  // Use the custom database if provided, otherwise use the default
  const db = customDb || defaultDb;
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [lastOperation, setLastOperation] = useState<{ type: string; data: any } | null>(null);

  const canUndo = Boolean(
    lastOperation &&
    ['import-settings', 'import-chats', 'reset-settings', 'reset-chats', 'import-api-keys'].includes(
      lastOperation.type,
    ),
  );

  /**
   * Show progress toast with percentage
   */
  const showProgress = useCallback((message: string, percent: number) => {
    setProgressMessage(message);
    setProgressPercent(percent);

    // Dismiss any existing progress toast before showing a new one
    toast.dismiss('progress-toast');

    toast.loading(`${message} (${percent}%)`, {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast', // Use the same ID for all progress messages
    });
  }, []);

  /**
   * Export all settings to a JSON file
   */
  const handleExportSettings = useCallback(async () => {
    setIsExporting(true);
    setProgressPercent(0);

    // Dismiss any existing toast first
    toast.dismiss('progress-toast');

    toast.loading('Beállítások exportálásának előkészítése…', {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast',
    });

    try {
      // Step 1: Export settings
      showProgress('Beállítások exportálása', 25);

      const settingsData = await ImportExportService.exportSettings();

      // Step 2: Create blob
      showProgress('Fájl létrehozása', 50);

      const blob = new Blob([JSON.stringify(settingsData, null, 2)], {
        type: 'application/json',
      });

      // Step 3: Download file
      showProgress('Fájl letöltése', 75);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bolt-settings.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Step 4: Complete
      showProgress('Exportálás befejezése', 100);

      // Dismiss progress toast before showing success toast
      toast.dismiss('progress-toast');

      toast.success('A beállítások exportálása sikerült.', {
        position: 'bottom-right',
        autoClose: 3000,
      });

      // Save operation for potential undo
      setLastOperation({ type: 'export-settings', data: settingsData });
    } catch (error) {
      console.error('Error exporting settings:', error);

      // Dismiss progress toast before showing error toast
      toast.dismiss('progress-toast');

      toast.error(
        `Nem sikerült exportálni a beállításokat: ${error instanceof Error ? error.message : 'ismeretlen hiba'}`,
        {
          position: 'bottom-right',
          autoClose: 3000,
        },
      );
    } finally {
      setIsExporting(false);
      setProgressPercent(0);
      setProgressMessage('');
    }
  }, [showProgress]);

  /**
   * Export selected settings categories to a JSON file
   * @param categoryIds Array of category IDs to export
   */
  const handleExportSelectedSettings = useCallback(
    async (categoryIds: string[]) => {
      if (!categoryIds || categoryIds.length === 0) {
        toast.error('Nincs kiválasztott beállításcsoport.', {
          position: 'bottom-right',
          autoClose: 3000,
        });
        return;
      }

      setIsExporting(true);
      setProgressPercent(0);

      // Dismiss any existing toast first
      toast.dismiss('progress-toast');

      toast.loading(`${categoryIds.length} beállításcsoport exportálásának előkészítése…`, {
        position: 'bottom-right',
        autoClose: 3000,
        toastId: 'progress-toast',
      });

      try {
        // Step 1: Export all settings
        showProgress('Beállítások exportálása', 20);

        const allSettings = await ImportExportService.exportSettings();

        // Step 2: Filter settings by category
        showProgress('Kiválasztott csoportok szűrése', 40);

        const filteredSettings: Record<string, any> = {
          exportDate: allSettings.exportDate,
        };

        // Add selected categories to filtered settings
        categoryIds.forEach((category) => {
          if (allSettings[category]) {
            filteredSettings[category] = allSettings[category];
          }
        });

        // Step 3: Create blob
        showProgress('Fájl létrehozása', 60);

        const blob = new Blob([JSON.stringify(filteredSettings, null, 2)], {
          type: 'application/json',
        });

        // Step 4: Download file
        showProgress('Fájl letöltése', 80);

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bolt-settings-${categoryIds.join('-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Step 5: Complete
        showProgress('Exportálás befejezése', 100);

        // Dismiss progress toast before showing success toast
        toast.dismiss('progress-toast');

        toast.success(`${categoryIds.length} beállításcsoport exportálása sikerült.`, {
          position: 'bottom-right',
          autoClose: 3000,
        });

        // Save operation for potential undo
        setLastOperation({
          type: 'export-selected-settings',
          data: { settings: filteredSettings, categories: categoryIds },
        });
      } catch (error) {
        console.error('Error exporting selected settings:', error);

        // Dismiss progress toast before showing error toast
        toast.dismiss('progress-toast');

        toast.error(
          `Nem sikerült exportálni a beállításokat: ${error instanceof Error ? error.message : 'ismeretlen hiba'}`,
          {
            position: 'bottom-right',
            autoClose: 3000,
          },
        );
      } finally {
        setIsExporting(false);
        setProgressPercent(0);
        setProgressMessage('');
      }
    },
    [showProgress],
  );

  /**
   * Export all chats to a JSON file
   */
  const handleExportAllChats = useCallback(async () => {
    if (!db) {
      toast.error('Az adatbázis nem érhető el.', {
        position: 'bottom-right',
        autoClose: 3000,
      });
      return;
    }

    console.log('Export: Using database', {
      name: db.name,
      version: db.version,
      objectStoreNames: Array.from(db.objectStoreNames),
    });

    setIsExporting(true);
    setProgressPercent(0);

    // Dismiss any existing toast first
    toast.dismiss('progress-toast');

    toast.loading('Beszélgetések exportálásának előkészítése…', {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast',
    });

    try {
      // Step 1: Export chats
      showProgress('Beszélgetések lekérése az adatbázisból', 25);

      console.log('Database details:', {
        name: db.name,
        version: db.version,
        objectStoreNames: Array.from(db.objectStoreNames),
      });

      // Direct database query approach for more reliable access
      const directChats = await new Promise<any[]>((resolve, reject) => {
        try {
          console.log(`Creating transaction on '${db.name}' database, objectStore 'chats'`);

          const transaction = db.transaction(['chats'], 'readonly');
          const store = transaction.objectStore('chats');
          const request = store.getAll();

          request.onsuccess = () => {
            console.log(`Found ${request.result ? request.result.length : 0} chats directly from database`);
            resolve(request.result || []);
          };

          request.onerror = () => {
            console.error('Error querying chats store:', request.error);
            reject(request.error);
          };
        } catch (err) {
          console.error('Error creating transaction:', err);
          reject(err);
        }
      });

      // Keep the corresponding source-file snapshots alongside chat history.
      const snapshots = await readProjectSnapshots(
        db,
        directChats.map((chat) => String(chat.id)),
      );

      const exportData = {
        chats: directChats,
        snapshots,
        exportDate: new Date().toISOString(),
        formatVersion: 2,
      };

      console.log(`Preparing to export ${exportData.chats.length} chats`);

      // Step 2: Create blob
      showProgress('Fájl létrehozása', 50);

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });

      // Step 3: Download file
      showProgress('Fájl letöltése', 75);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bolt-chats.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Step 4: Complete
      showProgress('Exportálás befejezése', 100);

      // Dismiss progress toast before showing success toast
      toast.dismiss('progress-toast');

      toast.success(`${exportData.chats.length} beszélgetés exportálása sikerült.`, {
        position: 'bottom-right',
        autoClose: 3000,
      });

      // Save operation for potential undo
      setLastOperation({ type: 'export-chats', data: exportData });
    } catch (error) {
      console.error('Error exporting chats:', error);

      // Dismiss progress toast before showing error toast
      toast.dismiss('progress-toast');

      toast.error(
        `Nem sikerült exportálni a beszélgetéseket: ${error instanceof Error ? error.message : 'ismeretlen hiba'}`,
        {
          position: 'bottom-right',
          autoClose: 3000,
        },
      );
    } finally {
      setIsExporting(false);
      setProgressPercent(0);
      setProgressMessage('');
    }
  }, [db, showProgress]);

  /**
   * Export selected chats to a JSON file
   * @param chatIds Array of chat IDs to export
   */
  const handleExportSelectedChats = useCallback(
    async (chatIds: string[]) => {
      if (!db) {
        toast.error('Az adatbázis nem érhető el.', {
          position: 'bottom-right',
          autoClose: 3000,
        });
        return;
      }

      if (!chatIds || chatIds.length === 0) {
        toast.error('Nincs kiválasztott beszélgetés.', {
          position: 'bottom-right',
          autoClose: 3000,
        });
        return;
      }

      setIsExporting(true);
      setProgressPercent(0);

      // Dismiss any existing toast first
      toast.dismiss('progress-toast');

      toast.loading(`${chatIds.length} beszélgetés exportálásának előkészítése…`, {
        position: 'bottom-right',
        autoClose: 3000,
        toastId: 'progress-toast',
      });

      try {
        // Step 1: Get chats from database
        showProgress('Beszélgetések lekérése az adatbázisból', 25);

        const transaction = db.transaction(['chats'], 'readonly');
        const store = transaction.objectStore('chats');

        // Create an array to store the promises for getting each chat
        const chatPromises = chatIds.map((chatId) => {
          return new Promise<any>((resolve, reject) => {
            const request = store.get(chatId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        });

        // Wait for all promises to resolve
        const chats = await Promise.all(chatPromises);
        const filteredChats = chats.filter(Boolean); // Remove any null/undefined results

        console.log(`${filteredChats.length} beszélgetés exportálásra előkészítve`);

        // Preserve snapshots for exactly the selected projects.
        const snapshots = await readProjectSnapshots(
          db,
          filteredChats.map((chat) => String(chat.id)),
        );

        const exportData = {
          chats: filteredChats,
          snapshots,
          exportDate: new Date().toISOString(),
          formatVersion: 2,
        };

        // Step 2: Create blob
        showProgress('Fájl létrehozása', 50);

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
          type: 'application/json',
        });

        // Step 3: Download file
        showProgress('Fájl letöltése', 75);

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bolt-selected-chats.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Step 4: Complete
        showProgress('Exportálás befejezése', 100);

        // Dismiss progress toast before showing success toast
        toast.dismiss('progress-toast');

        toast.success(`${filteredChats.length} beszélgetés exportálása sikerült.`, {
          position: 'bottom-right',
          autoClose: 3000,
        });

        // Save operation for potential undo
        setLastOperation({ type: 'export-selected-chats', data: { chatIds, chats: filteredChats } });
      } catch (error) {
        console.error('Error exporting selected chats:', error);

        // Dismiss progress toast before showing error toast
        toast.dismiss('progress-toast');

        toast.error(
          `Nem sikerült exportálni a kijelölt beszélgetéseket: ${error instanceof Error ? error.message : 'ismeretlen hiba'}`,
          {
            position: 'bottom-right',
            autoClose: 3000,
          },
        );
      } finally {
        setIsExporting(false);
        setProgressPercent(0);
        setProgressMessage('');
      }
    },
    [db, showProgress],
  );

  /**
   * Import settings from a JSON file
   * @param file The file to import
   */
  const handleImportSettings = useCallback(
    async (file: File) => {
      setIsImporting(true);
      setProgressPercent(0);

      // Dismiss any existing toast first
      toast.dismiss('progress-toast');

      toast.loading(`Beállítások importálása ebből a fájlból: ${file.name}…`, {
        position: 'bottom-right',
        autoClose: 3000,
        toastId: 'progress-toast',
      });

      try {
        // Step 1: Read file
        showProgress('Fájl beolvasása', 20);

        const fileContent = await file.text();

        // Step 2: Parse JSON
        showProgress('Beállításfájl feldolgozása', 40);

        const importedData = JSON.parse(fileContent);

        // Step 3: Validate data
        showProgress('Beállítások ellenőrzése', 60);

        // Save current settings for potential undo
        const currentSettings = await ImportExportService.exportSettings();
        setLastOperation({ type: 'import-settings', data: { previous: currentSettings } });

        // Step 4: Import settings
        showProgress('Beállítások alkalmazása', 80);
        await ImportExportService.importSettings(importedData);

        // Step 5: Complete
        showProgress('Importálás befejezése', 100);

        // Dismiss progress toast before showing success toast
        toast.dismiss('progress-toast');

        toast.success('A beállítások importálása sikerült.', {
          position: 'bottom-right',
          autoClose: 3000,
        });

        if (onReloadSettings) {
          onReloadSettings();
        }
      } catch (error) {
        console.error('Error importing settings:', error);

        // Dismiss progress toast before showing error toast
        toast.dismiss('progress-toast');

        toast.error(
          `Nem sikerült importálni a beállításokat: ${error instanceof Error ? error.message : 'ismeretlen hiba'}`,
          {
            position: 'bottom-right',
            autoClose: 3000,
          },
        );
      } finally {
        setIsImporting(false);
        setProgressPercent(0);
        setProgressMessage('');
      }
    },
    [onReloadSettings, showProgress],
  );

  /**
   * Import chats from a JSON file
   * @param file The file to import
   */
  const handleImportChats = useCallback(
    async (file: File) => {
      if (!db) {
        toast.error('Az adatbázis nem érhető el.', {
          position: 'bottom-right',
          autoClose: 3000,
        });
        return;
      }

      setIsImporting(true);
      setProgressPercent(0);

      // Dismiss any existing toast first
      toast.dismiss('progress-toast');

      toast.loading(`Beszélgetések importálása ebből a fájlból: ${file.name}…`, {
        position: 'bottom-right',
        autoClose: 3000,
        toastId: 'progress-toast',
      });

      try {
        // Step 1: Read file
        showProgress('Fájl beolvasása', 20);

        const fileContent = await file.text();

        // Step 2: Parse JSON and validate structure
        showProgress('Beszélgetésfájl feldolgozása', 40);

        const importedData = JSON.parse(fileContent);

        if (!importedData.chats || !Array.isArray(importedData.chats)) {
          throw new Error('A beszélgetésfájl hibás: hiányzik vagy érvénytelen a beszélgetések listája.');
        }

        // Step 3: Validate each chat object
        showProgress('Beszélgetések ellenőrzése', 60);

        const validatedChats = importedData.chats.map((chat: any) => {
          if (!chat.id || !Array.isArray(chat.messages)) {
            throw new Error('A beszélgetés adatai hiányosak vagy érvénytelenek.');
          }

          // Ensure each message has required fields
          const validatedMessages = chat.messages.map((msg: any) => {
            if (!msg || typeof msg !== 'object' || !msg.role) {
              throw new Error('Az üzenet adatai hiányosak vagy érvénytelenek.');
            }

            /*
             * v4 messages carry `content`; v5+ carry `parts`. Accept either so
             * imports survive the AI SDK migration.
             */
            const hasPayload = Boolean(msg.content) || (Array.isArray(msg.parts) && msg.parts.length > 0);

            if (!hasPayload) {
              throw new Error('Az üzenet adatai hiányosak vagy érvénytelenek.');
            }

            /*
             * Copy every field through rather than a fixed key list, so parts,
             * annotations and attachments survive the round trip.
             */
            return {
              ...msg,
              id: msg.id || generateId(),
              timestamp: msg.timestamp || Date.now(),
            };
          });

          return {
            id: chat.id,
            description: chat.description || '',
            messages: validatedMessages,
            timestamp: chat.timestamp || new Date().toISOString(),
            urlId: chat.urlId || null,
            metadata: chat.metadata || null,
          };
        });

        // Validate all snapshots before opening the write transaction.
        const importedIds = new Set<string>(validatedChats.map((chat: { id: string }) => String(chat.id)));
        const snapshots = importedData.snapshots;
        const validatedSnapshots = assertSnapshotMap(snapshots, importedIds);

        const snapshotsChanged = snapshots !== undefined && db.objectStoreNames.contains('snapshots');

        if (validatedSnapshots.length > 0 && !snapshotsChanged) {
          throw new Error('A projektek fájlmentése nem érhető el az adatbázisban.');
        }

        // Step 4: Save current chats for potential undo
        showProgress('Adatbázis-művelet előkészítése', 70);

        const currentChats = await ImportExportService.exportAllChats(db);
        setLastOperation({
          type: 'import-chats',
          data: {
            previous: currentChats,
            importedIds: validatedChats.map((chat: { id: string }) => String(chat.id)),
            snapshotsChanged,
          },
        });

        // Step 5: Import chats
        showProgress(`${validatedChats.length} beszélgetés importálása`, 80);

        const transaction = db.transaction(snapshotsChanged ? ['chats', 'snapshots'] : ['chats'], 'readwrite');
        const store = transaction.objectStore('chats');
        const snapshotStore = snapshotsChanged ? transaction.objectStore('snapshots') : null;

        let processed = 0;

        for (const chat of validatedChats) {
          store.put(chat);
          processed++;

          if (processed % 5 === 0 || processed === validatedChats.length) {
            showProgress(
              `${processed}/${validatedChats.length} beszélgetés importálva`,
              80 + (processed / validatedChats.length) * 20,
            );
          }
        }

        if (snapshotStore) {
          for (const chat of validatedChats) {
            snapshotStore.delete(String(chat.id));
          }
        }

        for (const entry of validatedSnapshots) {
          snapshotStore?.put({ chatId: entry.id, snapshot: entry.snapshot });
        }

        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });

        for (const chat of validatedChats) {
          invalidateChatCache(String(chat.id));

          if (chat.urlId) {
            invalidateChatCache(String(chat.urlId));
          }
        }

        // Step 6: Complete
        showProgress('Importálás befejezése', 100);

        // Dismiss progress toast before showing success toast
        toast.dismiss('progress-toast');

        toast.success(`${validatedChats.length} beszélgetés importálása sikerült.`, {
          position: 'bottom-right',
          autoClose: 3000,
        });

        if (onReloadChats) {
          onReloadChats();
        }
      } catch (error) {
        console.error('Error importing chats:', error);

        // Dismiss progress toast before showing error toast
        toast.dismiss('progress-toast');

        toast.error(
          `Nem sikerült importálni a beszélgetéseket: ${error instanceof Error ? error.message : 'ismeretlen hiba'}`,
          {
            position: 'bottom-right',
            autoClose: 3000,
          },
        );
      } finally {
        setIsImporting(false);
        setProgressPercent(0);
        setProgressMessage('');
      }
    },
    [db, onReloadChats, showProgress],
  );

  /**
   * Import API keys from a JSON file
   * @param file The file to import
   */
  const handleImportAPIKeys = useCallback(
    async (file: File) => {
      setIsImporting(true);
      setProgressPercent(0);

      // Dismiss any existing toast first
      toast.dismiss('progress-toast');

      toast.loading(`API-kulcsok importálása ebből a fájlból: ${file.name}…`, {
        position: 'bottom-right',
        autoClose: 3000,
        toastId: 'progress-toast',
      });

      try {
        // Step 1: Read file
        showProgress('Fájl beolvasása', 20);

        const fileContent = await file.text();

        // Step 2: Parse JSON
        showProgress('API-kulcsfájl feldolgozása', 40);

        const importedData = JSON.parse(fileContent);

        // Step 3: Validate data
        showProgress('API-kulcsok ellenőrzése', 60);

        // Get current API keys from cookies for potential undo
        const apiKeysStr = document.cookie.split(';').find((row) => row.trim().startsWith('apiKeys='));
        const currentApiKeys = apiKeysStr ? JSON.parse(decodeURIComponent(apiKeysStr.split('=')[1])) : {};
        setLastOperation({ type: 'import-api-keys', data: { previous: currentApiKeys } });

        // Step 4: Import API keys
        showProgress('API-kulcsok alkalmazása', 80);

        const newKeys = ImportExportService.importAPIKeys(importedData);
        const apiKeysJson = JSON.stringify(newKeys);
        document.cookie = `apiKeys=${apiKeysJson}; path=/; max-age=31536000`;

        // Step 5: Complete
        showProgress('Importálás befejezése', 100);

        // Dismiss progress toast before showing success toast
        toast.dismiss('progress-toast');

        // Count how many keys were imported
        const keyCount = Object.keys(newKeys).length;

        const newKeyCount = Object.keys(newKeys).filter(
          (key) => !currentApiKeys[key] || currentApiKeys[key] !== newKeys[key],
        ).length;

        toast.success(
          `${keyCount} API-kulcs importálása sikerült (${newKeyCount} új vagy frissített).\n` +
            'Megjegyzés: a kulcsokat a böngésző tárolja. Szerveroldali használathoz add meg őket a .env.local fájlban.',
          { position: 'bottom-right', autoClose: 5000 },
        );

        if (onReloadSettings) {
          onReloadSettings();
        }
      } catch (error) {
        console.error('Error importing API keys:', error);

        // Dismiss progress toast before showing error toast
        toast.dismiss('progress-toast');

        toast.error(
          `Nem sikerült importálni az API-kulcsokat: ${error instanceof Error ? error.message : 'ismeretlen hiba'}`,
          {
            position: 'bottom-right',
            autoClose: 3000,
          },
        );
      } finally {
        setIsImporting(false);
        setProgressPercent(0);
        setProgressMessage('');
      }
    },
    [onReloadSettings, showProgress],
  );

  /**
   * Reset all settings to default values
   */
  const handleResetSettings = useCallback(async () => {
    setIsResetting(true);
    setProgressPercent(0);

    // Dismiss any existing toast first
    toast.dismiss('progress-toast');

    toast.loading('Beállítások visszaállítása…', {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast',
    });

    try {
      if (db) {
        // Step 1: Save current settings for potential undo
        showProgress('Jelenlegi beállítások mentése', 25);

        const currentSettings = await ImportExportService.exportSettings();
        setLastOperation({ type: 'reset-settings', data: { previous: currentSettings } });

        // Step 2: Reset settings
        showProgress('Beállítások visszaállítása az alapértékekre', 50);
        await ImportExportService.resetAllSettings();

        // Step 3: Complete
        showProgress('Visszaállítás befejezése', 100);

        // Dismiss progress toast before showing success toast
        toast.dismiss('progress-toast');

        toast.success('A beállítások visszaállítása sikerült.', {
          position: 'bottom-right',
          autoClose: 3000,
        });

        if (onResetSettings) {
          onResetSettings();
        }
      } else {
        // Dismiss progress toast before showing error toast
        toast.dismiss('progress-toast');

        toast.error('Az adatbázis nem érhető el.', {
          position: 'bottom-right',
          autoClose: 3000,
        });
      }
    } catch (error) {
      console.error('Error resetting settings:', error);

      // Dismiss progress toast before showing error toast
      toast.dismiss('progress-toast');

      toast.error(
        `Nem sikerült visszaállítani a beállításokat: ${error instanceof Error ? error.message : 'ismeretlen hiba'}`,
        {
          position: 'bottom-right',
          autoClose: 3000,
        },
      );
    } finally {
      setIsResetting(false);
      setProgressPercent(0);
      setProgressMessage('');
    }
  }, [db, onResetSettings, showProgress]);

  /**
   * Reset all chats
   */
  const handleResetChats = useCallback(async () => {
    if (!db) {
      toast.error('Az adatbázis nem érhető el.', {
        position: 'bottom-right',
        autoClose: 3000,
      });
      return;
    }

    setIsResetting(true);
    setProgressPercent(0);

    // Dismiss any existing toast first
    toast.dismiss('progress-toast');

    toast.loading('Összes beszélgetés törlése…', {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast',
    });

    try {
      // Step 1: Save current chats for potential undo
      showProgress('Jelenlegi beszélgetések és projektek mentése', 25);

      const currentChats = await ImportExportService.exportAllChats(db);
      setLastOperation({ type: 'reset-chats', data: { previous: currentChats } });

      // Step 2: Delete chats
      showProgress('Beszélgetések törlése az adatbázisból', 50);
      await ImportExportService.deleteAllChats(db);
      invalidateChatCache();

      // Step 3: Complete
      showProgress('Törlés befejezése', 100);

      // Dismiss progress toast before showing success toast
      toast.dismiss('progress-toast');

      toast.success('Az összes beszélgetés törölve.', {
        position: 'bottom-right',
        autoClose: 3000,
      });

      if (onResetChats) {
        onResetChats();
      }
    } catch (error) {
      console.error('Error resetting chats:', error);

      // Dismiss progress toast before showing error toast
      toast.dismiss('progress-toast');

      toast.error(
        `Nem sikerült törölni a beszélgetéseket: ${error instanceof Error ? error.message : 'ismeretlen hiba'}`,
        {
          position: 'bottom-right',
          autoClose: 3000,
        },
      );
    } finally {
      setIsResetting(false);
      setProgressPercent(0);
      setProgressMessage('');
    }
  }, [db, onResetChats, showProgress]);

  /**
   * Download API keys template
   */
  const handleDownloadTemplate = useCallback(async () => {
    setIsDownloadingTemplate(true);
    setProgressPercent(0);

    // Dismiss any existing toast first
    toast.dismiss('progress-toast');

    toast.loading('API-kulcssablon létrehozása…', {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast',
    });

    try {
      // Step 1: Create template
      showProgress('Sablon létrehozása', 50);

      const templateData = ImportExportService.createAPIKeysTemplate();

      // Step 2: Download file
      showProgress('Sablon letöltése', 75);

      const blob = new Blob([JSON.stringify(templateData, null, 2)], {
        type: 'application/json',
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bolt-api-keys-template.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Step 3: Complete
      showProgress('Letöltés befejezése', 100);

      // Dismiss progress toast before showing success toast
      toast.dismiss('progress-toast');

      toast.success('A sablon letöltése sikerült.', {
        position: 'bottom-right',
        autoClose: 3000,
      });
    } catch (error) {
      console.error('Error downloading template:', error);

      // Dismiss progress toast before showing error toast
      toast.dismiss('progress-toast');

      toast.error(`Nem sikerült letölteni a sablont: ${error instanceof Error ? error.message : 'ismeretlen hiba'}`, {
        position: 'bottom-right',
        autoClose: 3000,
      });
    } finally {
      setIsDownloadingTemplate(false);
      setProgressPercent(0);
      setProgressMessage('');
    }
  }, [showProgress]);

  /**
   * Export API keys to a JSON file
   */
  const handleExportAPIKeys = useCallback(async () => {
    setIsExporting(true);
    setProgressPercent(0);

    // Dismiss any existing toast first
    toast.dismiss('progress-toast');

    toast.loading('API-kulcsok exportálása…', {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast',
    });

    try {
      // Step 1: Get API keys from all sources
      showProgress('API-kulcsok lekérése', 25);

      // Create a fetch request to get API keys from server
      const response = await fetch('/api/export-api-keys');

      if (!response.ok) {
        throw new Error('Nem sikerült lekérni az API-kulcsokat a szerverről.');
      }

      const apiKeys = await response.json();

      // Step 2: Create blob
      showProgress('Fájl létrehozása', 50);

      const blob = new Blob([JSON.stringify(apiKeys, null, 2)], {
        type: 'application/json',
      });

      // Step 3: Download file
      showProgress('Fájl letöltése', 75);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bolt-api-keys.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Step 4: Complete
      showProgress('Exportálás befejezése', 100);

      // Dismiss progress toast before showing success toast
      toast.dismiss('progress-toast');

      toast.success('Az API-kulcsok exportálása sikerült.', {
        position: 'bottom-right',
        autoClose: 3000,
      });

      // Save operation for potential undo
      setLastOperation({ type: 'export-api-keys', data: apiKeys });
    } catch (error) {
      console.error('Error exporting API keys:', error);

      // Dismiss progress toast before showing error toast
      toast.dismiss('progress-toast');

      toast.error(
        `Nem sikerült exportálni az API-kulcsokat: ${error instanceof Error ? error.message : 'ismeretlen hiba'}`,
        {
          position: 'bottom-right',
          autoClose: 3000,
        },
      );
    } finally {
      setIsExporting(false);
      setProgressPercent(0);
      setProgressMessage('');
    }
  }, [showProgress]);

  /**
   * Undo the last operation if possible
   */
  const handleUndo = useCallback(async () => {
    if (!lastOperation || !db) {
      toast.error('Nincs visszavonható művelet.', {
        position: 'bottom-right',
        autoClose: 3000,
      });
      return;
    }

    // Dismiss any existing toast first
    toast.dismiss('progress-toast');

    toast.loading('Művelet visszavonása…', {
      position: 'bottom-right',
      autoClose: 3000,
      toastId: 'progress-toast',
    });

    try {
      switch (lastOperation.type) {
        case 'import-settings': {
          // Restore previous settings
          await ImportExportService.importSettings(lastOperation.data.previous);

          // Dismiss progress toast before showing success toast
          toast.dismiss('progress-toast');

          toast.success('A művelet visszavonása sikerült.', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          if (onReloadSettings) {
            onReloadSettings();
          }

          break;
        }

        case 'import-chats': {
          const previousById = new Map(
            (lastOperation.data.previous.chats as any[]).map((chat) => [String(chat.id), chat]),
          );

          const affectedIds = lastOperation.data.importedIds as string[];
          const hasSnapshots = db.objectStoreNames.contains('snapshots');
          const stores = hasSnapshots ? ['chats', 'snapshots'] : ['chats'];
          const transaction = db.transaction(stores, 'readwrite');
          const chatStore = transaction.objectStore('chats');
          const snapshotStore = hasSnapshots ? transaction.objectStore('snapshots') : null;
          const previousSnapshots = lastOperation.data.previous.snapshots ?? {};

          for (const id of affectedIds) {
            const previousChat = previousById.get(id);

            if (previousChat) {
              chatStore.put(previousChat);
            } else {
              chatStore.delete(id);
            }

            if (lastOperation.data.snapshotsChanged && snapshotStore) {
              snapshotStore.delete(id);

              const previousSnapshot = previousSnapshots[id];

              if (previousSnapshot) {
                snapshotStore.put({ chatId: id, snapshot: previousSnapshot });
              }
            }
          }

          await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
          });

          invalidateChatCache();

          // Dismiss progress toast before showing success toast
          toast.dismiss('progress-toast');

          toast.success('A művelet visszavonása sikerült.', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          if (onReloadChats) {
            onReloadChats();
          }

          break;
        }

        case 'reset-settings': {
          // Restore previous settings
          await ImportExportService.importSettings(lastOperation.data.previous);

          // Dismiss progress toast before showing success toast
          toast.dismiss('progress-toast');

          toast.success('A művelet visszavonása sikerült.', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          if (onReloadSettings) {
            onReloadSettings();
          }

          break;
        }

        case 'reset-chats': {
          await restoreChatsAndSnapshots(db, lastOperation.data.previous);

          // Dismiss progress toast before showing success toast
          toast.dismiss('progress-toast');

          toast.success('A művelet visszavonása sikerült.', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          if (onReloadChats) {
            onReloadChats();
          }

          break;
        }

        case 'import-api-keys': {
          // Restore previous API keys
          const previousAPIKeys = lastOperation.data.previous;
          const newKeys = ImportExportService.importAPIKeys(previousAPIKeys);
          const apiKeysJson = JSON.stringify(newKeys);
          document.cookie = `apiKeys=${apiKeysJson}; path=/; max-age=31536000`;

          // Dismiss progress toast before showing success toast
          toast.dismiss('progress-toast');

          toast.success('A művelet visszavonása sikerült.', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          if (onReloadSettings) {
            onReloadSettings();
          }

          break;
        }

        default:
          // Dismiss progress toast before showing error toast
          toast.dismiss('progress-toast');

          toast.error('Ez a művelet nem vonható vissza.', {
            position: 'bottom-right',
            autoClose: 3000,
          });
      }

      // Clear the last operation after undoing
      setLastOperation(null);
    } catch (error) {
      console.error('Error undoing operation:', error);

      // Dismiss progress toast before showing error toast
      toast.dismiss('progress-toast');

      toast.error(
        `Nem sikerült visszavonni a műveletet: ${error instanceof Error ? error.message : 'ismeretlen hiba'}`,
        {
          position: 'bottom-right',
          autoClose: 3000,
        },
      );
    }
  }, [lastOperation, db, onReloadSettings, onReloadChats]);

  return {
    isExporting,
    isImporting,
    isResetting,
    isDownloadingTemplate,
    progressMessage,
    progressPercent,
    lastOperation,
    canUndo,
    handleExportSettings,
    handleExportSelectedSettings,
    handleExportAllChats,
    handleExportSelectedChats,
    handleImportSettings,
    handleImportChats,
    handleImportAPIKeys,
    handleResetSettings,
    handleResetChats,
    handleDownloadTemplate,
    handleExportAPIKeys,
    handleUndo,
  };
}
