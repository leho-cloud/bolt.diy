import { useEffect, useState } from 'react';
import { EmptyState } from '~/components/ui/EmptyState';
import { projectSummary } from '~/lib/common/projectSummary';
import type { ChatHistoryItem } from '~/lib/persistence';
import { getAll, getSnapshot, openDatabase } from '~/lib/persistence/db';

type Entry = { chat: ChatHistoryItem; hasFiles: boolean; fileCount: number };

export function ProjectLibrary() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
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
  }, []);

  const projects = entries.filter((entry) => entry.hasFiles);
  const conversations = entries.filter((entry) => !entry.hasFiles);

  return (
    <section id="sajat-projektek" className="muhely-library" aria-label="Saját projektek">
      <div className="muhely-section-heading">
        <div>
          <span className="muhely-eyebrow">FOLYTASD, AHOL ABBAHAGYTAD</span>
          <h2>
            Saját projektjeid <span>{projects.length}</span>
          </h2>
        </div>
        <span className="muhely-local-note">
          <span className="i-ph:desktop" /> Ebben a böngészőben
        </span>
      </div>
      {state === 'loading' ? (
        <p className="muhely-library-note" role="status">
          Projektek betöltése…
        </p>
      ) : state === 'error' ? (
        <EmptyState
          title="A projektlista most nem érhető el"
          description="A mentett munkáidat a bal oldali menüben is megnyithatod."
          variant="compact"
        />
      ) : projects.length === 0 ? (
        <EmptyState
          icon="i-ph:browser"
          className="muhely-library-empty"
          title="Itt lesznek a saját oldalaid"
          description="Írd le fent az ötletedet, vagy indulj az alábbi kész alapok egyikéből."
          variant="compact"
        />
      ) : (
        <div className="muhely-project-grid">
          {projects.slice(0, 6).map(({ chat, fileCount }, index) => (
            <a key={chat.id} href={`/chat/${encodeURIComponent(chat.urlId!)}`} className="muhely-project-card">
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
                  {fileCount} mentett fájl <span aria-hidden="true">↗</span>
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
      {conversations.length > 0 && (
        <details className="muhely-conversations">
          <summary>
            Beszélgetések és üres munkaterületek <span>{conversations.length}</span>
          </summary>
          <p>Ezekben még nincs mentett weboldal. Bármikor folytathatod őket.</p>
          <div>
            {conversations.map(({ chat }) => (
              <a href={`/chat/${encodeURIComponent(chat.urlId!)}`} key={chat.id}>
                <span className="i-ph:chat-circle" />
                {chat.description}
                <span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
