import { uiText } from '~/lib/common/localization/ui';
import { useEffect, useState } from 'react';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
import { projectSummary } from '~/lib/common/projectSummary';
import type { ChatHistoryItem } from '~/lib/persistence';
import { invalidateChatCache } from '~/lib/persistence/chatCache';
import { deleteById, getAll, getSnapshot, openDatabase } from '~/lib/persistence/db';

type Entry = { chat: ChatHistoryItem; hasFiles: boolean; fileCount: number };

export function ProjectLibrary() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('muhely-projects-changed', refresh);

    return () => window.removeEventListener('muhely-projects-changed', refresh);
  }, []);
  useEffect(() => {
    let current = true;
    void (async () => {
      const database = await openDatabase();

      if (!database) {
        throw new Error('Database unavailable');
      }

      const chats = (await getAll(database)).filter((chat) => chat.urlId && chat.description);

      const items = await Promise.all(
        chats.map(async (chat) => ({ chat, ...projectSummary(chat.messages, await getSnapshot(database, chat.id)) })),
      );

      if (current) {
        setEntries(items.reverse());
        setState('ready');
      }
    })().catch(() => {
      if (current) {
        setState('error');
      }
    });

    return () => {
      current = false;
    };
  }, [revision]);

  const removeProject = async () => {
    if (!pendingDelete || deleting) {
      return;
    }

    setDeleting(true);
    setFeedback('');

    try {
      const database = await openDatabase();

      if (!database) {
        throw new Error('Database unavailable');
      }

      await deleteById(database, pendingDelete.chat.id);
      invalidateChatCache(pendingDelete.chat.id);

      if (pendingDelete.chat.urlId) {
        invalidateChatCache(pendingDelete.chat.urlId);
      }

      setEntries((items) => items.filter((item) => item.chat.id !== pendingDelete.chat.id));
      setPendingDelete(null);
      setFeedback(uiText("A mentett munka törölve.", "Saved project deleted."));
      window.dispatchEvent(new Event('muhely-projects-changed'));
    } catch {
      setFeedback(uiText("A törlés nem sikerült. A mentett munka megmaradt; próbáld újra.", "Could not delete the project. Your work is still saved. Try again."));
    } finally {
      setDeleting(false);
    }
  };

  const projects = entries.filter((entry) => entry.hasFiles);
  const conversations = entries.filter((entry) => !entry.hasFiles);

  return (
    <section id="sajat-projektek" className="muhely-library" aria-label={uiText("Saját projektek", "My projects")}>
      <ConfirmationDialog
        isOpen={pendingDelete !== null}
        onClose={() => {
          if (!deleting) {
            setPendingDelete(null);
          }
        }}
        onConfirm={() => void removeProject()}
        title={pendingDelete?.hasFiles ? uiText("Projekt törlése?", "Delete project?") : uiText("Beszélgetés törlése?", "Delete conversation?")}
        description={`„${pendingDelete?.chat.description || ''}” és a hozzá tartozó mentett fájlok törlődnek ebből a böngészőből. Ez nem vonható vissza. A már közzétett weboldal megmarad.`}
        confirmLabel={deleting ? uiText("Törlés…", "Deleting…") : uiText("Végleges törlés", "Delete permanently")}
        variant="destructive"
        isLoading={deleting}
      />
      {feedback && (
        <p role="status" className="muhely-library-note">
          {feedback}
        </p>
      )}
      <div className="muhely-section-heading">
        <div>
          <span className="muhely-eyebrow">FOLYTASD, AHOL ABBAHAGYTAD</span>
          <h2>
            {uiText("Saját projektjeid", "Your projects")} <span>{projects.length}</span>
          </h2>
        </div>
        <span className="muhely-local-note">
          <span className="i-ph:desktop" /> {uiText("Ebben a böngészőben", "In this browser")}
        </span>
      </div>
      {state === 'loading' ? (
        <p className="muhely-library-note" role="status">
          {uiText("Projektek betöltése…", "Loading projects…")}
        </p>
      ) : state === 'error' ? (
        <EmptyState
          title={uiText("A projektlista most nem érhető el", "Projects are currently unavailable")}
          description={uiText("A mentett munkáidat a bal oldali menüben is megnyithatod.", "Open saved projects from the left menu.")}
          variant="compact"
        />
      ) : projects.length === 0 ? (
        <EmptyState
          icon="i-ph:browser"
          className="muhely-library-empty"
          title={uiText("Itt lesznek a saját oldalaid", "Your projects will appear here")}
          description={uiText("Írd le fent az ötletedet, vagy indulj az alábbi kész alapok egyikéből.", "Describe your idea above or choose a starter template below.")}
          variant="compact"
        />
      ) : (
        <div className="muhely-project-grid">
          {projects.slice(0, 6).map((entry, index) => {
            const { chat, fileCount } = entry;
            return (
              <article key={chat.id} className="muhely-project-card">
                <a href={`/chat/${encodeURIComponent(chat.urlId!)}`}>
                  <div className={`muhely-project-art muhely-art-${index % 3}`} aria-hidden="true">
                    <span className="muhely-mini-browser">
                      <span />
                      <span />
                      <span />
                      <i />
                      <b />
                      <em />
                    </span>
                  </div>
                  <div className="muhely-project-info">
                    <span className="muhely-project-kind">
                      <span className="i-ph:browser" /> Mentett projekt
                    </span>
                    <h3>{chat.description}</h3>
                    <span>
                      {fileCount} {uiText('mentett fájl', fileCount === 1 ? 'saved file' : 'saved files')} <span aria-hidden="true">↗</span>
                    </span>
                  </div>
                </a>
                <button
                  type="button"
                  className="muhely-delete-project"
                  aria-label={`${chat.description} törlése`}
                  onClick={() => {
                    setFeedback('');
                    setPendingDelete(entry);
                  }}
                >
                  <span className="i-ph:trash" aria-hidden="true" /> {uiText("Törlés", "Delete")}
                </button>
              </article>
            );
          })}
        </div>
      )}
      {conversations.length > 0 && (
        <details className="muhely-conversations">
          <summary>
            {uiText("Beszélgetések és üres munkaterületek", "Conversations and empty projects")} <span>{conversations.length}</span>
          </summary>
          <p>{uiText("Ezekben még nincs mentett weboldal. Bármikor folytathatod őket.", "These projects have no saved website yet. You can continue them at any time.")}</p>
          <div>
            {conversations.map((entry) => (
              <div className="muhely-conversation-row" key={entry.chat.id}>
                <a href={`/chat/${encodeURIComponent(entry.chat.urlId!)}`}>
                  <span className="i-ph:chat-circle" />
                  {entry.chat.description}
                  <span aria-hidden="true">↗</span>
                </a>
                <button
                  type="button"
                  className="muhely-delete-project"
                  aria-label={`${entry.chat.description} törlése`}
                  onClick={() => {
                    setFeedback('');
                    setPendingDelete(entry);
                  }}
                >
                  <span className="i-ph:trash" aria-hidden="true" /> {uiText("Törlés", "Delete")}
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
