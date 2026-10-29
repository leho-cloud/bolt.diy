import { motion } from 'framer-motion';
import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '~/components/ui/Card';
import { ConfirmationDialog, SelectionDialog } from '~/components/ui/Dialog';
import { useDataOperations } from '~/lib/hooks/useDataOperations';
import { getAllChats, type Chat } from '~/lib/persistence/chats';
import { openDatabase } from '~/lib/persistence/db';
import { classNames } from '~/utils/classNames';

// Create a custom hook to connect to the boltHistory database
function useBoltHistoryDB() {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const initDB = async () => {
      try {
        setIsLoading(true);

        const database = await openDatabase();
        setDb(database || null);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Ismeretlen hiba az adatbázis indításakor'));
        setIsLoading(false);
      }
    };

    initDB();

    return () => {
      if (db) {
        db.close();
      }
    };
  }, []);

  return { db, isLoading, error };
}

// Extend the Chat interface to include the missing properties
interface ExtendedChat extends Chat {
  title?: string;
  updatedAt?: number;
}

// Helper function to create a chat label and description
function createChatItem(chat: Chat): ChatItem {
  return {
    id: chat.id,

    // Use description as title if available, or format a short ID
    label: (chat as ExtendedChat).title || chat.description || `Beszélgetés ${chat.id.slice(0, 8)}`,

    // Format the description with message count and timestamp
    description: `${chat.messages.length} üzenet · Utolsó módosítás: ${new Date((chat as ExtendedChat).updatedAt || Date.parse(chat.timestamp)).toLocaleString('hu-HU')}`,
  };
}

interface SettingsCategory {
  id: string;
  label: string;
  description: string;
}

interface ChatItem {
  id: string;
  label: string;
  description: string;
}

export function DataTab() {
  // Use our custom hook for the boltHistory database
  const { db, isLoading: dbLoading } = useBoltHistoryDB();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  // State for confirmation dialogs
  const [showResetInlineConfirm, setShowResetInlineConfirm] = useState(false);
  const [showDeleteInlineConfirm, setShowDeleteInlineConfirm] = useState(false);
  const [showSettingsSelection, setShowSettingsSelection] = useState(false);
  const [showChatsSelection, setShowChatsSelection] = useState(false);

  // State for settings categories and available chats
  const [settingsCategories] = useState<SettingsCategory[]>([
    { id: 'core', label: 'Alapbeállítások', description: 'Felhasználói profil és fő beállítások' },
    { id: 'features', label: 'Funkciók', description: 'Funkciókapcsolók és beállítások' },
    { id: 'ui', label: 'Felület', description: 'Felületbeállítások és megjelenés' },
    { id: 'connections', label: 'Kapcsolatok', description: 'Külső szolgáltatások kapcsolatai' },
    { id: 'debug', label: 'Hibakeresés', description: 'Hibakeresési beállítások és naplók' },
    { id: 'updates', label: 'Frissítések', description: 'Frissítési beállítások és értesítések' },
  ]);

  const [availableChats, setAvailableChats] = useState<ExtendedChat[]>([]);
  const [chatItems, setChatItems] = useState<ChatItem[]>([]);

  // Data operations hook with boltHistory database
  const {
    isExporting,
    isImporting,
    isResetting,
    canUndo,
    handleUndo,
    handleExportSettings,
    handleExportSelectedSettings,
    handleExportAllChats,
    handleExportSelectedChats,
    handleImportSettings,
    handleImportChats,
    handleResetSettings,
    handleResetChats,
  } = useDataOperations({
    customDb: db || undefined, // Pass the boltHistory database, converting null to undefined
    onReloadSettings: () => window.location.reload(),
    onReloadChats: () => {
      // Reload chats after reset
      if (db) {
        getAllChats(db).then((chats) => {
          // Cast to ExtendedChat to handle additional properties
          const extendedChats = chats as ExtendedChat[];
          setAvailableChats(extendedChats);
          setChatItems(extendedChats.map((chat) => createChatItem(chat)));
        });
      }
    },
    onResetSettings: () => setShowResetInlineConfirm(false),
    onResetChats: () => setShowDeleteInlineConfirm(false),
  });

  // Loading states for operations not provided by the hook
  const [isDeleting, setIsDeleting] = useState(false);

  // Load available chats
  useEffect(() => {
    if (db) {
      console.log('Loading chats from boltHistory database', {
        name: db.name,
        version: db.version,
        objectStoreNames: Array.from(db.objectStoreNames),
      });

      getAllChats(db)
        .then((chats) => {
          console.log('Found chats:', chats.length);

          // Cast to ExtendedChat to handle additional properties
          const extendedChats = chats as ExtendedChat[];
          setAvailableChats(extendedChats);

          // Create ChatItems for selection dialog
          setChatItems(extendedChats.map((chat) => createChatItem(chat)));
        })
        .catch((error) => {
          console.error('Error loading chats:', error);
          toast.error(
            'Nem sikerült betölteni a beszélgetéseket: ' + (error instanceof Error ? error.message : 'ismeretlen hiba'),
          );
        });
    }
  }, [db]);

  // Handle file input changes
  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (file) {
        handleImportSettings(file);
      }
    },
    [handleImportSettings],
  );

  const handleChatFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (file) {
        handleImportChats(file);
      }
    },
    [handleImportChats],
  );

  // Wrapper for reset chats to handle loading state
  const handleResetChatsWithState = useCallback(() => {
    setIsDeleting(true);
    handleResetChats().finally(() => setIsDeleting(false));
  }, [handleResetChats]);

  return (
    <div className="space-y-12">
      {canUndo && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-bolt-elements-textPrimary">Az utolsó művelet visszavonható.</p>
          <Button variant="outline" size="sm" onClick={handleUndo}>
            Utolsó művelet visszavonása
          </Button>
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileInputChange} className="hidden" />
      <input
        ref={chatFileInputRef}
        type="file"
        accept=".json"
        onChange={handleChatFileInputChange}
        className="hidden"
      />

      {/* Reset Settings Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showResetInlineConfirm}
        onClose={() => setShowResetInlineConfirm(false)}
        title="Visszaállítod az összes beállítást?"
        description="Minden beállítás visszaáll az alapértékére. Ez a művelet nem vonható vissza."
        confirmLabel="Beállítások visszaállítása"
        cancelLabel="Mégse"
        variant="destructive"
        isLoading={isResetting}
        onConfirm={handleResetSettings}
      />

      {/* Delete Chats Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteInlineConfirm}
        onClose={() => setShowDeleteInlineConfirm(false)}
        title="Törlöd az összes beszélgetést?"
        description="Az összes beszélgetési előzmény véglegesen törlődik. Ez a művelet nem vonható vissza."
        confirmLabel="Összes törlése"
        cancelLabel="Mégse"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleResetChatsWithState}
      />

      {/* Settings Selection Dialog */}
      <SelectionDialog
        isOpen={showSettingsSelection}
        onClose={() => setShowSettingsSelection(false)}
        title="Válaszd ki az exportálandó beállításokat"
        items={settingsCategories}
        onConfirm={(selectedIds) => {
          handleExportSelectedSettings(selectedIds);
          setShowSettingsSelection(false);
        }}
        confirmLabel="Kijelöltek exportálása"
      />

      {/* Chats Selection Dialog */}
      <SelectionDialog
        isOpen={showChatsSelection}
        onClose={() => setShowChatsSelection(false)}
        title="Válaszd ki az exportálandó beszélgetéseket"
        items={chatItems}
        onConfirm={(selectedIds) => {
          handleExportSelectedChats(selectedIds);
          setShowChatsSelection(false);
        }}
        confirmLabel="Kijelöltek exportálása"
      />

      {/* Chats Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-bolt-elements-textPrimary">Beszélgetések</h2>
        {dbLoading ? (
          <div className="flex items-center justify-center p-4">
            <div className="i-ph-spinner-gap-bold animate-spin w-6 h-6 mr-2" />
            <span>Beszélgetési adatbázis betöltése…</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="bg-bolt-elements-background-depth-2 transition-colors hover:bg-bolt-elements-background-depth-3">
              <CardHeader>
                <div className="flex items-center mb-2">
                  <motion.div className="text-accent-500 mr-2" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <div className="i-ph-download-duotone w-5 h-5" />
                  </motion.div>
                  <CardTitle className="text-lg group-hover:text-bolt-elements-item-contentAccent transition-colors">
                    Összes beszélgetés exportálása
                  </CardTitle>
                </div>
                <CardDescription>Az összes beszélgetés exportálása JSON-fájlba.</CardDescription>
              </CardHeader>
              <CardFooter>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                  <Button
                    onClick={async () => {
                      try {
                        if (!db) {
                          toast.error('Az adatbázis nem érhető el.');
                          return;
                        }

                        console.log('Database information:', {
                          name: db.name,
                          version: db.version,
                          objectStoreNames: Array.from(db.objectStoreNames),
                        });

                        if (availableChats.length === 0) {
                          toast.warning('Nincs exportálható beszélgetés.');
                          return;
                        }

                        await handleExportAllChats();
                      } catch (error) {
                        console.error('Error exporting chats:', error);
                        toast.error(
                          `Nem sikerült exportálni a beszélgetéseket: ${error instanceof Error ? error.message : 'ismeretlen hiba'}`,
                        );
                      }
                    }}
                    disabled={isExporting || availableChats.length === 0}
                    variant="outline"
                    size="sm"
                    className={classNames(
                      'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                      isExporting || availableChats.length === 0 ? 'cursor-not-allowed' : '',
                    )}
                  >
                    {isExporting ? (
                      <>
                        <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                        Exportálás…
                      </>
                    ) : availableChats.length === 0 ? (
                      'Nincs exportálható beszélgetés'
                    ) : (
                      'Összes exportálása'
                    )}
                  </Button>
                </motion.div>
              </CardFooter>
            </Card>

            <Card className="bg-bolt-elements-background-depth-2 transition-colors hover:bg-bolt-elements-background-depth-3">
              <CardHeader>
                <div className="flex items-center mb-2">
                  <motion.div className="text-accent-500 mr-2" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <div className="i-ph:list-checks w-5 h-5" />
                  </motion.div>
                  <CardTitle className="text-lg group-hover:text-bolt-elements-item-contentAccent transition-colors">
                    Kijelölt beszélgetések exportálása
                  </CardTitle>
                </div>
                <CardDescription>Válaszd ki az exportálandó beszélgetéseket.</CardDescription>
              </CardHeader>
              <CardFooter>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                  <Button
                    onClick={() => setShowChatsSelection(true)}
                    disabled={isExporting || chatItems.length === 0}
                    variant="outline"
                    size="sm"
                    className={classNames(
                      'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                      isExporting || chatItems.length === 0 ? 'cursor-not-allowed' : '',
                    )}
                  >
                    {isExporting ? (
                      <>
                        <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                        Exportálás…
                      </>
                    ) : (
                      'Beszélgetések kiválasztása'
                    )}
                  </Button>
                </motion.div>
              </CardFooter>
            </Card>

            <Card className="bg-bolt-elements-background-depth-2 transition-colors hover:bg-bolt-elements-background-depth-3">
              <CardHeader>
                <div className="flex items-center mb-2">
                  <motion.div className="text-accent-500 mr-2" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <div className="i-ph-upload-duotone w-5 h-5" />
                  </motion.div>
                  <CardTitle className="text-lg group-hover:text-bolt-elements-item-contentAccent transition-colors">
                    Beszélgetések importálása
                  </CardTitle>
                </div>
                <CardDescription>Beszélgetések importálása JSON-fájlból.</CardDescription>
              </CardHeader>
              <CardFooter>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                  <Button
                    onClick={() => chatFileInputRef.current?.click()}
                    disabled={isImporting}
                    variant="outline"
                    size="sm"
                    className={classNames(
                      'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                      isImporting ? 'cursor-not-allowed' : '',
                    )}
                  >
                    {isImporting ? (
                      <>
                        <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                        Importálás…
                      </>
                    ) : (
                      'Beszélgetések importálása'
                    )}
                  </Button>
                </motion.div>
              </CardFooter>
            </Card>
          </div>
        )}
      </div>

      {/* Settings Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-bolt-elements-textPrimary">Beállítások</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="bg-bolt-elements-background-depth-2 transition-colors hover:bg-bolt-elements-background-depth-3">
            <CardHeader>
              <div className="flex items-center mb-2">
                <motion.div className="text-accent-500 mr-2" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <div className="i-ph-download-duotone w-5 h-5" />
                </motion.div>
                <CardTitle className="text-lg group-hover:text-bolt-elements-item-contentAccent transition-colors">
                  Összes beállítás exportálása
                </CardTitle>
              </div>
              <CardDescription>Az összes beállítás exportálása JSON-fájlba.</CardDescription>
            </CardHeader>
            <CardFooter>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                <Button
                  onClick={handleExportSettings}
                  disabled={isExporting}
                  variant="outline"
                  size="sm"
                  className={classNames(
                    'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                    isExporting ? 'cursor-not-allowed' : '',
                  )}
                >
                  {isExporting ? (
                    <>
                      <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                      Exportálás…
                    </>
                  ) : (
                    'Összes exportálása'
                  )}
                </Button>
              </motion.div>
            </CardFooter>
          </Card>

          <Card className="bg-bolt-elements-background-depth-2 transition-colors hover:bg-bolt-elements-background-depth-3">
            <CardHeader>
              <div className="flex items-center mb-2">
                <motion.div className="text-accent-500 mr-2" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <div className="i-ph:funnel-duotone w-5 h-5" />
                </motion.div>
                <CardTitle className="text-lg group-hover:text-bolt-elements-item-contentAccent transition-colors">
                  Kijelölt beállítások exportálása
                </CardTitle>
              </div>
              <CardDescription>Válaszd ki az exportálandó beállításokat.</CardDescription>
            </CardHeader>
            <CardFooter>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                <Button
                  onClick={() => setShowSettingsSelection(true)}
                  disabled={isExporting || settingsCategories.length === 0}
                  variant="outline"
                  size="sm"
                  className={classNames(
                    'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                    isExporting || settingsCategories.length === 0 ? 'cursor-not-allowed' : '',
                  )}
                >
                  {isExporting ? (
                    <>
                      <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                      Exportálás…
                    </>
                  ) : (
                    'Beállítások kiválasztása'
                  )}
                </Button>
              </motion.div>
            </CardFooter>
          </Card>

          <Card className="bg-bolt-elements-background-depth-2 transition-colors hover:bg-bolt-elements-background-depth-3">
            <CardHeader>
              <div className="flex items-center mb-2">
                <motion.div className="text-accent-500 mr-2" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <div className="i-ph-upload-duotone w-5 h-5" />
                </motion.div>
                <CardTitle className="text-lg group-hover:text-bolt-elements-item-contentAccent transition-colors">
                  Beállítások importálása
                </CardTitle>
              </div>
              <CardDescription>Beállítások importálása JSON-fájlból.</CardDescription>
            </CardHeader>
            <CardFooter>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="w-full">
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  variant="outline"
                  size="sm"
                  className={classNames(
                    'hover:text-bolt-elements-item-contentAccent hover:border-bolt-elements-item-backgroundAccent hover:bg-bolt-elements-item-backgroundAccent transition-colors w-full justify-center',
                    isImporting ? 'cursor-not-allowed' : '',
                  )}
                >
                  {isImporting ? (
                    <>
                      <div className="i-ph-spinner-gap-bold animate-spin w-4 h-4 mr-2" />
                      Importálás…
                    </>
                  ) : (
                    'Beállítások importálása'
                  )}
                </Button>
              </motion.div>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Danger Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-red-500 dark:text-red-400">Veszélyes műveletek</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="border-red-500/30 bg-bolt-elements-background-depth-2">
            <CardHeader>
              <div className="flex items-center mb-2">
                <div className="i-ph-trash-duotone w-5 h-5 text-red-500 dark:text-red-400 mr-2" />
                <CardTitle className="text-lg">Összes beszélgetés törlése</CardTitle>
              </div>
              <CardDescription>Az összes beszélgetési előzmény végleges törlése.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button
                onClick={() => setShowDeleteInlineConfirm(true)}
                disabled={isDeleting || chatItems.length === 0}
                variant="destructive"
                size="sm"
                className="w-full justify-center"
              >
                {isDeleting ? 'Törlés…' : 'Összes beszélgetés törlése'}
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-red-500/30 bg-bolt-elements-background-depth-2">
            <CardHeader>
              <div className="flex items-center mb-2">
                <div className="i-ph-arrow-counter-clockwise-duotone w-5 h-5 text-red-500 dark:text-red-400 mr-2" />
                <CardTitle className="text-lg">Összes beállítás visszaállítása</CardTitle>
              </div>
              <CardDescription>Minden beállítás visszaállítása az alapértékére.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button
                onClick={() => setShowResetInlineConfirm(true)}
                disabled={isResetting}
                variant="destructive"
                size="sm"
                className="w-full justify-center"
              >
                {isResetting ? 'Visszaállítás…' : 'Összes beállítás visszaállítása'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
